/**
 * Holography Whitelist Manager
 * 管理各頻道的白名單用戶
 */

import { WhitelistStorage } from './storage';
import { VerifiedUser, ChannelType } from '../core/types';

export interface WhitelistConfig {
  storagePath?: string;
  autoSave?: boolean;
}

export class WhitelistManager {
  private storage: WhitelistStorage;
  private whitelists: Map<ChannelType, Set<string>> = new Map();
  private verifiedUsers: Map<string, VerifiedUser> = new Map();
  private autoSave: boolean;

  constructor(config: WhitelistConfig = {}) {
    this.storage = new WhitelistStorage(config.storagePath);
    this.autoSave = config.autoSave !== false;
    this.loadFromStorage();
  }

  /**
   * 從儲存載入白名單
   */
  private loadFromStorage(): void {
    // 載入各頻道白名單
    const channels: ChannelType[] = ['line', 'telegram', 'discord'];
    for (const channel of channels) {
      const list = this.storage.loadWhitelist(channel);
      this.whitelists.set(channel, new Set(list));
    }

    // 載入驗證用戶
    const users = this.storage.loadVerifiedUsers();
    for (const user of users) {
      const key = this.getUserKey(user.channel, user.id);
      this.verifiedUsers.set(key, user);
    }
  }

  /**
   * 生成用戶唯一鍵
   */
  private getUserKey(channel: ChannelType, userId: string): string {
    return `${channel}:${userId}`;
  }

  /**
   * 檢查用戶是否在白名單中
   */
  isWhitelisted(channel: ChannelType, userId: string): boolean {
    const whitelist = this.whitelists.get(channel);
    return whitelist?.has(userId) || false;
  }

  /**
   * 添加用戶到白名單
   */
  addToWhitelist(channel: ChannelType, userId: string, displayName?: string): void {
    let whitelist = this.whitelists.get(channel);
    if (!whitelist) {
      whitelist = new Set();
      this.whitelists.set(channel, whitelist);
    }

    if (!whitelist.has(userId)) {
      whitelist.add(userId);

      // 更新驗證用戶資訊
      const key = this.getUserKey(channel, userId);
      const existingUser = this.verifiedUsers.get(key);
      
      this.verifiedUsers.set(key, {
        id: userId,
        channel,
        displayName: displayName || existingUser?.displayName || 'Unknown',
        verifiedAt: existingUser?.verifiedAt || new Date(),
        lastActive: new Date(),
      });

      if (this.autoSave) {
        this.save();
      }
    }
  }

  /**
   * 從白名單移除用戶
   */
  removeFromWhitelist(channel: ChannelType, userId: string): void {
    const whitelist = this.whitelists.get(channel);
    if (whitelist?.has(userId)) {
      whitelist.delete(userId);
      
      // 移除驗證用戶資訊
      const key = this.getUserKey(channel, userId);
      this.verifiedUsers.delete(key);

      if (this.autoSave) {
        this.save();
      }
    }
  }

  /**
   * 清除頻道白名單
   */
  clearWhitelist(channel: ChannelType): void {
    this.whitelists.set(channel, new Set());
    
    // 清除該頻道的驗證用戶
    for (const [key, user] of this.verifiedUsers.entries()) {
      if (user.channel === channel) {
        this.verifiedUsers.delete(key);
      }
    }

    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * 獲取頻道白名單
   */
  getWhitelist(channel: ChannelType): string[] {
    const whitelist = this.whitelists.get(channel);
    return whitelist ? Array.from(whitelist) : [];
  }

  /**
   * 獲取所有驗證用戶
   */
  getVerifiedUsers(): VerifiedUser[] {
    return Array.from(this.verifiedUsers.values());
  }

  /**
   * 獲取特定用戶資訊
   */
  getVerifiedUser(channel: ChannelType, userId: string): VerifiedUser | undefined {
    const key = this.getUserKey(channel, userId);
    return this.verifiedUsers.get(key);
  }

  /**
   * 更新用戶最後活動時間
   */
  updateLastActive(channel: ChannelType, userId: string): void {
    const key = this.getUserKey(channel, userId);
    const user = this.verifiedUsers.get(key);
    if (user) {
      user.lastActive = new Date();
      if (this.autoSave) {
        this.save();
      }
    }
  }

  /**
   * 保存白名單到儲存
   */
  save(): void {
    // 保存各頻道白名單
    for (const [channel, whitelist] of this.whitelists.entries()) {
      this.storage.saveWhitelist(channel, Array.from(whitelist));
    }

    // 保存驗證用戶
    this.storage.saveVerifiedUsers(Array.from(this.verifiedUsers.values()));
  }

  /**
   * 獲取統計資訊
   */
  getStats(): { channel: ChannelType; count: number }[] {
    const stats: { channel: ChannelType; count: number }[] = [];
    for (const [channel, whitelist] of this.whitelists.entries()) {
      stats.push({ channel, count: whitelist.size });
    }
    return stats;
  }
}
