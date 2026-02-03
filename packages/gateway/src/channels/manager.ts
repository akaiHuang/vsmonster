import { ChannelAdapter, ChannelsConfig, IncomingMessage, OutgoingMessage } from './base';
import { LineChannel } from './line';
import { TelegramChannel } from './telegram';
import { logger } from '../utils/logger';

/**
 * 頻道管理器
 * 負責管理所有社群頻道的連接和訊息路由
 */
export class ChannelManager {
  private channels: Map<string, ChannelAdapter> = new Map();
  private config: ChannelsConfig;
  private userChannelMap: Map<string, { channel: string; chatId?: string }> = new Map();
  private messageHandler?: (message: IncomingMessage) => void;

  constructor(config: ChannelsConfig) {
    this.config = config;
  }

  /**
   * 設定訊息處理器
   */
  setMessageHandler(handler: (message: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * 初始化所有配置的頻道
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // LINE
    if (this.config.line) {
      const lineChannel = new LineChannel(this.config.line);
      this.channels.set('line', lineChannel);
      initPromises.push(
        lineChannel.initialize().catch(err => {
          logger.error('Failed to initialize LINE channel:', err);
        })
      );
    }

    // Telegram
    if (this.config.telegram) {
      const telegramChannel = new TelegramChannel(this.config.telegram);
      this.channels.set('telegram', telegramChannel);
      initPromises.push(
        telegramChannel.initialize().catch(err => {
          logger.error('Failed to initialize Telegram channel:', err);
        })
      );
    }

    // Discord
    if (this.config.discord) {
      // Lazy import to avoid loading Discord when not configured.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DiscordChannel } = require('./discord');
      const discordChannel = new DiscordChannel(this.config.discord);
      // 設定 Discord 訊息處理器
      if (this.messageHandler) {
        discordChannel.setMessageHandler(this.messageHandler);
      }
      this.channels.set('discord', discordChannel);
      initPromises.push(
        discordChannel.initialize().catch((err: unknown) => {
          logger.error('Failed to initialize Discord channel:', err);
        })
      );
    }

    // Slack (待實現)
    if (this.config.slack) {
      logger.info('Slack channel configured but not yet implemented');
      // TODO: Implement Slack channel
    }

    await Promise.all(initPromises);
    logger.info(`Initialized ${this.channels.size} channel(s)`);
  }

  /**
   * 取得所有活躍的頻道名稱
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 取得特定頻道適配器
   */
  getChannel(name: string): ChannelAdapter | undefined {
    return this.channels.get(name);
  }

  /**
   * 解析來自特定頻道的訊息
   */
  parseMessage(channelName: string, event: any): IncomingMessage | null {
    const channel = this.channels.get(channelName);
    if (!channel) {
      logger.warn(`Unknown channel: ${channelName}`);
      return null;
    }

    const message = channel.parseMessage(event);
    
    if (message) {
      // 記錄用戶和頻道的對應關係
      this.userChannelMap.set(message.userId, {
        channel: channelName,
        chatId: message.chatId || message.groupId,
      });
    }

    return message;
  }

  /**
   * 發送訊息到特定頻道
   */
  async sendMessage(channelName: string, userId: string, message: string | OutgoingMessage): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      logger.warn(`Cannot send message: unknown channel ${channelName}`);
      return;
    }

    const userInfo = this.userChannelMap.get(userId);
    const outMessage: OutgoingMessage = typeof message === 'string' 
      ? { text: message, chatId: userInfo?.chatId }
      : { ...message, chatId: message.chatId || userInfo?.chatId };

    try {
      await channel.sendMessage(userId, outMessage);
      logger.debug(`Message sent to ${userId} via ${channelName}`);
    } catch (error) {
      logger.error(`Failed to send message to ${userId} via ${channelName}:`, error);
      throw error;
    }
  }

  /**
   * 發送訊息給用戶 (自動選擇頻道)
   */
  async sendToUser(userId: string, message: string | OutgoingMessage): Promise<void> {
    const userInfo = this.userChannelMap.get(userId);
    if (!userInfo) {
      logger.warn(`Cannot send message: unknown user ${userId}`);
      return;
    }

    await this.sendMessage(userInfo.channel, userId, message);
  }

  /**
   * 廣播訊息到所有用戶
   */
  async broadcastMessage(type: string, data: any): Promise<void> {
    const message = this.formatBroadcastMessage(type, data);
    
    for (const [userId, userInfo] of this.userChannelMap.entries()) {
      try {
        await this.sendMessage(userInfo.channel, userId, message);
      } catch (error) {
        logger.error(`Failed to broadcast to ${userId}:`, error);
      }
    }
  }

  /**
   * 格式化廣播訊息
   */
  private formatBroadcastMessage(type: string, data: any): string {
    switch (type) {
      case 'task_progress':
        return `📊 任務進度更新\n任務: ${data.taskId}\n狀態: ${data.status}\n進度: ${data.progress}%`;
      
      case 'preview_url':
        return `🌐 預覽連結已更新\n${data.url}`;
      
      case 'task_completed':
        return `✅ 任務完成\n任務: ${data.taskId}\n${data.summary || ''}`;
      
      case 'task_failed':
        return `❌ 任務失敗\n任務: ${data.taskId}\n錯誤: ${data.error}`;
      
      default:
        return JSON.stringify({ type, data });
    }
  }

  /**
   * 下載媒體文件
   */
  async downloadMedia(channelName: string, mediaId: string): Promise<Buffer> {
    const channel = this.channels.get(channelName);
    if (!channel || !channel.downloadMedia) {
      throw new Error(`Channel ${channelName} does not support media download`);
    }

    return channel.downloadMedia(mediaId);
  }
}
