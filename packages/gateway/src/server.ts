/**
 * VSMONSTER Gateway Server
 * Uses @vsmonster/holography as the communication core.
 *
 * This file orchestrates startup, event wiring, and shutdown.
 * Middleware, routes, page templates, extension message handling, and media
 * ingestion are each extracted into dedicated modules for maintainability.
 */

import {
  HolographyServer,
  HolographyServerConfig,
  ChannelType,
  IncomingMessage,
  LineChannel,
} from '@vsmonster/holography';
import { loadConfig } from './config/loader';
import { TaskManager, isValidTaskId } from './task/manager';
import { CommandProcessor } from './commands/processor';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { SoulManager } from './soul/manager';
import { logger } from './utils/logger';
import { throttle } from './utils/debounce';
import { withRetry } from './utils/retry';
import { Express } from 'express';
import * as net from 'net';
import mediaRouter from './routes/media.routes';
import { initializeMediaUrl } from './services/media.service';
import { getMediaDatabase } from './db/media-database';

// Extracted modules
import { setupMiddleware } from './middleware';
import { registerApiRoutes } from './routes/api.routes';
import { renderSendMessagePage, renderTestPage } from './pages';
import { handleExtensionMessage } from './handlers/extension-message';
import { ingestIncomingMedia } from './handlers/media-ingestion';
import { createStillProcessingBubble, parsePostbackData } from './line/flex-templates';

export class HolographyGateway {
  private holography: HolographyServer;
  private config: ReturnType<typeof loadConfig>;

  private taskManager: TaskManager;
  private commandProcessor: CommandProcessor;
  private tunnelService: TunnelService;
  private copilotBridge: CopilotBridge;
  private mcpController: MCPController;
  private soulManager: SoulManager;
  private offlineGreetingLastSent: Map<string, number> = new Map();
  private readonly offlineGreetingCooldownMs = 15000;

  // LINE long-task support: replyToken expires ~60s. We reply a "still thinking"
  // notice before expiry, then push a "result ready" notify when done.
  private readonly lineTaskTimeoutMs = 55000;
  private readonly lineLoadingDurationSeconds = 60;
  private lineTaskTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor() {
    this.config = loadConfig();

    // Build Holography server configuration
    const holographyConfig: HolographyServerConfig = {
      port: this.config.port || 3000,
      wsPort: (this.config.port || 3000) + 1,
      channels: {
        line: this.config.channels.line ? {
          channelAccessToken: this.config.channels.line.channelAccessToken,
          channelSecret: this.config.channels.line.channelSecret,
          webhookSecret: this.config.channels.line.webhookSecret,
        } : undefined,
        telegram: this.config.channels.telegram ? {
          botToken: this.config.channels.telegram.botToken,
          webhookUrl: this.config.channels.telegram.webhookUrl,
        } : undefined,
        discord: this.config.channels.discord ? {
          botToken: this.config.channels.discord.botToken,
          applicationId: this.config.channels.discord.applicationId,
        } : undefined,
      },
      corsOrigins: ['*'],
    };

    this.holography = new HolographyServer(holographyConfig);

    // Initialise services
    this.taskManager = new TaskManager();
    this.commandProcessor = new CommandProcessor(this.taskManager);
    this.tunnelService = new TunnelService(this.config.tunnel);
    this.copilotBridge = new CopilotBridge();
    this.mcpController = new MCPController(this.config.mcp);
    this.soulManager = new SoulManager();

    // Wire CommandProcessor callbacks
    this.commandProcessor.setCallbacks({
      sendToVSCode: (type, data) => {
        this.holography.broadcastRawToExtensions({ type, ...data });
      },
      replyToChannel: async (message, text) => {
        await this.holography.sendMessage(
          message.channel as ChannelType,
          message.chatId || message.userId,
          { text, chatId: message.chatId }
        );
      },
    });

    this.setupEventHandlers();
    this.setupRoutes();
    this.setupTaskBroadcasts();
  }

  // ── Event Handlers ──────────────────────────────────────────

