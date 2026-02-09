/**
 * Holography LINE Channel Implementation
 * 完全獨立的 LINE 頻道實現，不依賴 Moltbot
 */

import { Client as LineClient, middleware as lineMiddleware, WebhookEvent, TextMessage, FlexMessage, FlexContainer } from '@line/bot-sdk';
import { HologramChannel } from './base';
import { LineConfig, IncomingMessage, OutgoingMessage, MediaItem, PostbackData, LineFlexMessage, LineFlexContainer } from '../core/types';

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
    // 處理 Postback 事件
    if (event.type === 'postback') {
      return this.parsePostbackEvent(event);
    }

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
      eventType: 'message',
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

  /**
   * 解析 Postback 事件
   */
  parsePostbackEvent(event: WebhookEvent): IncomingMessage | null {
    if (event.type !== 'postback') {
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

    // Extract only date/time/datetime params, ignore RichMenuSwitchPostback
    const rawParams = event.postback.params;
    let params: PostbackData['params'];
    if (rawParams && ('date' in rawParams || 'time' in rawParams || 'datetime' in rawParams)) {
      params = rawParams as { date?: string; time?: string; datetime?: string };
    }

    const postbackData: PostbackData = {
      data: event.postback.data,
      params,
    };

    return {
      channel: 'line',
      userId,
      groupId,
      messageId: `postback-${event.timestamp}`,
      timestamp: new Date(event.timestamp),
      replyToken: event.replyToken,
      eventType: 'postback',
      postback: postbackData,
    };
  }

  async sendMessage(userId: string, message: OutgoingMessage): Promise<void> {
    const messages: (TextMessage | FlexMessage)[] = [];

    // Flex Message
    if (message.flex) {
      messages.push({
        type: 'flex',
        altText: message.flex.altText,
        contents: message.flex.contents as FlexContainer,
      });
    }

    // 文字訊息
    if (message.text) {
      messages.push({
        type: 'text',
        text: message.text,
      });
    }

    if (messages.length === 0) {
      return;
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

  /**
   * 顯示 Loading 動畫
   * 調用 LINE Loading API 在聊天室顯示加載指示器
   * @param chatId 用戶或群組 ID
   * @param seconds 持續時間（最多 60 秒）
   */
  async showLoadingAnimation(chatId: string, seconds: number = 60): Promise<void> {
    const duration = Math.min(Math.max(seconds, 5), 60);

    try {
      // LINE Loading API endpoint
      const response = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.channelAccessToken}`,
        },
        body: JSON.stringify({
          chatId,
          loadingSeconds: duration,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.log('error', `Failed to show loading animation: ${response.status} ${errorText}`);
      } else {
        this.log('debug', `Loading animation started for ${chatId} (${duration}s)`);
      }
    } catch (error) {
      this.log('error', 'Error showing loading animation:', error);
    }
  }

  /**
   * 發送 Flex Message
   */
  async sendFlexMessage(
    userId: string,
    altText: string,
    contents: LineFlexContainer,
    replyToken?: string
  ): Promise<void> {
    const flexMessage: FlexMessage = {
      type: 'flex',
      altText,
      contents: contents as FlexContainer,
    };

    if (replyToken) {
      await this.client.replyMessage(replyToken, [flexMessage]);
    } else {
      await this.client.pushMessage(userId, [flexMessage]);
    }
  }

  /**
   * 發送「查看答案」按鈕
   * 用於 LLM 任務超時時，讓用戶稍後獲取結果
   */
  async sendCheckResultButton(
    userId: string,
    taskId: string,
    message: string,
    replyToken?: string
  ): Promise<void> {
    const contents: LineFlexContainer = {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🤔 正在思考中...',
            weight: 'bold',
            size: 'md',
            color: '#1DB446',
          },
          {
            type: 'text',
            text: message,
            size: 'sm',
            color: '#666666',
            margin: 'md',
            wrap: true,
          },
        ],
        paddingAll: '20px',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '📬 查看答案',
              data: `action=check_result&taskId=${taskId}`,
              displayText: '查看答案',
            },
            style: 'primary',
            color: '#1DB446',
          },
        ],
        paddingAll: '12px',
      },
    };

    await this.sendFlexMessage(userId, message, contents, replyToken);
  }
}
