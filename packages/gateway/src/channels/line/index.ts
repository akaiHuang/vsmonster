import { Client as LineClient, middleware as lineMiddleware, WebhookEvent, TextMessage, MessageAPIResponseBase } from '@line/bot-sdk';
import { ChannelAdapter, IncomingMessage, OutgoingMessage } from '../base';
import { logger } from '../../utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
  webhookSecret?: string;  // Webhook URL 的安全令牌
  whitelist?: string[];    // 白名單用戶 ID
}

export class LineChannel implements ChannelAdapter {
  readonly name = 'line';
  private client: LineClient;
  private config: LineConfig;
  private webhookPath: string;  // 包含隨機字串的 webhook 路徑
  private whitelistPath: string;

  constructor(config: LineConfig) {
    this.config = config;
    this.client = new LineClient({
      channelAccessToken: config.channelAccessToken,
    });
    
    // 生成安全的 webhook 路徑（包含隨機字串）
    this.webhookPath = config.webhookSecret || this.generateWebhookSecret();

    this.whitelistPath = path.join(process.cwd(), 'configs', 'line-whitelist.json');
    this.loadWhitelist();
  }
  
  /**
   * 生成隨機的 webhook 密鑰
   */
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * 獲取完整的 webhook URL（含安全路徑）
   */
  getWebhookPath(): string {
    return `/webhook/line/${this.webhookPath}`;
  }
  
  /**
   * 驗證請求是否來自白名單用戶
   */
  isWhitelisted(userId: string): boolean {
    // 如果沒有設定白名單，允許所有用戶
    if (!this.config.whitelist || this.config.whitelist.length === 0) {
      return false;
    }
    
    const allowed = this.config.whitelist.includes(userId);
    if (!allowed) {
      logger.warn(`User ${userId} not in whitelist, rejecting request`);
    }
    return allowed;
  }
  
  /**
   * 添加用戶到白名單
   */
  async addToWhitelist(userId: string): Promise<void> {
    if (!this.config.whitelist) {
      this.config.whitelist = [];
    }
    
    if (!this.config.whitelist.includes(userId)) {
      this.config.whitelist.push(userId);
      this.saveWhitelist();
      logger.info(`Added user ${userId} to whitelist`);
      
      // 通知用戶已加入白名單
      await this.sendTextMessage(userId, '✅ 你已被加入白名單，現在可以使用 VSMONSTER 了！');
    }
  }

  private loadWhitelist(): void {
    try {
      if (fs.existsSync(this.whitelistPath)) {
        const content = fs.readFileSync(this.whitelistPath, 'utf8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
          this.config.whitelist = Array.from(new Set([...(this.config.whitelist || []), ...list]));
        }
      } else if (this.config.whitelist && this.config.whitelist.length > 0) {
        this.saveWhitelist();
      }
    } catch (error) {
      logger.warn('Failed to load LINE whitelist:', error);
    }
  }

  private saveWhitelist(): void {
    try {
      const list = this.config.whitelist || [];
      fs.mkdirSync(path.dirname(this.whitelistPath), { recursive: true });
      fs.writeFileSync(this.whitelistPath, JSON.stringify(list, null, 2));
    } catch (error) {
      logger.warn('Failed to save LINE whitelist:', error);
    }
  }

  clearWhitelist(): void {
    this.config.whitelist = [];
    this.saveWhitelist();
  }

  removeFromWhitelist(userId: string): void {
    if (this.config.whitelist) {
      this.config.whitelist = this.config.whitelist.filter(id => id !== userId);
      this.saveWhitelist();
      logger.info(`Removed LINE user ${userId} from whitelist`);
    }
  }

  async initialize(): Promise<void> {
    // 驗證 Token
    try {
      const profile = await this.client.getBotInfo();
      logger.info(`LINE Bot initialized: ${profile.displayName}`);
    } catch (error) {
      logger.error('Failed to initialize LINE bot:', error);
      throw error;
    }
  }

  parseMessage(event: WebhookEvent): IncomingMessage | null {
    // 只處理訊息事件
    if (event.type !== 'message') {
      return null;
    }

    const source = event.source;
    let userId: string;
    let groupId: string | undefined;

    if (source.type === 'user') {
      userId = source.userId;
    } else if (source.type === 'group') {
      userId = source.userId || 'unknown';
      groupId = source.groupId;
    } else if (source.type === 'room') {
      userId = source.userId || 'unknown';
      groupId = source.roomId;
    } else {
      return null;
    }
    
    const message = event.message;
    const result: IncomingMessage = {
      channel: 'line',
      userId,
      groupId,
      messageId: message.id,
      timestamp: new Date(event.timestamp),
      replyToken: event.replyToken,
    };

    // 處理不同類型的訊息
    switch (message.type) {
      case 'text':
        result.text = message.text;
        break;
      case 'image':
        result.media = [{
          type: 'image',
          id: message.id,
          contentProvider: message.contentProvider,
        }];
        break;
      case 'video':
        result.media = [{
          type: 'video',
          id: message.id,
          contentProvider: message.contentProvider,
        }];
        break;
      case 'audio':
        result.media = [{
          type: 'audio',
          id: message.id,
          contentProvider: message.contentProvider,
        }];
        break;
      case 'file':
        result.media = [{
          type: 'file',
          id: message.id,
          fileName: message.fileName,
          fileSize: Number(message.fileSize),
        }];
        break;
      case 'location':
        result.location = {
          title: message.title,
          address: message.address,
          latitude: message.latitude,
          longitude: message.longitude,
        };
        break;
      case 'sticker':
        result.sticker = {
          packageId: message.packageId,
          stickerId: message.stickerId,
        };
        break;
      default:
        logger.debug(`Unsupported LINE message type: ${(message as any).type}`);
        return null;
    }

    return result;
  }

  async sendMessage(userId: string, message: OutgoingMessage): Promise<void> {
    const messages: TextMessage[] = [];

    // 文字訊息
    if (message.text) {
      messages.push({
        type: 'text',
        text: message.text,
      });
    }

    // 如果有 replyToken，優先使用 reply
    if (message.replyToken) {
      await this.client.replyMessage(message.replyToken, messages);
    } else {
      // 否則使用 push
      await this.client.pushMessage(userId, messages);
    }
  }

  async sendTextMessage(userId: string, text: string, replyToken?: string): Promise<void> {
    await this.sendMessage(userId, { text, replyToken });
  }

  async downloadMedia(messageId: string): Promise<Buffer> {
    const stream = await this.client.getMessageContent(messageId);
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getUserProfile(userId: string): Promise<{ displayName: string; pictureUrl?: string }> {
    const profile = await this.client.getProfile(userId);
    return {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  }

  getMiddleware() {
    return lineMiddleware({
      channelSecret: this.config.channelSecret,
    });
  }
}
