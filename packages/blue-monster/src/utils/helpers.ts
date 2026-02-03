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

/**
 * 建立任務專屬資料夾並複製 system prompt 檔案
 * @param workspaceFolder - 工作區根目錄
 * @param taskId - 任務 ID
 * @param agentName - Agent 名稱
 * @param agentEmoji - Agent Emoji
 * @returns 任務資料夾路徑，或 undefined 如果失敗
 */
export async function setupTaskFolder(
  workspaceFolder: string,
  taskId: string,
  agentName: string,
  agentEmoji: string
): Promise<string | undefined> {
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');
  
  try {
    // 在工作區建立 .bluemonster/tasks/{taskId} 資料夾
    const tasksDir = path.join(workspaceFolder, '.bluemonster', 'tasks', taskId);
    await fs.mkdir(tasksDir, { recursive: true });
    
    // 尋找 copilot-instructions.md 和 me.md 的來源
    const possibleSources = [
      path.join(workspaceFolder, '.vscode'),
      path.join(workspaceFolder, '.github'),
      workspaceFolder
    ];
    
    // 建立 .vscode 資料夾（提供 Copilot 相關指引）
    // Fix: 不再複製到 .vscode 子目錄，避免重複檔案誤導使用者
    
    // 原本邏輯：在 taskRoot 放一份，在 taskRoot/.vscode 放一份 (重複)
    // 修改邏輯：只在 taskRoot/.vscode 放一份，保持 taskRoot 乾淨
    
    const vscodeDir = path.join(tasksDir, '.vscode');
    await fs.mkdir(vscodeDir, { recursive: true });

    // 1. 移動之前可能建立在 root 的檔案到 .vscode (如果有)
    const rootInstr = path.join(tasksDir, 'copilot-instructions.md');
    const rootMe = path.join(tasksDir, 'me.md');
    
    // 清理 root 下的配置檔 (如果存在)，避免混淆
    try { await fs.unlink(rootInstr); } catch {}
    try { await fs.unlink(rootMe); } catch {}
    
    // 2. 將配置檔寫入 .vscode/
    let instructionsFound = false;
    for (const src of possibleSources) {
      const srcFile = path.join(src, 'copilot-instructions.md');
      try {
        await fs.access(srcFile);
        await fs.copyFile(srcFile, path.join(vscodeDir, 'copilot-instructions.md'));
        instructionsFound = true;
        break;
      } catch {}
    }
    
    if (!instructionsFound) {
      // 預設內容...
      const defaultInstructions = `# ${agentEmoji} ${agentName} 任務指引

你是 ${agentName}，一個 BlueMonster AI 助手。

## 查詢當前模型
\`\`\`bash
cat ~/.copilot/config.json 2>/dev/null | grep -E '"model"|"reasoning_effort"'
\`\`\`

回答時同時顯示 model 和 reasoning_effort。
`;
      await fs.writeFile(path.join(vscodeDir, 'copilot-instructions.md'), defaultInstructions, 'utf-8');
    }
    
    let meFound = false;
    for (const src of possibleSources) {
      const srcFile = path.join(src, 'me.md');
      try {
        await fs.access(srcFile);
        await fs.copyFile(srcFile, path.join(vscodeDir, 'me.md'));
        meFound = true;
        break;
      } catch {}
    }
    
    if (!meFound) {
       const defaultMe = `# ${agentEmoji} ${agentName}

## 個性
- 我是 ${agentName}，一個專注的 AI 助手
- 任務 ID: ${taskId}
- 建立時間: ${new Date().toISOString()}

## 用戶偏好
- 回應語言：繁體中文
- 風格：簡潔、專業
`;
      await fs.writeFile(path.join(vscodeDir, 'me.md'), defaultMe, 'utf-8');
    }

    return tasksDir;
  } catch (err) {
    console.error('[BlueMonster] Failed to setup task folder:', err);
    return undefined;
  }
}
