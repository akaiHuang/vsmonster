/**
 * Holography Server
 * 主要伺服器，整合所有元件
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { Server } from 'http';
import { ChannelManager, ChannelManagerConfig } from './manager';
import { WebSocketTransport, WebSocketTransportConfig } from '../transports/websocket';
import { WebhookTransport } from '../transports/webhook';
import { LineChannel } from '../channels/line';
import { TelegramChannel } from '../channels/telegram';
import { IncomingMessage, OutgoingMessage, ChannelType, VerifiedUser, WSMessageType } from './types';

export interface HolographyServerConfig {
  /** HTTP 伺服器埠口 */
  port?: number;
  /** WebSocket 埠口 */
  wsPort?: number;
  /** 頻道設定 */
  channels: ChannelManagerConfig;
  /** CORS 設定 */
  corsOrigins?: string[];
}

export class HolographyServer extends EventEmitter {
  private app: Express;
  private server: Server | null = null;
  private config: Required<Omit<HolographyServerConfig, 'channels'>> & { channels: ChannelManagerConfig };
  private channelManager: ChannelManager;
  private wsTransport: WebSocketTransport;
  private webhookTransport: WebhookTransport;

  constructor(config: HolographyServerConfig) {
    super();
    this.config = {
      port: config.port || 3000,
      wsPort: config.wsPort || 3001,
      channels: config.channels,
      corsOrigins: config.corsOrigins || ['*'],
    };

    this.app = express();
    this.channelManager = new ChannelManager(config.channels);
    // WebSocket 先不傳 port，稍後會設定 server
    this.wsTransport = new WebSocketTransport({});
    this.webhookTransport = new WebhookTransport({ app: this.app });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * 設定 Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: this.config.corsOrigins,
    }));
    this.app.use(express.json());
  }

  /**
   * 設定路由
   */
  private setupRoutes(): void {
    // 健康檢查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        channels: this.channelManager.getEnabledChannels(),
        wsClients: this.wsTransport.getClientCount(),
      });
    });

    // API 路由
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json({
        channels: this.channelManager.getEnabledChannels(),
        verifiedUsers: this.channelManager.getVerifiedUsers().length,
        wsClients: this.wsTransport.getClientCount(),
      });
    });

    this.app.get('/api/users', (req: Request, res: Response) => {
      res.json(this.channelManager.getVerifiedUsers());
    });

    this.app.post('/api/handshake/generate', (req: Request, res: Response) => {
      const code = this.channelManager.generateHandshakeCode();
      const remainingTime = this.channelManager.getHandshakeRemainingTime();
      res.json({ code, expiresIn: remainingTime });
    });

    this.app.post('/api/send', async (req: Request, res: Response) => {
      try {
        const { channel, userId, message } = req.body;
        await this.channelManager.sendMessage(channel, userId, message);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
  }

  /**
   * 設定 Webhook 路由
   */
  private setupWebhooks(): void {
    // LINE Webhook
    const lineChannel = this.channelManager.getChannel<LineChannel>('line');
    if (lineChannel) {
      const webhookPath = lineChannel.getWebhookPath().replace('/webhook/line', '');
      this.webhookTransport.registerLineWebhook(
        webhookPath,
        [lineChannel.getMiddleware()],
        async (req: Request, res: Response) => {
          const events = req.body.events || [];
          
          for (const event of events) {
            const message = lineChannel.parseMessage(event);
            if (message) {
              await this.handleIncomingMessage(message);
            }
          }
          
          res.status(200).end();
        }
      );
      
      this.emit('webhookRegistered', { 
        channel: 'line', 
        path: `/webhook/line${webhookPath}` 
      });
    }

    // Telegram Webhook
    const telegramChannel = this.channelManager.getChannel<TelegramChannel>('telegram');
    if (telegramChannel) {
      // 從 config 中解析 webhook path（支援帶 secret 的 URL）
      const telegramConfig = this.config.channels.telegram;
      let webhookPath = '';
      if (telegramConfig?.webhookUrl) {
        // 例如: https://ufo.fawstudio.com/webhook/telegram/SECRET
        // 提取 /webhook/telegram 之後的部分
        const match = telegramConfig.webhookUrl.match(/\/webhook\/telegram(\/[^?]*)?/);
        if (match && match[1]) {
          webhookPath = match[1]; // e.g. "/SECRET"
        }
      }
      
      this.webhookTransport.registerTelegramWebhook(
        webhookPath,
        async (req: Request, res: Response) => {
          const message = telegramChannel.parseMessage(req.body);
          if (message) {
            await this.handleIncomingMessage(message);
          }
          res.status(200).end();
        }
      );
      
      this.emit('webhookRegistered', { channel: 'telegram', path: `/webhook/telegram${webhookPath}` });
    }

    // 掛載 webhook router
    this.webhookTransport.mount();
  }

  /**
   * 設定事件處理器
   */
  private setupEventHandlers(): void {
    // Channel Manager 事件
    this.channelManager.on('channelInitialized', (data) => {
      this.emit('channelInitialized', data);
    });

    this.channelManager.on('channelError', (data) => {
      this.emit('channelError', data);
    });

    // WebSocket 事件
    this.wsTransport.on('clientConnected', (data) => {
      this.emit('wsClientConnected', data);
    });

    this.wsTransport.on('clientDisconnected', (data) => {
      this.emit('wsClientDisconnected', data);
    });

    this.wsTransport.on('message', async ({ clientId, message }) => {
      // 處理來自 VS Code Extension 的訊息
      this.emit('extensionMessage', { clientId, message });
    });

    this.wsTransport.on('command', async ({ clientId, command }) => {
      // 處理來自 VS Code Extension 的命令
      await this.handleExtensionCommand(clientId, command);
    });
  }

  /**
   * 處理收到的社群訊息
   */
  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    // 檢查權限並處理握手
    const result = await this.channelManager.handleIncomingMessage(message);
    
    if (result.handled) {
      // 已由 ChannelManager 處理（如握手命令）
      return;
    }

    if (!result.allowed) {
      // 未授權
      return;
    }

    // 轉發到 VS Code Extension
    this.wsTransport.forwardMessage(message);
    this.emit('messageForwarded', { message });
  }

  /**
   * 處理來自 Extension 的命令
   */
  private async handleExtensionCommand(clientId: string, command: any): Promise<void> {
    const { type, payload } = command;

    switch (type) {
      case 'send':
        // 發送訊息到社群
        const { channel, userId, message } = payload;
        await this.channelManager.sendMessage(channel, userId, message);
        break;

      case 'generateHandshake':
        // 生成握手碼
        const code = this.channelManager.generateHandshakeCode();
        this.wsTransport.sendToClient(clientId, {
          type: 'handshakeCode',
          payload: { code, expiresIn: this.channelManager.getHandshakeRemainingTime() },
          timestamp: new Date().toISOString(),
        });
        break;

      case 'getUsers':
        // 獲取驗證用戶列表
        const users = this.channelManager.getVerifiedUsers();
        this.wsTransport.sendToClient(clientId, {
          type: 'users',
          payload: users,
          timestamp: new Date().toISOString(),
        });
        break;

      default:
        this.emit('unknownCommand', { clientId, command });
    }
  }

  /**
   * 啟動伺服器
   */
  async start(): Promise<void> {
    // 初始化頻道
    await this.channelManager.initialize();

    // 設定 Webhooks
    this.setupWebhooks();

    // 啟動 HTTP 伺服器
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        // HTTP 啟動後，把 server 傳給 WebSocket（共用端口）
        this.wsTransport.setServer(this.server!);
        this.wsTransport.start();

        this.emit('started', {
          port: this.config.port,
          channels: this.channelManager.getEnabledChannels(),
        });
        resolve();
      });
    });
  }

  /**
   * 停止伺服器
   */
  async stop(): Promise<void> {
    await this.channelManager.shutdown();
    this.wsTransport.stop();
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.emit('stopped');
          resolve();
        });
      });
    }
  }

  /**
   * 獲取 Express 應用
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * 獲取 Channel Manager
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * 獲取 WebSocket Transport
   */
  getWebSocketTransport(): WebSocketTransport {
    return this.wsTransport;
  }

  /**
   * 發送訊息到社群
   */
  async sendMessage(channel: ChannelType, userId: string, message: OutgoingMessage): Promise<void> {
    await this.channelManager.sendMessage(channel, userId, message);
  }

  /**
   * 廣播訊息到所有 VS Code Extension
   */
  broadcastToExtensions(type: WSMessageType, payload: any): void {
    this.wsTransport.broadcast({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}
