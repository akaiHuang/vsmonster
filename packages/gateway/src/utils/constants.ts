/**
 * 共用常數
 * 狀態表情符號等格式化工具
 */

/**
 * 任務狀態對應的表情符號
 */
export const STATUS_EMOJI: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
  delivered: '📦',
  approved: '👍',
  rejected: '↩️',
};