  private setupEventHandlers(): void {
    this.holography.on('messageForwarded', ({ message }) => {
      this.handleVerifiedMessage(message);
    });

    this.holography.on('channelInitialized', ({ channel }) => {
      logger.info(`✅ ${channel} channel initialized via Holography`);
    });

    this.holography.on('channelError', ({ channel, error }) => {
      logger.error(`❌ ${channel} channel error:`, error);
    });

    this.holography.on('wsClientConnected', ({ clientId }) => {
      logger.info(`🔌 VS Code client connected: ${clientId}`);
    });

    this.holography.on('wsClientDisconnected', ({ clientId, code, reason }: any) => {
      logger.info(`🔌 VS Code client disconnected: ${clientId} (code=${code || '?'}, reason=${reason || 'none'})`);
    });

    this.holography.on('wsClientTimeout', ({ clientId }: any) => {
      logger.warn(`⏰ VS Code client heartbeat timeout: ${clientId}`);
    });

    this.holography.on('extensionMessage', ({ clientId, message }) => {
      handleExtensionMessage(clientId, message, {
        holography: this.holography,
        taskManager: this.taskManager,
        mcpController: this.mcpController,
        tunnelService: this.tunnelService,
        config: this.config,
        lineTaskTimers: this.lineTaskTimers,
      });
    });

    this.holography.on('webhookRegistered', ({ channel, path }) => {
      logger.info(`📬 ${channel} webhook registered: ${path}`);
    });
  }

  // ── Routes & Middleware ─────────────────────────────────────

  private setupRoutes(): void {
    const app: Express = this.holography.getApp();

    // Middleware (body parsing, security, rate limiting, logging)
    setupMiddleware(app);

    // REST API endpoints (tasks, MCP, tunnel, AI settings, persona, users, channels, health)
    registerApiRoutes(app, {
      holography: this.holography,
      taskManager: this.taskManager,
      mcpController: this.mcpController,
      tunnelService: this.tunnelService,
    });

    // Media routes
    const mediaUrl = this.config.mediaUrl || `http://localhost:${this.config.port || 3000}`;
    initializeMediaUrl(mediaUrl);
    app.use('/api/media', mediaRouter);

    // Diagnostic pages
    app.get('/send', (_req, res) => {
      res.send(renderSendMessagePage());
    });

    app.get('/test', (_req, res) => {
      res.send(renderTestPage());
    });
  }

  // ── Task Broadcasts ─────────────────────────────────────────

  private setupTaskBroadcasts(): void {
    const broadcast = (event: string, data: any) => {
      this.holography.broadcastRawToExtensions({ type: event, ...data });
    };

    // task:updated fires on every progress tick and can be very chatty.
    // Throttle it so we send at most one update per 300 ms per task to
    // avoid flooding WebSocket clients (Mission Control, test page).
    const throttledUpdateBroadcast = throttle((task: any) => {
      broadcast('task:updated', { task });
    }, 300);

    this.taskManager.on('task:created', (task: any) => broadcast('task:created', { task }));
    this.taskManager.on('task:updated', (task: any) => throttledUpdateBroadcast(task));
    this.taskManager.on('task:delivered', (task: any) => broadcast('task:delivered', { task }));
    this.taskManager.on('task:reviewed', (task: any) => broadcast('task:reviewed', { task }));
    this.taskManager.on('task:failed', (task: any) => broadcast('task:failed', { task }));
    this.taskManager.on('task:cancelled', (task: any) => broadcast('task:cancelled', { task }));
  }

  // ── Verified Message Handling ───────────────────────────────

  private async handleVerifiedMessage(message: IncomingMessage): Promise<void> {
    const { channel, userId, text, media, eventType, postback } = message;

    // LINE postback (notify button click): should work even if VS Code is offline.
    if (channel === 'line' && eventType === 'postback' && postback) {
      await this.handleLinePostback(message);
      return;
    }

    logger.info(`📨 [${channel}] ${userId}: ${text?.substring(0, 100) || '(media)'}`);

    // Try command processing first (/help, /status, /task, etc.)
    if (text?.startsWith('/')) {
      const result = await this.commandProcessor.processMessage(message);
      if (result) return;
    }

    // If no VS Code extension is connected, reply with an offline greeting
    const wst = this.holography.getWebSocketTransport();
    if (!wst.hasActiveConnections()) {
      const key = `${channel}:${message.chatId || userId}`;
      const now = Date.now();
      const last = this.offlineGreetingLastSent.get(key) || 0;
      if (now - last >= this.offlineGreetingCooldownMs) {
        this.offlineGreetingLastSent.set(key, now);
        try {
          await withRetry(() => this.holography.sendMessage(
            channel as ChannelType,
            message.chatId || userId,
            { text: this.soulManager.getGreeting(), chatId: message.chatId }
          ));
        } catch (err) {
          logger.warn(`Failed to send offline greeting: ${err}`);
        }
      }
      return;
    }

    // Ingest incoming media into the gateway media store
    if (Array.isArray(media) && media.length > 0) {
      try {
        await ingestIncomingMedia(message, this.holography);
      } catch (err) {
        logger.warn(`Failed to ingest incoming media: ${String(err)}`);
      }
    }

    // LINE: show "typing..." (Loading API) + replyToken timeout + notify flow
    if (channel === 'line' && (typeof text === 'string' || (Array.isArray(media) && media.length > 0))) {
      await this.handleLineLongTask(message);
      return;
    }

    // Forward non-command messages to VS Code Extension
    this.holography.broadcastRawToExtensions({
      type: 'ufo_message',
      channel,
      userId,
      chatId: message.chatId,
      text,
      media,
      messageId: message.messageId,
      timestamp: message.timestamp.toISOString(),
      replyToken: message.replyToken, // LINE reply token for faster response
    });
  }

