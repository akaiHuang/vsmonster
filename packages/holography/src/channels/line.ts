/**
 * Holography LINE Channel Implementation
 * 完全獨立的 LINE 頻道實現，不依賴 Moltbot
 */

import { Client as LineClient, middleware as lineMiddleware, WebhookEvent, TextMessage } from '@line/bot-sdk';
import { HologramChannel } from './base';
import { LineConfig, IncomingMessage, OutgoingMessage, MediaItem } from '../core/types';

export class LineChannel extends HologramChannel {
  readonly name = 'line';
  private client: LineClient;
  private config: LineConfig;
  private webhookPath: string;

  constructor(config: LineConfig) {
    super('line');
    this.config = config;
    this.client = new LineClient({
      channelAccessToken: config.channelAccessToken,
    });
    
    // 使用提供的 webhook secret 或生成新的
    this.webhookPath = config.webhookSecret || this.generateWebhookSecret();
  }
  
  /**
   * 獲取完整的 webhook URL 路徑（含安全路徑）
   */
  getWebhookPath(): string {
    return `/webhook/line/${this.webhookPath}`;
  }

  async initialize(): Promise<void> {
    try {
      const profile = await this.client.getBotInfo();
      this.log('info', `LINE Bot initialized: ${profile.displayName}`);
    } catch (error) {
      this.log('error', 'Failed to initialize LINE bot:', error);
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
        this.log('debug', `Unsupported LINE message type: ${(message as any).type}`);
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

  /**
   * 獲取 Express middleware 用於驗證 LINE webhook 簽章
   */
  getMiddleware() {
    return lineMiddleware({
      channelSecret: this.config.channelSecret,
    });
  }

  /**
   * 獲取 LINE Client 實例
   */
  getClient(): LineClient {
    return this.client;
  }
}
