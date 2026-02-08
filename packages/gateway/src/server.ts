/**
 * VSMONSTER Gateway Server
 * 使用 @vsmonster/holography 模組作為通訊核心
 */

import {
  HolographyServer,
  HolographyServerConfig,
  ChannelType,
  IncomingMessage,
  TelegramChannel,
} from '@vsmonster/holography';
import { loadConfig } from './config/loader';
import { TaskManager } from './task/manager';
import { CommandProcessor } from './commands/processor';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { SoulManager } from './soul/manager';
import { logger } from './utils/logger';
import express, { Express, Router } from 'express';
import mediaRouter from './routes/media.routes';
import { initializeMediaUrl, uploadMedia } from './services/media.service';
import { loadAISettings, saveAISettings, AVAILABLE_MODELS, TASK_TYPES } from './services/ai-settings.service';
import * as fs from 'fs';
import * as path from 'path';
import { getMediaDatabase } from './db/media-database';

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
    
    // 建立 Holography 伺服器配置
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
    
    // 初始化其他服務
    this.taskManager = new TaskManager();
    this.commandProcessor = new CommandProcessor(this.taskManager);
    this.tunnelService = new TunnelService(this.config.tunnel);
    this.copilotBridge = new CopilotBridge();
    this.mcpController = new MCPController(this.config.mcp);
    this.soulManager = new SoulManager();

    // 設定 CommandProcessor 回調
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
    this.setupAdditionalRoutes();
    this.setupTaskBroadcasts();
  }

  /**
   * 設定 Holography 事件處理器
   */
  private setupEventHandlers(): void {
    // 當收到已驗證的社群訊息時
    this.holography.on('messageForwarded', ({ message }) => {
      this.handleVerifiedMessage(message);
    });

    // 頻道初始化
    this.holography.on('channelInitialized', ({ channel }) => {
      logger.info(`✅ ${channel} channel initialized via Holography`);
    });

    this.holography.on('channelError', ({ channel, error }) => {
      logger.error(`❌ ${channel} channel error:`, error);
    });

    // WebSocket 連接
    this.holography.on('wsClientConnected', ({ clientId }) => {
      logger.info(`🔌 VS Code client connected: ${clientId}`);
    });

    this.holography.on('wsClientDisconnected', ({ clientId, code, reason }: any) => {
      logger.info(`🔌 VS Code client disconnected: ${clientId} (code=${code || '?'}, reason=${reason || 'none'})`);
    });

    this.holography.on('wsClientTimeout', ({ clientId }: any) => {
      logger.warn(`⏰ VS Code client heartbeat timeout: ${clientId}`);
    });

    // Extension 訊息
    this.holography.on('extensionMessage', ({ clientId, message }) => {
      this.handleExtensionMessage(clientId, message);
    });

    // Webhook 註冊
    this.holography.on('webhookRegistered', ({ channel, path }) => {
      logger.info(`📬 ${channel} webhook registered: ${path}`);
    });
  }

  /**
   * 設定額外的 API 路由
   */
  private setupAdditionalRoutes(): void {
    const app: Express = this.holography.getApp();

    // 任務 API
    app.get('/api/tasks', (req, res) => {
      res.json(this.taskManager.getAllTasks());
    });

    app.get('/api/tasks/:id', (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (task) {
        res.json(task);
      } else {
        res.status(404).json({ error: 'Task not found' });
      }
    });

    // 任務詳情（含解析後的 media 記錄）
    app.get('/api/tasks/:id/detail', (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const mediaDb = getMediaDatabase();
      const mediaRecords = (task.delivery?.mediaIds || [])
        .map(id => mediaDb.findOne(id))
        .filter(Boolean);

      res.json({ task, media: mediaRecords });
    });

    // 設定任務交付資料
    app.post('/api/tasks/:id/deliver', (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const { mediaIds, summary } = req.body;
      this.taskManager.setTaskDelivery(req.params.id, {
        mediaIds,
        summary,
        deliveredAt: new Date(),
      });

      res.json({ success: true, task: this.taskManager.getTask(req.params.id) });
    });

    // 審核任務（用戶透過 Mission Control 頁面操作）
    app.post('/api/tasks/:id/review', async (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const { approved, comment } = req.body;
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ error: 'approved (boolean) is required' });
      }

      this.taskManager.reviewTask(req.params.id, approved, comment);

      // 通知社群用戶
      const statusLabel = approved ? '✅ 已核准' : '↩️ 需要修改';
      let notifyText = `${statusLabel}\n任務: ${task.instruction.slice(0, 50)}`;
      if (comment) notifyText += `\n備註: ${comment}`;

      try {
        await this.holography.sendMessage(
          task.channel as ChannelType,
          task.userId,
          { text: notifyText }
        );
      } catch (err) {
        logger.warn(`Failed to notify user for task review: ${err}`);
      }

      // 通知 VS Code Extension
      this.holography.broadcastRawToExtensions({
        type: 'task_reviewed',
        taskId: req.params.id,
        approved,
        comment,
      });

      res.json({ success: true, task: this.taskManager.getTask(req.params.id) });
    });

    // MCP 控制 API
    app.get('/api/mcp/servers', (req, res) => {
      res.json(this.mcpController.listServers());
    });

    app.post('/api/mcp/:server/invoke', async (req, res) => {
      try {
        const result = await this.mcpController.invoke(
          req.params.server,
          req.body.action,
          req.body.params
        );
        res.json(result);
      } catch (error) {
        logger.error('MCP invoke error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Tunnel 狀態
    app.get('/api/tunnel', (req, res) => {
      res.json(this.tunnelService.getStatus());
    });

    // 多媒體路由
    const mediaUrl = this.config.mediaUrl || `http://localhost:${this.config.port || 3000}`;
    initializeMediaUrl(mediaUrl);
    app.use('/api/media', mediaRouter);

    // AI Settings API
    app.get('/api/ai-settings', (req, res) => {
      res.json(loadAISettings());
    });

    app.put('/api/ai-settings', (req, res) => {
      try {
        const current = loadAISettings();
        const updated = {
          blueMonster: { ...current.blueMonster, ...req.body.blueMonster },
          ufo: { ...current.ufo, ...req.body.ufo },
        };
        saveAISettings(updated);
        res.json({ success: true, settings: updated });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.get('/api/ai-settings/models', (req, res) => {
      res.json({ models: AVAILABLE_MODELS, taskTypes: TASK_TYPES });
    });

    // Persona (me.md) API — resolve from project root (cwd)
    const projectRoot = process.cwd();
    const personaPaths: Record<string, string> = {
      ufo: path.join(projectRoot, 'UFO/me.md'),
      bluemonster: path.join(projectRoot, 'packages/blue-monster/me.md'),
    };
    app.get('/api/persona/:agent', (req, res) => {
      const agentPath = personaPaths[req.params.agent];
      if (!agentPath) {
        return res.status(404).json({ error: 'Unknown agent' });
      }
      try {
        const content = fs.existsSync(agentPath) ? fs.readFileSync(agentPath, 'utf8') : '';
        res.json({ content, path: agentPath });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
    app.put('/api/persona/:agent', (req, res) => {
      const agentPath = personaPaths[req.params.agent];
      if (!agentPath) {
        return res.status(404).json({ error: 'Unknown agent' });
      }
      try {
        const content = req.body.content ?? '';
        fs.writeFileSync(agentPath, content, 'utf8');
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 刪除已驗證用戶
    app.delete('/api/users/:channel/:userId', (req, res) => {
      const { channel, userId } = req.params;
      try {
        const cm = this.holography.getChannelManager();
        const ch = cm.getChannel(channel as ChannelType);
        if (ch) {
          ch.removeFromWhitelist(userId);
          res.json({ success: true });
        } else {
          res.status(404).json({ error: `Channel ${channel} not found` });
        }
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 列出啟用的頻道
    app.get('/api/channels', (req, res) => {
      res.json({ channels: this.holography.getChannelManager().getEnabledChannels() });
    });

    // === 測試 & 診斷 API ===

    // WebSocket 連線狀態
    app.get('/api/ws/status', (_req, res) => {
      const wst = this.holography.getWebSocketTransport();
      res.json({
        clientCount: wst.getClientCount(),
        clients: wst.getClients(),
        hasActiveConnections: wst.hasActiveConnections(),
      });
    });

    // 透過 HTTP 建立任務（模擬社群指令，用於測試）
    app.post('/api/tasks', (req, res) => {
      const { instruction, channel, userId, priority } = req.body;
      if (!instruction) {
        return res.status(400).json({ error: 'instruction is required' });
      }

      const task = this.taskManager.createTask({
        channel: channel || 'api-test',
        userId: userId || 'test-user',
        instruction,
        priority: priority || 'normal',
      });

      // 發送到 VS Code Extension（跟 /task 指令一樣）
      this.holography.broadcastRawToExtensions({
        type: 'new_task',
        task,
        instruction,
        media: [],
      });

      res.json({ success: true, task });
    });

    // 發送訊息頁面
    app.get('/send', (_req, res) => {
      res.send(this.renderSendMessagePage());
    });

    // 診斷測試頁面
    app.get('/test', (_req, res) => {
      res.send(this.renderTestPage());
    });
  }

  /**
   * 廣播任務事件到所有 WebSocket 客戶端（Mission Control 等）
   */
  private setupTaskBroadcasts(): void {
    const broadcast = (event: string, data: any) => {
      this.holography.broadcastRawToExtensions({ type: event, ...data });
    };

    this.taskManager.on('task:created', (task: any) => {
      broadcast('task:created', { task });
    });

    this.taskManager.on('task:updated', (task: any) => {
      broadcast('task:updated', { task });
    });

    this.taskManager.on('task:delivered', (task: any) => {
      broadcast('task:delivered', { task });
    });

    this.taskManager.on('task:reviewed', (task: any) => {
      broadcast('task:reviewed', { task });
    });

    this.taskManager.on('task:failed', (task: any) => {
      broadcast('task:failed', { task });
    });

    this.taskManager.on('task:cancelled', (task: any) => {
      broadcast('task:cancelled', { task });
    });
  }

  /**
   * 處理已驗證的訊息
   */
  private async handleVerifiedMessage(message: IncomingMessage): Promise<void> {
    const { channel, userId, text, media } = message;

    logger.info(`📨 [${channel}] ${userId}: ${text?.substring(0, 100) || '(media)'}`);

    // 先交給 CommandProcessor 處理（/help, /status, /task 等指令）
    if (text?.startsWith('/')) {
      const result = await this.commandProcessor.processMessage(message);
      if (result) return; // 指令已處理，不再轉發
    }

    // If no VS Code extension is connected, reply with an offline greeting instead of silently dropping messages.
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

    // Best-effort: ingest incoming media into the gateway media store so downstream
    // extensions (UFO/BlueMonster) can access a stable preview URL.
    if (Array.isArray(media) && media.length > 0) {
      try {
        await this.ingestIncomingMedia(message);
      } catch (err) {
        logger.warn(`Failed to ingest incoming media: ${String(err)}`);
      }
    }

    // 非指令訊息 → 轉發給 VS Code Extension（使用扁平 JSON）
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

  private async ingestIncomingMedia(message: IncomingMessage): Promise<void> {
    const items = Array.isArray(message.media) ? message.media : [];
    if (items.length === 0) return;

    const channel = message.channel;
    const source = channel === 'line' ? 'line' : channel === 'discord' ? 'discord' : 'telegram';
    const ch: any = this.holography.getChannelManager().getChannel<any>(channel as any);

    const guessNameAndMime = (it: any, idx: number): { fileName: string; mimeType: string } => {
      const type = String(it?.type || 'file');
      const fileNameRaw = typeof it?.fileName === 'string' ? it.fileName.trim() : '';
      const mimeRaw = typeof it?.mimeType === 'string' ? it.mimeType.trim() : '';
      if (fileNameRaw && mimeRaw) return { fileName: fileNameRaw, mimeType: mimeRaw };
      if (fileNameRaw) {
        // Derive mime from extension if possible.
        const ext = fileNameRaw.split('.').pop()?.toLowerCase() || '';
        const mime =
          ext === 'png' ? 'image/png' :
          (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
          ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' :
          ext === 'svg' ? 'image/svg+xml' :
          ext === 'pdf' ? 'application/pdf' :
          ext === 'txt' ? 'text/plain' :
          ext === 'html' ? 'text/html' :
          ext === 'json' ? 'application/json' :
          mimeRaw || 'application/octet-stream';
        return { fileName: fileNameRaw, mimeType: mime };
      }
      if (type === 'image') return { fileName: `image-${idx + 1}.jpg`, mimeType: mimeRaw || 'image/jpeg' };
      if (type === 'video') return { fileName: `video-${idx + 1}.mp4`, mimeType: mimeRaw || 'video/mp4' };
      if (type === 'audio') return { fileName: `audio-${idx + 1}.mp3`, mimeType: mimeRaw || 'audio/mpeg' };
      return { fileName: `file-${idx + 1}.bin`, mimeType: mimeRaw || 'application/octet-stream' };
    };

    for (let i = 0; i < items.length; i += 1) {
      const it: any = items[i];
      if (!it || typeof it !== 'object') continue;
      // Skip if we already have a URL (Discord often has one).
      if (typeof it.url === 'string' && it.url.trim()) continue;

      const { fileName, mimeType } = guessNameAndMime(it, i);

      let buffer: Buffer | null = null;
      try {
        if (typeof it.url === 'string' && it.url) {
          const res = await fetch(it.url);
          const arrayBuf = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        } else if (ch && typeof ch.downloadMedia === 'function' && typeof it.id === 'string') {
          buffer = await ch.downloadMedia(it.id);
        }
      } catch (err) {
        logger.warn(`Failed to download media for ${channel}: ${String(err)}`);
        buffer = null;
      }

      if (!buffer) continue;

      try {
        const record = await uploadMedia(buffer, fileName, mimeType, source as any);
        // Keep the original platform id in place, but add a stable preview URL.
        it.url = record.publicUrl;
        it.fileName = record.originalFilename;
        it.mimeType = record.mimeType;
        it.fileSize = record.fileSize;
      } catch (err) {
        logger.warn(`Failed to store media (${fileName}): ${String(err)}`);
      }
    }
  }

  /**
   * 處理來自 Extension 的訊息
   */
  private async handleExtensionMessage(clientId: string, message: any): Promise<void> {
    logger.debug(`Extension message from ${clientId}:`, message);

    switch (message.type) {
      case 'chat_action': {
        // Allow extensions (UFO) to ask for transient UI indicators such as Telegram typing.
        if (message.channel === 'telegram' && message.action === 'typing') {
          const chatId = String(message.chatId || message.userId || '');
          if (chatId) {
            const tg = this.holography.getChannelManager().getChannel<TelegramChannel>('telegram');
            try {
              await tg?.sendTypingAction(chatId);
            } catch (err) {
              logger.debug(`Failed to send typing action: ${String(err)}`);
            }
          }
        }
        break;
      }
      case 'copilot_response': {
        // UFO 送 content，舊版送 text — 兩者都支援
        const text = message.text || message.content;
        if (message.channel && message.userId && text) {
          // Some flows (e.g. /api/tasks test page) use a synthetic channel like "api-test".
          // Don't attempt to send to a social channel that isn't initialized; instead,
          // rebroadcast the response to WS clients for local debugging.
          const enabledChannels = this.holography.getChannelManager().getEnabledChannels();
          const canNotify = enabledChannels.includes(message.channel as ChannelType);
          if (!canNotify) {
            this.holography.broadcastRawToExtensions({
              type: 'copilot_response',
              channel: message.channel,
              userId: message.userId,
              chatId: message.chatId,
              text,
              source: 'extension',
            });
            break;
          }
          try {
            await this.holography.sendMessage(
              message.channel as ChannelType,
              message.chatId || message.userId,
              { text, chatId: message.chatId }
            );
          } catch (err) {
            logger.warn(`Failed to send copilot response to ${message.channel}: ${err}`);
          }
        }
        break;
      }

      case 'task_update':
        this.taskManager.updateTask(message.taskId, message.status, message.progress);
        break;

      case 'task_status_change': {
        // 廣播任務狀態變更到社群用戶
        const task = this.taskManager.getTask(message.taskId);
        if (task) {
          this.taskManager.updateTask(message.taskId, message.status, message.progress);

          // 檢查頻道是否為真實社群頻道（api-test 等測試頻道不發送通知）
          const enabledChannels = this.holography.getChannelManager().getEnabledChannels();
          const canNotify = enabledChannels.includes(task.channel as ChannelType);

          if (message.status === 'completed') {
            // 附加交付資料（如有）
            if (message.mediaIds || message.summary) {
              this.taskManager.setTaskDelivery(message.taskId, {
                mediaIds: message.mediaIds,
                summary: message.summary,
                deliveredAt: new Date(),
              });
            }

            if (canNotify) {
              // 建立交付連結
              const baseUrl = this.tunnelService.getStatus().url
                || `http://localhost:${this.config.port || 3000}`;
              const deliveryUrl = `${baseUrl}/task/${message.taskId}`;

              const statusText = this.taskManager.formatTaskStatus(
                this.taskManager.getTask(message.taskId)!
              );
              const deliveryMessage = `${statusText}\n📎 查看結果: ${deliveryUrl}`;

              try {
                await this.holography.sendMessage(
                  task.channel as ChannelType,
                  task.userId,
                  { text: deliveryMessage }
                );
              } catch (err) {
                logger.warn(`Failed to send delivery notification: ${err}`);
              }
            }

            // 更新狀態為已送達
            this.taskManager.updateTask(message.taskId, 'delivered');
          } else if (canNotify) {
            const statusText = this.taskManager.formatTaskStatus(
              this.taskManager.getTask(message.taskId)!
            );
            try {
              await this.holography.sendMessage(
                task.channel as ChannelType,
                task.userId,
                { text: statusText }
              );
            } catch (err) {
              logger.warn(`Failed to send status notification: ${err}`);
            }
          }
        }
        break;
      }

      case 'send_message': {
        // Extension 請求發送訊息到社群
        if (message.channel && message.userId && (message.text || message.content)) {
          try {
            await this.holography.sendMessage(
              message.channel as ChannelType,
              message.chatId || message.userId,
              { text: message.text || message.content, chatId: message.chatId }
            );
          } catch (err) {
            logger.warn(`Failed to send message to ${message.channel}: ${err}`);
          }
        }
        break;
      }

      case 'mcp_invoke': {
        // Extension 請求執行 MCP
        try {
          const result = await this.mcpController.invoke(
            message.server,
            message.action,
            message.params
          );
          // 回傳結果給 Extension
          this.holography.broadcastRawToExtensions({
            type: 'mcp_result',
            requestId: message.requestId,
            result,
          });
        } catch (error) {
          this.holography.broadcastRawToExtensions({
            type: 'mcp_result',
            requestId: message.requestId,
            error: String(error),
          });
        }
        break;
      }

      default:
        logger.debug(`Unknown extension message type: ${message.type}`);
    }
  }

  /**
   * 啟動服務
   */
  async start(): Promise<void> {
    const port = this.config.port || 3000;

    // 啟動 Holography 伺服器
    await this.holography.start();

    // 啟動 ngrok (如果配置了)
    if (this.config.tunnel?.enabled) {
      await this.tunnelService.start(port);
    }

    // 初始化 MCP 服務器
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
        // Prefer tunnel URL for media publicUrl so uploaded assets are reachable externally.
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

  /**
   * 停止服務
   */
  async stop(): Promise<void> {
    logger.info('Shutting down gateway...');
    await this.tunnelService.stop?.();
    await this.mcpController.shutdown?.();
    await this.holography.stop();
    logger.info('Gateway stopped');
  }

  /**
   * 渲染發送訊息頁面
   */
  private renderSendMessagePage(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UFO - 發送訊息 (Holography)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 20px;
      color: #fff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 { text-align: center; margin-bottom: 10px; font-size: 28px; }
    h1 span { font-size: 40px; }
    .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #aaa; }
    select, input, textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 16px;
    }
    textarea { min-height: 120px; resize: vertical; }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    .result { margin-top: 20px; padding: 15px; border-radius: 8px; display: none; }
    .result.success { background: rgba(0,200,100,0.2); border: 1px solid #00c864; display: block; }
    .result.error { background: rgba(200,50,50,0.2); border: 1px solid #c83232; display: block; }
    .users-list { margin-top: 30px; }
    .users-list h3 { margin-bottom: 15px; font-size: 18px; }
    .user-item {
      padding: 10px 15px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-info { display: flex; align-items: center; gap: 10px; }
    .channel-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .channel-badge.line { background: #00c300; }
    .channel-badge.telegram { background: #0088cc; }
    .channel-badge.discord { background: #5865f2; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span>🛸</span> UFO</h1>
    <p class="subtitle">Powered by Holography</p>
    
    <form id="sendForm">
      <div class="form-group">
        <label>頻道</label>
        <select id="channel" required>
          <option value="">選擇頻道...</option>
          <option value="line">LINE</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>用戶 ID</label>
        <input type="text" id="userId" placeholder="輸入用戶 ID 或從下方選擇" required>
      </div>
      
      <div class="form-group">
        <label>訊息</label>
        <textarea id="message" placeholder="輸入要發送的訊息..." required></textarea>
      </div>
      
      <button type="submit">發送訊息</button>
    </form>
    
    <div id="result" class="result"></div>
    
    <div class="users-list">
      <h3>已驗證用戶</h3>
      <div id="usersList">載入中...</div>
    </div>
  </div>
  
  <script>
    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const list = document.getElementById('usersList');
        
        if (!data.users || data.users.length === 0) {
          list.innerHTML = '<p style="color:#888">尚無已驗證用戶</p>';
          return;
        }
        
        list.innerHTML = data.users.map(u => \`
          <div class="user-item" onclick="selectUser('\${u.channel}', '\${u.id}')">
            <div class="user-info">
              <span class="channel-badge \${u.channel}">\${u.channel.toUpperCase()}</span>
              <span>\${u.displayName || u.id}</span>
            </div>
            <span style="color:#888">\${u.id.substring(0,10)}...</span>
          </div>
        \`).join('');
      } catch (e) {
        document.getElementById('usersList').innerHTML = '<p style="color:#f66">載入失敗</p>';
      }
    }
    
    function selectUser(channel, userId) {
      document.getElementById('channel').value = channel;
      document.getElementById('userId').value = userId;
    }
    
    document.getElementById('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = document.getElementById('result');
      
      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: document.getElementById('channel').value,
            userId: document.getElementById('userId').value,
            message: document.getElementById('message').value
          })
        });
        
        const data = await res.json();
        result.className = 'result ' + (data.success ? 'success' : 'error');
        result.textContent = data.success ? '✅ 訊息已發送' : '❌ ' + (data.error || '發送失敗');
      } catch (e) {
        result.className = 'result error';
        result.textContent = '❌ 網路錯誤';
      }
    });
    
    loadUsers();
    setInterval(loadUsers, 30000);
  </script>
</body>
</html>`;
  }
  /**
   * 渲染診斷測試頁面
   */
  private renderTestPage(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSMONSTER - Channel Test</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;min-height:100vh;padding:20px;color:#e6edf3}
    .grid{max-width:900px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .full{grid-column:1/-1}
    h1{text-align:center;margin-bottom:6px;font-size:24px}
    .subtitle{text-align:center;color:#7d8590;margin-bottom:24px;font-size:13px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px}
    .card h2{font-size:16px;margin-bottom:14px;color:#58a6ff}
    label{display:block;margin-bottom:6px;font-weight:500;color:#7d8590;font-size:13px}
    input,textarea,select{width:100%;padding:10px 12px;border:1px solid #30363d;border-radius:6px;background:#0d1117;color:#e6edf3;font-size:14px;margin-bottom:12px}
    textarea{min-height:80px;resize:vertical}
    .btn{width:100%;padding:12px;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s}
    .btn-primary{background:#238636;color:#fff}
    .btn-primary:hover{background:#2ea043}
    .btn-blue{background:#1f6feb;color:#fff}
    .btn-blue:hover{background:#388bfd}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .status-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #21262d}
    .status-row:last-child{border-bottom:none}
    .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .dot.green{background:#3fb950}
    .dot.red{background:#f85149}
    .dot.gray{background:#484f58}
    .status-label{flex:1;font-size:14px}
    .status-val{font-size:13px;color:#7d8590;font-family:monospace}
    .log{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;max-height:300px;overflow-y:auto;font-family:'SF Mono',Consolas,monospace;font-size:12px;line-height:1.6}
    .log-entry{padding:2px 0}
    .log-time{color:#484f58;margin-right:8px}
    .log-ok{color:#3fb950}
    .log-err{color:#f85149}
    .log-info{color:#58a6ff}
    .result{margin-top:12px;padding:12px;border-radius:6px;font-size:13px;display:none;word-break:break-all}
    .result.ok{background:rgba(63,185,80,.12);border:1px solid #238636;color:#3fb950;display:block}
    .result.err{background:rgba(248,81,73,.12);border:1px solid #f85149;color:#f85149;display:block}
    .tasks-list{max-height:250px;overflow-y:auto}
    .task-item{padding:8px 10px;background:#0d1117;border:1px solid #21262d;border-radius:6px;margin-bottom:6px;font-size:13px}
    .task-id{color:#58a6ff;font-family:monospace}
    .task-status{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;margin-left:6px}
    .task-status.pending{background:#30363d;color:#7d8590}
    .task-status.running{background:#1f6feb33;color:#58a6ff}
    .task-status.completed{background:#23863633;color:#3fb950}
  </style>
</head>
<body>
  <h1>VSMONSTER Channel Test</h1>
  <p class="subtitle">Gateway diagnostics &amp; task testing</p>

  <div class="grid">
    <!-- Left: Status -->
    <div class="card">
      <h2>Connection Status</h2>
      <div id="statusPanel">
        <div class="status-row">
          <div class="dot gray" id="dotWs"></div>
          <span class="status-label">WebSocket Clients</span>
          <span class="status-val" id="wsCount">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotLine"></div>
          <span class="status-label">LINE Channel</span>
          <span class="status-val" id="lineSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotTg"></div>
          <span class="status-label">Telegram Channel</span>
          <span class="status-val" id="tgSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotDc"></div>
          <span class="status-label">Discord Channel</span>
          <span class="status-val" id="dcSt">-</span>
        </div>
        <div class="status-row">
          <div class="dot gray" id="dotTunnel"></div>
          <span class="status-label">Tunnel</span>
          <span class="status-val" id="tunnelSt">-</span>
        </div>
      </div>
    </div>

    <!-- Right: Create Task -->
    <div class="card">
      <h2>Send Test Task</h2>
      <label>Task Instruction</label>
      <textarea id="taskInst" placeholder="e.g. Create a hello world page"></textarea>
      <label>Priority</label>
      <select id="taskPri">
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
        <option value="low">Low</option>
      </select>
      <button class="btn btn-primary" id="sendTaskBtn">Send Task to Extension</button>
      <div id="taskResult" class="result"></div>
    </div>

    <!-- Bottom left: Recent tasks -->
    <div class="card">
      <h2>Recent Tasks</h2>
      <div id="tasksList" class="tasks-list"><span style="color:#484f58">Loading...</span></div>
    </div>

    <!-- Bottom right: Event log -->
    <div class="card">
      <h2>Event Log</h2>
      <div id="eventLog" class="log"><div class="log-entry"><span class="log-time">--:--:--</span><span class="log-info">Waiting for events...</span></div></div>
    </div>

    <!-- Full width: cURL reference -->
    <div class="card full">
      <h2>API Quick Reference</h2>
      <div style="font-family:'SF Mono',Consolas,monospace;font-size:12px;color:#7d8590;line-height:1.8">
        <div style="margin-bottom:8px"><span style="color:#3fb950">POST</span> /api/tasks <span style="color:#484f58">- Create a task (body: { instruction, priority? })</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/tasks <span style="color:#484f58">- List all tasks</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/ws/status <span style="color:#484f58">- WebSocket client connections</span></div>
        <div style="margin-bottom:8px"><span style="color:#58a6ff">GET</span>&nbsp; /api/channels <span style="color:#484f58">- Enabled channels</span></div>
        <div style="margin-bottom:8px;color:#e6edf3">
          curl -X POST http://localhost:3000/api/tasks \\<br>
          &nbsp;&nbsp;-H "Content-Type: application/json" \\<br>
          &nbsp;&nbsp;-d '{"instruction": "Build a login page"}'
        </div>
      </div>
    </div>
  </div>

  <script>
    const byId = id => document.getElementById(id);
    const now = () => new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

    function addLog(msg, cls) {
      const log = byId('eventLog');
      const d = document.createElement('div');
      d.className = 'log-entry';
      d.innerHTML = '<span class="log-time">' + now() + '</span><span class="log-' + (cls||'info') + '">' + msg + '</span>';
      log.appendChild(d);
      if (log.children.length > 200) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }

    // === Poll status ===
    async function refreshStatus() {
      try {
        const [wsRes, chRes, tnRes] = await Promise.all([
          fetch('/api/ws/status').then(r=>r.json()),
          fetch('/api/channels').then(r=>r.json()),
          fetch('/api/tunnel').then(r=>r.json()),
        ]);
        const cnt = wsRes.clientCount || 0;
        byId('wsCount').textContent = cnt + ' client(s)';
        byId('dotWs').className = 'dot ' + (cnt > 0 ? 'green' : 'red');

        const chs = chRes.channels || [];
        const setC = (dotId, valId, name) => {
          const on = chs.includes(name);
          byId(dotId).className = 'dot ' + (on ? 'green' : 'gray');
          byId(valId).textContent = on ? 'Active' : 'Not configured';
        };
        setC('dotLine','lineSt','line');
        setC('dotTg','tgSt','telegram');
        setC('dotDc','dcSt','discord');

        byId('dotTunnel').className = 'dot ' + (tnRes.active ? 'green' : 'gray');
        byId('tunnelSt').textContent = tnRes.active ? tnRes.url : 'Inactive';
      } catch(e) {
        addLog('Failed to fetch status: ' + e.message, 'err');
      }
    }

    // === Poll tasks ===
    async function refreshTasks() {
      try {
        const tasks = await fetch('/api/tasks').then(r=>r.json());
        const list = byId('tasksList');
        if (!tasks || tasks.length === 0) {
          list.innerHTML = '<span style="color:#484f58">No tasks yet</span>';
          return;
        }
        const recent = tasks.slice(-10).reverse();
        list.innerHTML = recent.map(t =>
          '<div class="task-item">' +
            '<span class="task-id">' + t.id + '</span>' +
            '<span class="task-status ' + t.status + '">' + t.status + '</span>' +
            '<div style="color:#7d8590;margin-top:4px">' + (t.instruction||'').substring(0,60) + '</div>' +
          '</div>'
        ).join('');
      } catch(e) {}
    }

    // === Send task ===
    byId('sendTaskBtn').addEventListener('click', async () => {
      const inst = byId('taskInst').value.trim();
      if (!inst) return;
      const btn = byId('sendTaskBtn');
      const result = byId('taskResult');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      result.className = 'result';
      result.style.display = 'none';
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ instruction: inst, priority: byId('taskPri').value }),
        });
        const data = await res.json();
        if (data.success) {
          result.className = 'result ok';
          result.textContent = 'Task created: ' + data.task.id;
          addLog('Task dispatched: ' + data.task.id + ' -> ' + inst.substring(0,40), 'ok');
          byId('taskInst').value = '';
          refreshTasks();
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch(e) {
        result.className = 'result err';
        result.textContent = 'Error: ' + e.message;
        addLog('Task send failed: ' + e.message, 'err');
      }
      btn.disabled = false;
      btn.textContent = 'Send Task to Extension';
    });

    // === WebSocket live events ===
    function connectEventStream() {
      // Holography WebSocket shares the same port as HTTP (e.g. 3000). The previous
      // "+1 port" logic (3001) caused false disconnects and hid live events.
      const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/vscode?client=test-page';
      addLog('Connecting WS: ' + wsUrl + ' ...', 'info');
      try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => addLog('WS connected (live event stream)', 'ok');
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'heartbeat' || msg.type === 'pong') return;
            addLog('[' + (msg.type||'unknown') + '] ' + JSON.stringify(msg).substring(0,120), 'info');
            if (msg.type && msg.type.startsWith('task')) refreshTasks();
          } catch(err) {}
        };
        ws.onclose = () => {
          addLog('WS disconnected, retrying in 5s...', 'err');
          setTimeout(connectEventStream, 5000);
        };
        ws.onerror = () => {};
      } catch(e) {
        addLog('WS connection failed', 'err');
        setTimeout(connectEventStream, 5000);
      }
    }

    // Init
    refreshStatus();
    refreshTasks();
    connectEventStream();
    setInterval(refreshStatus, 5000);
    setInterval(refreshTasks, 10000);
    addLog('Test page loaded', 'ok');
  </script>
</body>
</html>`;
  }
}

// 如果直接執行此檔案
if (require.main === module) {
  const gateway = new HolographyGateway();
  gateway.start().catch(err => {
    logger.error('Failed to start Holography Gateway:', err);
    process.exit(1);
  });
}

export default HolographyGateway;