  private splitTextIntoChunks(text: string, maxLen: number): string[] {
    const s = String(text ?? '');
    if (!s) return [''];
    const out: string[] = [];
    for (let i = 0; i < s.length; i += maxLen) {
      out.push(s.slice(i, i + maxLen));
    }
    return out.length > 0 ? out : [''];
  }

  private async sendLineText(
    targetId: string,
    text: string,
    options: { replyToken?: string; chatId?: string } = {}
  ): Promise<void> {
    if (!targetId) return;
    const maxLen = 4500; // LINE text message limit is 5000; keep a safe margin.
    const chunks = this.splitTextIntoChunks(text, maxLen);
    for (let i = 0; i < chunks.length; i++) {
      const replyToken = i === 0 ? options.replyToken : undefined;
      try {
        await withRetry(() => this.holography.sendMessage(
          'line',
          targetId,
          { text: chunks[i], chatId: options.chatId, replyToken }
        ));
      } catch (err) {
        logger.warn(`Failed to send LINE message (chunk ${i + 1}/${chunks.length}): ${String(err)}`);
      }
    }
  }

  private async handleLineLongTask(message: IncomingMessage): Promise<void> {
    const { userId, chatId, text } = message;
    const targetId = chatId || userId;

    // 1) Create a gateway-side task to store metadata + final result for postback retrieval.
    const task = this.taskManager.createTask({
      channel: 'line',
      userId,
      instruction: typeof text === 'string' ? text : '',
      media: message.media,
    });
    try {
      this.taskManager.updateTask(task.id, 'running', 1);
    } catch {}

    // 2) Store LINE metadata so we can reply before replyToken expires.
    this.taskManager.setLineMetadata(task.id, {
      targetId,
      chatId,
      originalReplyToken: message.replyToken,
      loadingStartedAt: new Date(),
      timeoutHandled: false,
    });

    // 3) Show "typing..." via LINE Loading API.
    const lineChannel = this.holography.getChannelManager().getChannel<LineChannel>('line');
    try {
      await lineChannel?.showLoadingAnimation(targetId, this.lineLoadingDurationSeconds);
    } catch (err) {
      logger.debug(`Failed to start LINE loading animation: ${String(err)}`);
    }

    // 4) Set timeout: send a reply notice before replyToken expires.
    const timeoutTimer = setTimeout(() => {
      this.handleLineTaskTimeout(task.id).catch(err => {
        logger.warn(`LINE task timeout handler failed for ${task.id}: ${String(err)}`);
      });
    }, this.lineTaskTimeoutMs);
    this.lineTaskTimers.set(task.id, timeoutTimer);

    // 5) Forward to VS Code extension with taskId (extension should not consume replyToken).
    this.holography.broadcastRawToExtensions({
      type: 'ufo_message',
      channel: 'line',
      userId,
      chatId,
      text,
      media: message.media,
      messageId: message.messageId,
      timestamp: message.timestamp.toISOString(),
      replyToken: message.replyToken,
      taskId: task.id,
    });

    logger.info(`LINE long task created: ${task.id} for ${targetId}`);
  }

  private async handleLineTaskTimeout(taskId: string): Promise<void> {
    const timer = this.lineTaskTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.lineTaskTimers.delete(taskId);
    }

    // If result is already available, let the extension-message handler deliver it.
    // (This is a best-effort safeguard for races.)
    if (this.taskManager.hasLLMResult(taskId)) {
      return;
    }

    const meta = this.taskManager.getLineMetadata(taskId);
    const targetId = meta?.targetId || meta?.chatId;
    if (!targetId) return;

