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
    const chatId = message.chatId;
    const text = message.text?.trim();

    // 回覆用的 helper（Telegram 群組需要 chatId）
    const reply = async (replyText: string) => {
      await this.sendMessage(channel, chatId || userId, { text: replyText, chatId });
    };

    // /reset 指令（已驗證 + 未驗證都可以用）
    if (text === '/reset') {
      const result = this.handshakeManager.handleResetCommand(channel, userId);
      await reply(result.message);
      return { allowed: false, reason: result.message, handled: true };
    }

    // 檢查白名單
    if (!this.whitelistManager.isWhitelisted(channel, userId)) {
      // 1. /handshake <code> 指令驗證
      if (text?.startsWith('/handshake ')) {
        const code = text.replace('/handshake ', '').trim();
        const result = this.handshakeManager.verifyCode(
          code, channel, userId, message.senderName
        );
        await reply(result.message);
        return { allowed: result.success, reason: result.message, handled: true };
      }

      // 2. 嘗試 emoji 自動握手驗證（用戶回傳 emoji）
      if (text && this.handshakeManager.hasPendingEmoji(channel, userId)) {
        const result = this.handshakeManager.verifyEmoji(
          text, channel, userId, message.senderName
        );
        if (result.matched) {
          await reply(result.message);
          return { allowed: result.success, reason: result.message, handled: true };
        }
      }

      // 3. 未驗證用戶 → 自動生成 emoji 握手碼
      const emoji = this.handshakeManager.generateEmojiCode(channel, userId);
      const senderLabel = message.senderName || message.senderUsername || userId;

      // 在終端機顯示 emoji 驗證碼
      console.log('');
      console.log(`🔐 ═══════════════════════════════════`);
      console.log(`🔐  握手驗證碼:  ${emoji}`);
      console.log(`🔐  來自: [${channel}] ${senderLabel}`);
      console.log(`🔐 ═══════════════════════════════════`);
      console.log('');

      this.emit('handshakeRequested', { channel, userId, senderLabel, emoji });

      await reply(`🔐 請查看終端機上顯示的 emoji，然後在這裡輸入相同的 emoji 完成驗證。`);

      return { allowed: false, reason: 'Handshake emoji sent', handled: true };
    }

    // 更新最後活動時間
    this.whitelistManager.updateLastActive(channel, userId);

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
