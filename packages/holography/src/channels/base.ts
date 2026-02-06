/**
 * HologramChannel 基底類別
 * 所有頻道實現都繼承此類別
 */

import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ChannelType, 
  IHologramChannel, 
  IncomingMessage, 
  OutgoingMessage 
} from '../core/types';

export abstract class HologramChannel implements IHologramChannel {
  abstract readonly name: ChannelType;
  protected whitelist: string[] = [];
  protected whitelistPath: string;

  constructor(channelName: string) {
    this.whitelistPath = path.join(process.cwd(), 'configs', `${channelName}-whitelist.json`);
    this.loadWhitelist();
  }

  abstract initialize(): Promise<void>;
  abstract parseMessage(event: any): IncomingMessage | null;
  abstract sendMessage(userId: string, message: OutgoingMessage): Promise<void>;
  
  async sendTextMessage(userId: string, text: string, extra?: any): Promise<void> {
    await this.sendMessage(userId, { text, ...extra });
  }

  // ============================================
  // 白名單管理
  // ============================================

  isWhitelisted(userId: string): boolean {
    // 如果沒有設定白名單，需要握手
    if (this.whitelist.length === 0) {
      return false;
    }
    return this.whitelist.includes(userId);
  }

  async addToWhitelist(userId: string): Promise<void> {
    if (!this.whitelist.includes(userId)) {
      this.whitelist.push(userId);
      this.saveWhitelist();
      this.log('info', `Added user ${userId} to whitelist`);
    }
  }

  removeFromWhitelist(userId: string): void {
    this.whitelist = this.whitelist.filter(id => id !== userId);
    this.saveWhitelist();
    this.log('info', `Removed user ${userId} from whitelist`);
  }

  clearWhitelist(): void {
    this.whitelist = [];
    this.saveWhitelist();
  }

  getWhitelist(): string[] {
    return [...this.whitelist];
  }

  protected setWhitelist(list: string[]): void {
    this.whitelist = [...list];
  }

  protected loadWhitelist(): void {
    try {
      if (fs.existsSync(this.whitelistPath)) {
        const content = fs.readFileSync(this.whitelistPath, 'utf8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
          this.whitelist = Array.from(new Set([...this.whitelist, ...list]));
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to load whitelist:', error);
    }
  }

  protected saveWhitelist(): void {
    try {
      fs.mkdirSync(path.dirname(this.whitelistPath), { recursive: true });
      fs.writeFileSync(this.whitelistPath, JSON.stringify(this.whitelist, null, 2));
    } catch (error) {
      this.log('warn', 'Failed to save whitelist:', error);
    }
  }

  /**
   * 生成隨機的 webhook 密鑰
   */
  protected generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // ============================================
  // 日誌輔助
  // ============================================

  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]): void {
    const prefix = `[Holography:${this.name}]`;
    switch (level) {
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
      case 'debug':
        console.debug(prefix, message, ...args);
        break;
    }
  }
}

export { HologramChannel as default };
