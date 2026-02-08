import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandshakeManager } from './handshake';
import type { WhitelistManager } from './whitelist';

/** Create a minimal mock WhitelistManager (only the methods HandshakeManager uses). */
function createMockWhitelistManager(): WhitelistManager {
  return {
    addToWhitelist: vi.fn(),
    removeFromWhitelist: vi.fn(),
    isWhitelisted: vi.fn().mockReturnValue(false),
    // Stubs for unused methods to satisfy the type
    getWhitelist: vi.fn().mockReturnValue([]),
    getVerifiedUsers: vi.fn().mockReturnValue([]),
    getVerifiedUser: vi.fn(),
    updateLastActive: vi.fn(),
    clearWhitelist: vi.fn(),
    save: vi.fn(),
    getStats: vi.fn().mockReturnValue([]),
  } as unknown as WhitelistManager;
}

describe('HandshakeManager', () => {
  let manager: HandshakeManager;
  let mockWhitelist: WhitelistManager;

  beforeEach(() => {
    mockWhitelist = createMockWhitelistManager();
    manager = new HandshakeManager(mockWhitelist);
  });

  describe('generateCode', () => {
    it('should return a string of default length (6)', () => {
      const code = manager.generateCode();
      expect(typeof code).toBe('string');
      expect(code).toHaveLength(6);
    });

    it('should only contain characters from the allowed set', () => {
      const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < 20; i++) {
        const code = manager.generateCode();
        for (const char of code) {
          expect(allowedChars).toContain(char);
        }
      }
    });

    it('should produce different codes across multiple calls (not deterministic)', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        codes.add(manager.generateCode());
      }
      // With 6 chars from 32-char alphabet, collisions in 20 draws are extremely unlikely
      expect(codes.size).toBeGreaterThan(1);
    });

    it('should respect custom code length', () => {
      const customManager = new HandshakeManager(mockWhitelist, { codeLength: 8 });
      const code = customManager.generateCode();
      expect(code).toHaveLength(8);
    });
  });

  describe('generateEmojiCode', () => {
    it('should return a single emoji string', () => {
      const emoji = manager.generateEmojiCode('telegram', 'user123');
      expect(typeof emoji).toBe('string');
      expect(emoji.length).toBeGreaterThan(0);
    });

    it('should produce emojis from the known pool', () => {
      const knownEmojis = [
        '\uD83D\uDEF8', '\uD83D\uDE80', '\u2728', '\uD83D\uDC7E', '\uD83D\uDC7D',
        '\uD83C\uDF19', '\uD83D\uDD2E', '\uD83C\uDFAE', '\uD83C\uDFAF', '\uD83E\uDD8A',
        '\uD83D\uDC09', '\uD83E\uDD91', '\uD83C\uDFAA', '\uD83C\uDFB2', '\uD83C\uDF08',
        '\uD83C\uDF44', '\u26A1', '\uD83D\uDD25', '\uD83D\uDC8E', '\uD83E\uDDCA',
        '\uD83C\uDFB5', '\uD83C\uDF3A', '\uD83E\uDD8B', '\uD83D\uDC19', '\uD83C\uDF83',
        '\uD83C\uDF40', '\uD83C\uDF38', '\uD83D\uDC33', '\uD83E\uDD84', '\uD83E\uDE90',
      ];
      for (let i = 0; i < 30; i++) {
        const emoji = manager.generateEmojiCode('telegram', `user-${i}`);
        expect(knownEmojis).toContain(emoji);
      }
    });

    it('should track the pending handshake for the user', () => {
      manager.generateEmojiCode('telegram', 'user-abc');
      expect(manager.hasPendingEmoji('telegram', 'user-abc')).toBe(true);
    });

    it('should not have pending handshake for a different user', () => {
      manager.generateEmojiCode('telegram', 'user-abc');
      expect(manager.hasPendingEmoji('telegram', 'user-xyz')).toBe(false);
    });
  });

  describe('verifyEmoji', () => {
    it('should succeed when the correct emoji is provided', () => {
      const emoji = manager.generateEmojiCode('line', 'user1');
      const result = manager.verifyEmoji(emoji, 'line', 'user1', 'TestUser');
      expect(result.success).toBe(true);
      expect(result.matched).toBe(true);
      expect(mockWhitelist.addToWhitelist).toHaveBeenCalledWith('line', 'user1', 'TestUser');
    });

    it('should fail when the wrong emoji is provided', () => {
      manager.generateEmojiCode('line', 'user1');
      const result = manager.verifyEmoji('WRONG', 'line', 'user1');
      expect(result.success).toBe(false);
      expect(result.matched).toBe(true);
    });

    it('should return not-matched when there is no pending handshake', () => {
      const result = manager.verifyEmoji('anything', 'telegram', 'unknown-user');
      expect(result.success).toBe(false);
      expect(result.matched).toBe(false);
    });
  });

  describe('verifyCode', () => {
    it('should succeed with correct code', () => {
      const code = manager.generateCode();
      const result = manager.verifyCode(code, 'telegram', 'user1', 'Alice');
      expect(result.success).toBe(true);
      expect(mockWhitelist.addToWhitelist).toHaveBeenCalledWith('telegram', 'user1', 'Alice');
    });

    it('should fail with wrong code', () => {
      manager.generateCode();
      const result = manager.verifyCode('ZZZZZZ', 'telegram', 'user1');
      expect(result.success).toBe(false);
    });

    it('should fail when no active code exists', () => {
      const result = manager.verifyCode('ABC123', 'telegram', 'user1');
      expect(result.success).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      const code = manager.generateCode();
      const result = manager.verifyCode(code.toLowerCase(), 'telegram', 'user1');
      expect(result.success).toBe(true);
    });
  });

  describe('getActiveCodeInfo / cancelActiveCode / getRemainingTime', () => {
    it('should report no active code initially', () => {
      const info = manager.getActiveCodeInfo();
      expect(info?.exists).toBe(false);
    });

    it('should report active code after generation', () => {
      manager.generateCode();
      const info = manager.getActiveCodeInfo();
      expect(info?.exists).toBe(true);
      expect(info?.expiresAt).toBeInstanceOf(Date);
    });

    it('should cancel active code', () => {
      manager.generateCode();
      manager.cancelActiveCode();
      const info = manager.getActiveCodeInfo();
      expect(info?.exists).toBe(false);
    });

    it('should return remaining time > 0 after generating a code', () => {
      manager.generateCode();
      expect(manager.getRemainingTime()).toBeGreaterThan(0);
    });

    it('should return 0 remaining time when no code is active', () => {
      expect(manager.getRemainingTime()).toBe(0);
    });
  });
});
