/**
 * Holography Whitelist Storage
 * 持久化白名單資料到 JSON 檔案
 */

import * as fs from 'fs';
import * as path from 'path';
import { ChannelType, VerifiedUser } from '../core/types';

export class WhitelistStorage {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), 'configs');
    this.ensureDirectory();
  }

  /**
   * 確保目錄存在
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * 獲取白名單檔案路徑
   */
  private getWhitelistPath(channel: ChannelType): string {
    return path.join(this.basePath, `${channel}-whitelist.json`);
  }

  /**
   * 獲取驗證用戶檔案路徑
   */
  private getVerifiedUsersPath(): string {
    return path.join(this.basePath, 'verified-users.json');
  }

  /**
   * 載入頻道白名單
   */
  loadWhitelist(channel: ChannelType): string[] {
    const filePath = this.getWhitelistPath(channel);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
          return list;
        }
      }
    } catch (error) {
      console.warn(`Failed to load ${channel} whitelist:`, error);
    }
    return [];
  }

  /**
   * 保存頻道白名單
   */
  saveWhitelist(channel: ChannelType, list: string[]): void {
    const filePath = this.getWhitelistPath(channel);
    try {
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
    } catch (error) {
      console.warn(`Failed to save ${channel} whitelist:`, error);
    }
  }

  /**
   * 載入驗證用戶
   */
  loadVerifiedUsers(): VerifiedUser[] {
    const filePath = this.getVerifiedUsersPath();
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const users = JSON.parse(content);
        if (Array.isArray(users)) {
          // 轉換日期字串為 Date 物件
          return users.map(user => ({
            ...user,
            verifiedAt: new Date(user.verifiedAt),
            lastActive: user.lastActive ? new Date(user.lastActive) : undefined,
          }));
        }
      }
    } catch (error) {
      console.warn('Failed to load verified users:', error);
    }
    return [];
  }

  /**
   * 保存驗證用戶
   */
  saveVerifiedUsers(users: VerifiedUser[]): void {
    const filePath = this.getVerifiedUsersPath();
    try {
      fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    } catch (error) {
      console.warn('Failed to save verified users:', error);
    }
  }

  /**
   * 清除所有資料
   */
  clearAll(): void {
    const channels: ChannelType[] = ['line', 'telegram', 'discord'];
    for (const channel of channels) {
      const filePath = this.getWhitelistPath(channel);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const verifiedPath = this.getVerifiedUsersPath();
    if (fs.existsSync(verifiedPath)) {
      fs.unlinkSync(verifiedPath);
    }
  }

  /**
   * 備份所有資料
   */
  backup(): string {
    const backupPath = path.join(this.basePath, `backup-${Date.now()}`);
    fs.mkdirSync(backupPath, { recursive: true });

    const channels: ChannelType[] = ['line', 'telegram', 'discord'];
    for (const channel of channels) {
      const sourcePath = this.getWhitelistPath(channel);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(backupPath, `${channel}-whitelist.json`);
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    const verifiedPath = this.getVerifiedUsersPath();
    if (fs.existsSync(verifiedPath)) {
      const destPath = path.join(backupPath, 'verified-users.json');
      fs.copyFileSync(verifiedPath, destPath);
    }

    return backupPath;
  }

  /**
   * 從備份還原
   */
  restore(backupPath: string): void {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup path does not exist: ${backupPath}`);
    }

    const channels: ChannelType[] = ['line', 'telegram', 'discord'];
    for (const channel of channels) {
      const sourcePath = path.join(backupPath, `${channel}-whitelist.json`);
      if (fs.existsSync(sourcePath)) {
        const destPath = this.getWhitelistPath(channel);
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    const verifiedSource = path.join(backupPath, 'verified-users.json');
    if (fs.existsSync(verifiedSource)) {
      const destPath = this.getVerifiedUsersPath();
      fs.copyFileSync(verifiedSource, destPath);
    }
  }
}
