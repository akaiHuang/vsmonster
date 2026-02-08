/**
 * Holography Handshake Manager
 * 管理握手驗證流程
 */

import crypto from 'crypto';
import { ChannelType, VerifiedUser } from '../core/types';
import { WhitelistManager } from './whitelist';

export interface HandshakeConfig {
  /** 握手碼的有效期限（毫秒） */
  codeExpiry?: number;
  /** 握手碼長度 */
  codeLength?: number;
  /** 是否區分大小寫 */
  caseSensitive?: boolean;
}

interface PendingHandshake {
  code: string;
  createdAt: Date;
  expiresAt: Date;
  channel?: ChannelType;
  userId?: string;
}

export class HandshakeManager {
  private config: Required<HandshakeConfig>;
  private whitelistManager: WhitelistManager;
  private pendingHandshakes: Map<string, PendingHandshake> = new Map();
  private activeCode: PendingHandshake | null = null;

  /** Emoji 表情池 — 用於自動握手 */
  private static readonly EMOJI_POOL = [
    '🛸', '🚀', '✨', '👾', '👽', '🌙', '🔮', '🎮', '🎯', '🦊',
    '🐉', '🦑', '🎪', '🎲', '🌈', '🍄', '⚡', '🔥', '💎', '🧊',
    '🎵', '🌺', '🦋', '🐙', '🎃', '🍀', '🌸', '🐳', '🦄', '🪐',
  ];

  constructor(whitelistManager: WhitelistManager, config: HandshakeConfig = {}) {
    this.whitelistManager = whitelistManager;
    this.config = {
      codeExpiry: config.codeExpiry || 5 * 60 * 1000, // 5 分鐘
      codeLength: config.codeLength || 6,
      caseSensitive: config.caseSensitive || false,
    };
  }

  /**
   * 生成新的握手碼（英數字，用於 /handshake 指令）
   */
  generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < this.config.codeLength; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const now = new Date();
    this.activeCode = {
      code,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.codeExpiry),
    };

    return code;
  }

  /**
   * 自動生成 Emoji 握手碼（用於自動握手流程）
   * 當未驗證用戶發送任何訊息時觸發
   */
  generateEmojiCode(channel: ChannelType, userId: string): string {
    const emoji = HandshakeManager.EMOJI_POOL[
      Math.floor(Math.random() * HandshakeManager.EMOJI_POOL.length)
    ];

    const now = new Date();
    const key = `${channel}:${userId}`;
    this.pendingHandshakes.set(key, {
      code: emoji,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.codeExpiry),
      channel,
      userId,
    });

    return emoji;
  }

  /**
   * 嘗試用 emoji 驗證（自動握手流程）
   * 用戶直接發送 emoji，不需要 /handshake 前綴
   */
  verifyEmoji(
    input: string,
    channel: ChannelType,
    userId: string,
    displayName?: string
  ): { success: boolean; message: string; matched: boolean } {
    const key = `${channel}:${userId}`;
    const pending = this.pendingHandshakes.get(key);

    if (!pending) {
      return { success: false, message: '', matched: false };
    }

    // 過期
    if (new Date() > pending.expiresAt) {
      this.pendingHandshakes.delete(key);
      return { success: false, message: '', matched: false };
    }

    const trimmed = input.trim();
    if (trimmed !== pending.code) {
      return { success: false, message: '❌ 驗證碼不正確，請再試一次。', matched: true };
    }

    // 握手成功
    this.whitelistManager.addToWhitelist(channel, userId, displayName);
    this.pendingHandshakes.delete(key);

    return {
      success: true,
      message: '✅ 握手成功！歡迎使用 VSMONSTER 🛸',
      matched: true,
    };
  }

  /**
   * 檢查用戶是否有待處理的 emoji 握手
   */
  hasPendingEmoji(channel: ChannelType, userId: string): boolean {
    const key = `${channel}:${userId}`;
    const pending = this.pendingHandshakes.get(key);
    if (!pending) return false;
    if (new Date() > pending.expiresAt) {
      this.pendingHandshakes.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 驗證握手碼（/handshake 指令用）
   */
  verifyCode(
    inputCode: string,
    channel: ChannelType,
    userId: string,
    displayName?: string
  ): { success: boolean; message: string } {
    // 檢查是否有活動的握手碼
    if (!this.activeCode) {
      return {
        success: false,
        message: '目前沒有有效的握手碼。請在 VS Code 中發起握手請求。'
      };
    }

    // 檢查是否過期
    if (new Date() > this.activeCode.expiresAt) {
      this.activeCode = null;
      return {
        success: false,
        message: '握手碼已過期。請在 VS Code 中重新發起握手請求。'
      };
    }

    // 比較握手碼
    const codeToCompare = this.config.caseSensitive
      ? inputCode
      : inputCode.toUpperCase();
    const activeCodeToCompare = this.config.caseSensitive
      ? this.activeCode.code
      : this.activeCode.code.toUpperCase();

    if (codeToCompare !== activeCodeToCompare) {
      return {
        success: false,
        message: '握手碼不正確。請確認輸入的碼是否正確。'
      };
    }

    // 握手成功，添加到白名單
    this.whitelistManager.addToWhitelist(channel, userId, displayName);

    // 清除已使用的握手碼
    this.activeCode = null;

    return {
      success: true,
      message: '✅ 握手成功！你已被加入白名單。'
    };
  }

  /**
   * 處理 /handshake 命令
   */
  handleHandshakeCommand(
    args: string,
    channel: ChannelType,
    userId: string,
    displayName?: string
  ): { success: boolean; message: string } {
    const code = args.trim();
    
    if (!code) {
      return {
        success: false,
        message: '請提供握手碼。格式：/handshake <code>'
      };
    }

    return this.verifyCode(code, channel, userId, displayName);
  }

  /**
   * 處理 /reset 命令（用戶自行重置驗證狀態）
   */
  handleResetCommand(
    channel: ChannelType,
    userId: string
  ): { success: boolean; message: string } {
    if (!this.whitelistManager.isWhitelisted(channel, userId)) {
      return {
        success: false,
        message: '你尚未通過驗證，無需重置。'
      };
    }

    this.whitelistManager.removeFromWhitelist(channel, userId);

    return {
      success: true,
      message: '✅ 已重置你的驗證狀態。如需重新使用，請再次握手驗證。'
    };
  }

  /**
   * 獲取當前活動的握手碼資訊（不返回碼本身）
   */
  getActiveCodeInfo(): { exists: boolean; expiresAt?: Date } | null {
    if (!this.activeCode) {
      return { exists: false };
    }

    if (new Date() > this.activeCode.expiresAt) {
      this.activeCode = null;
      return { exists: false };
    }

    return {
      exists: true,
      expiresAt: this.activeCode.expiresAt,
    };
  }

  /**
   * 取消當前握手碼
   */
  cancelActiveCode(): void {
    this.activeCode = null;
  }

  /**
   * 獲取握手碼剩餘有效時間（秒）
   */
  getRemainingTime(): number {
    if (!this.activeCode) return 0;
    
    const remaining = this.activeCode.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }
}