    // Mark as timed out so we will push a notify when the result arrives.
    this.taskManager.setLineMetadata(taskId, { timeoutHandled: true });

    const notice = [
      'think...work...',
      '這題需要更多時間思考，我完成後會推播通知你。',
      '收到通知後點一下，我會用新的 replyToken 回覆答案。',
    ].join('\n');

    // Reply once before replyToken expires (fallback to push if already invalid).
    await this.sendLineText(targetId, notice, { replyToken: meta?.originalReplyToken, chatId: meta?.chatId });
  }

  private async handleLinePostback(message: IncomingMessage): Promise<void> {
    const { userId, chatId, replyToken, postback } = message;
    if (!replyToken) return;
    if (!postback?.data) return;

    const targetId = chatId || userId;
    const params = parsePostbackData(postback.data);
    const action = params.action;
    const taskId = params.taskId;

    if (action !== 'check_result') return;
    if (!taskId || !isValidTaskId(taskId)) return;

    const meta = this.taskManager.getLineMetadata(taskId);
    if (meta?.targetId && meta.targetId !== targetId) {
      await this.sendLineText(targetId, '❌ 這個結果不屬於目前的聊天室。', { replyToken, chatId });
      return;
    }

    const lineChannel = this.holography.getChannelManager().getChannel<LineChannel>('line');
    if (!lineChannel) return;

    if (this.taskManager.hasLLMResult(taskId)) {
      const llmResult = this.taskManager.getLLMResult(taskId);
      if (llmResult?.content) {
        await this.sendLineText(targetId, llmResult.content, { replyToken, chatId });
        try {
          this.taskManager.updateTask(taskId, 'completed', 100);
        } catch {}
      }
      return;
    }

    // Result not ready yet (should be rare with "notify when ready" flow, but handle it).
    const bubble = createStillProcessingBubble(
      taskId,
      '任務還在處理中，請稍後再點擊通知查看答案。'
    );
    try {
      await lineChannel.sendFlexMessage(targetId, '還在處理中...', bubble, replyToken);
    } catch (err) {
      logger.warn(`Failed to send LINE still-processing bubble: ${String(err)}`);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────

  async start(): Promise<void> {
    const port = this.config.port || 3000;

    // Node 20+ feature: network family auto-selection can break on some networks
    // (e.g. IPv6 route issues) and cause undici/grammy fetch to fail for Telegram.
    // Disable it to force stable IPv4 fallback.
    try {
      const setDefaultAutoSelectFamily = (net as any).setDefaultAutoSelectFamily;
      if (typeof setDefaultAutoSelectFamily === 'function') {
        setDefaultAutoSelectFamily(false);
        logger.info('Network family auto-selection disabled (prefer stable IPv4 fallback)');
      }
    } catch {}

    await this.holography.start();

    if (this.config.tunnel?.enabled) {
      await this.tunnelService.start(port);
    }

    await this.mcpController.initialize();

    logger.info(`🚀 Holography Gateway running on port ${port}`);
    logger.info(`📡 Active channels: ${this.holography.getChannelManager().getEnabledChannels().join(', ')}`);
    logger.info(`📬 Send message page: http://localhost:${port}/send`);
    logger.info(`🧪 Test page: http://localhost:${port}/test`);

    if (this.tunnelService.getStatus().active) {
      const tunnelUrl = this.tunnelService.getStatus().url;
      logger.info(`🌐 Public URL: ${tunnelUrl}`);
      if (tunnelUrl) {
        this.commandProcessor.setTunnelUrl(tunnelUrl);
        try { initializeMediaUrl(tunnelUrl); } catch {}
      }
    }

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await this.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await this.stop();
      process.exit(0);
    });
  }

  async stop(): Promise<void> {
    logger.info('Shutting down gateway...');

    // Flush debounced database writes so no data is lost on shutdown.
    try {
      const { getTaskDatabase } = await import('./db/task-database');
      getTaskDatabase().flush();
    } catch { /* best-effort */ }
    try {
      getMediaDatabase().flush();
    } catch { /* best-effort */ }

    await this.tunnelService.stop?.();
    await this.mcpController.shutdown?.();
    await this.holography.stop();
    logger.info('Gateway stopped');
  }
}

// Direct execution entry point
if (require.main === module) {
  const gateway = new HolographyGateway();
  gateway.start().catch(err => {
    logger.error('Failed to start Holography Gateway:', err);
    process.exit(1);
  });
}

export default HolographyGateway;
