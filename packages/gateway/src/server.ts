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
} from '@vsmonster/holography';
import { loadConfig } from './config/loader';
import { TaskManager } from './task/manager';
import { CommandProcessor } from './commands/processor';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { SoulManager } from './soul/manager';
import { logger } from './utils/logger';
import { throttle } from './utils/debounce';
import { Express } from 'express';
import mediaRouter from './routes/media.routes';
import { initializeMediaUrl } from './services/media.service';
import { getMediaDatabase } from './db/media-database';

// Extracted modules
import { setupMiddleware } from './middleware';
import { registerApiRoutes } from './routes/api.routes';
import { renderSendMessagePage, renderTestPage } from './pages';
import { handleExtensionMessage } from './handlers/extension-message';
import { ingestIncomingMedia } from './handlers/media-ingestion';

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
    const { channel, userId, text, media } = message;

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
          await this.holography.sendMessage(
            channel as ChannelType,
            message.chatId || userId,
            { text: this.soulManager.getGreeting(), chatId: message.chatId }
          );
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
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────

  async start(): Promise<void> {
    const port = this.config.port || 3000;

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
