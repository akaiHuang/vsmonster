/**
 * 通用工具函數
 */

// 停用詞列表 (用於搜尋)
export const STOP_WORDS = new Set([
  'the', 'and', 'or', 'but', 'with', 'to', 'for', 'of', 'in', 'on',
  'at', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'as', 'by',
  'it', 'this', 'that', 'these', 'those'
]);

/**
 * 計算兩個文字內容的行數差異 (LCS 演算法)
 */
export function countLineDiff(before: string, after: string): { added: number; removed: number } {
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];
  const maxMatrix = 4_000_000;
  
  if (beforeLines.length === 0 && afterLines.length === 0) {
    return { added: 0, removed: 0 };
  }
  
  if (beforeLines.length * afterLines.length > maxMatrix) {
    const added = Math.max(0, afterLines.length - beforeLines.length);
    const removed = Math.max(0, beforeLines.length - afterLines.length);
    return { added, removed };
  }
  
  const rows = beforeLines.length + 1;
  const cols = afterLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const lcs = dp[rows - 1][cols - 1];
  return {
    added: Math.max(0, afterLines.length - lcs),
    removed: Math.max(0, beforeLines.length - lcs)
  };
}

/**
 * 從 heredoc 寫入命令中提取路徑和內容
 */
export function extractHeredocWrite(command: string): { path: string; content: string } | undefined {
  const match = command.match(/cat\s*>\s*([^\s]+)\s*<<\s*['"]?([A-Za-z0-9_]+)['"]?\s*\r?\n([\s\S]*?)\r?\n\2\b/);
  if (!match) return undefined;
  return { path: match[1], content: match[3] };
}

/**
 * 從命令中提取重定向目標
 */
export function extractRedirectTarget(command: string): string | undefined {
  const match = command.match(/(?:^|\s)(?:>>?|2>|&>)\s*([^\s'"]+)/);
  return match ? match[1] : undefined;
}

/**
 * 轉義 shell 參數
 */
export function escapeShellArg(value: string): string {
  return value.length === 0 ? "''" : `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * 建構 CLI 命令
 */
export function buildCliCommand(template: string, prompt: string, model?: string): string {
  let command = template;
  if (model !== undefined) {
    command = command.split('{model}').join(escapeShellArg(model));
  }
  if (!command.includes('{prompt}')) {
    return `${command} ${escapeShellArg(prompt)}`;
  }
  return command.split('{prompt}').join(escapeShellArg(prompt));
}

/**
 * 正規化文字 (用於搜尋)
 */
export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 將文字分詞 (用於搜尋)
 */
export function tokenize(value: string): string[] {
  const tokens: string[] = [];
  const regex = /[a-z0-9]{2,}|[\u4e00-\u9fff]+/gi;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(value)) !== null) {
    const token = match[0].toLowerCase();
    if (!token) continue;
    if (STOP_WORDS.has(token)) continue;
    tokens.push(token);
  }
  
  return tokens;
}

/**
 * 通用輸入驗證函數
 */
export function normalizeInput<T>(input: object, validator: (candidate: any) => T | undefined): T | undefined {
  if (!input || typeof input !== 'object') return undefined;
  return validator(input);
}
