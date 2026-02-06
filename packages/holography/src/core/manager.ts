/**
 * Holography Channel Manager
 * 管理所有社群頻道的生命週期
 */

import { EventEmitter } from 'events';
import { 
  ChannelType, 
  IHologramChannel, 
  IncomingMessage, 
  OutgoingMessage,
  LineConfig,
  TelegramConfig,
  DiscordConfig 
} from './types';
import { LineChannel } from '../channels/line';
import { TelegramChannel } from '../channels/telegram';
import { DiscordChannel } from '../channels/discord';
import { WhitelistManager } from '../security/whitelist';
import { HandshakeManager } from '../security/handshake';

export interface ChannelManagerConfig {
  line?: LineConfig;
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  whitelistStoragePath?: string;
}

export class ChannelManager extends EventEmitter {
  private channels: Map<ChannelType, IHologramChannel> = new Map();
  private whitelistManager: WhitelistManager;
  private handshakeManager: HandshakeManager;
  private config: ChannelManagerConfig;

  constructor(config: ChannelManagerConfig) {
    super();
    this.config = config;
    this.whitelistManager = new WhitelistManager({
      storagePath: config.whitelistStoragePath,
    });
    this.handshakeManager = new HandshakeManager(this.whitelistManager);
  }

  /**
   * 初始化所有已設定的頻道
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // LINE
    if (this.config.line) {
      const lineChannel = new LineChannel(this.config.line);
      this.channels.set('line', lineChannel);
      initPromises.push(
        lineChannel.initialize()
          .then(() => { this.emit('channelInitialized', { channel: 'line' }); })
          .catch(err => { this.emit('channelError', { channel: 'line', error: err }); })
      );
    }

    // Telegram
    if (this.config.telegram) {
      const telegramChannel = new TelegramChannel(this.config.telegram);
      this.channels.set('telegram', telegramChannel);
      initPromises.push(
        telegramChannel.initialize()
          .then(() => { this.emit('channelInitialized', { channel: 'telegram' }); })
          .catch(err => { this.emit('channelError', { channel: 'telegram', error: err }); })
      );
    }

    // Discord
    if (this.config.discord) {
      const discordChannel = new DiscordChannel(this.config.discord);
      this.channels.set('discord', discordChannel);
      initPromises.push(
        discordChannel.initialize()
          .then(() => { this.emit('channelInitialized', { channel: 'discord' }); })
          .catch(err => { this.emit('channelError', { channel: 'discord', error: err }); })
      );
    }

    await Promise.allSettled(initPromises);
    this.emit('initialized', { channels: Array.from(this.channels.keys()) });
  }

  /**
   * 獲取指定頻道
   */
  getChannel<T extends IHologramChannel>(type: ChannelType): T | undefined {
    return this.channels.get(type) as T | undefined;
  }

  /**
   * 獲取所有已啟用的頻道
   */
  getEnabledChannels(): ChannelType[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 處理收到的訊息
   */
  async handleIncomingMessage(message: IncomingMessage): Promise<{ 
    allowed: boolean; 
    reason?: string;
    handled?: boolean;
  }> {
    const channel = message.channel as ChannelType;
    const userId = message.userId;

    // 檢查白名單
    if (!this.whitelistManager.isWhitelisted(channel, userId)) {
      // 檢查是否是握手命令
      if (message.text?.startsWith('/handshake ')) {
        const code = message.text.replace('/handshake ', '').trim();
        const result = this.handshakeManager.verifyCode(
          code, 
          channel, 
          userId, 
          message.senderName
        );
        
        // 發送回應
        await this.sendMessage(channel, userId, { text: result.message });
        
        return { 
          allowed: result.success, 
          reason: result.message,
          handled: true 
        };
      }

      // 檢查是否是 /reset 命令
      if (message.text === '/reset') {
        const result = this.handshakeManager.handleResetCommand(channel, userId);
        await this.sendMessage(channel, userId, { text: result.message });
        return { allowed: false, reason: result.message, handled: true };
      }

      // 未驗證用戶
      const rejectMessage = '⚠️ 你尚未通過驗證。請使用 `/handshake <code>` 進行驗證。';
      await this.sendMessage(channel, userId, { text: rejectMessage });
      
      return { 
        allowed: false, 
        reason: 'User not whitelisted',
        handled: true 
      };
    }

    // 更新最後活動時間
    this.whitelistManager.updateLastActive(channel, userId);

    // 處理 /reset 命令（已驗證用戶）
    if (message.text === '/reset') {
      const result = this.handshakeManager.handleResetCommand(channel, userId);
      await this.sendMessage(channel, userId, { text: result.message });
      return { allowed: false, reason: result.message, handled: true };
    }

    return { allowed: true };
  }

  /**
   * 發送訊息到指定頻道
   */
  async sendMessage(
    channel: ChannelType, 
    userId: string, 
    message: OutgoingMessage
  ): Promise<void> {
    const ch = this.channels.get(channel);
    if (!ch) {
      throw new Error(`Channel ${channel} not initialized`);
    }
    await ch.sendMessage(userId, message);
  }

  /**
   * 生成握手碼
   */
  generateHandshakeCode(): string {
    return this.handshakeManager.generateCode();
  }

  /**
   * 獲取握手碼剩餘時間
   */
  getHandshakeRemainingTime(): number {
    return this.handshakeManager.getRemainingTime();
  }

  /**
   * 獲取白名單管理器
   */
  getWhitelistManager(): WhitelistManager {
    return this.whitelistManager;
  }

  /**
   * 獲取握手管理器
   */
  getHandshakeManager(): HandshakeManager {
    return this.handshakeManager;
  }

  /**
   * 獲取所有驗證用戶
   */
  getVerifiedUsers() {
    return this.whitelistManager.getVerifiedUsers();
  }

  /**
   * 關閉所有頻道
   */
  async shutdown(): Promise<void> {
    // Discord 需要特別處理
    const discord = this.channels.get('discord') as DiscordChannel;
    if (discord) {
      await discord.destroy();
    }

    this.channels.clear();
    this.emit('shutdown');
  }
}
