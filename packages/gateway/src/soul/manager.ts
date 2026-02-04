import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface SoulConfig {
  name: string;
  role: string;
  tone: string[];
  expertise: string[];
  taskTriggers: string[];
  nonTaskTriggers: string[];
  greetingTemplate: string;
  taskResponseTemplate: string;
  generalResponseTemplate: string;
}

/**
 * Soul 管理器 - 管理 VSMONSTER 的個性和行為
 */
export class SoulManager {
  private soulPath: string;
  private config: SoulConfig;

  constructor(soulPath?: string) {
    this.soulPath = soulPath || path.join(process.cwd(), 'soul.md');
    this.config = this.loadSoul();
  }

  /**
   * 載入 soul.md 配置
   */
  private loadSoul(): SoulConfig {
    try {
      if (!fs.existsSync(this.soulPath)) {
        logger.warn(`Soul file not found: ${this.soulPath}, using defaults`);
        return this.getDefaultConfig();
      }

      const content = fs.readFileSync(this.soulPath, 'utf-8');
      return this.parseSoulMarkdown(content);
    } catch (error) {
      logger.error('Failed to load soul config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * 解析 soul.md 的 Markdown 內容
   */
  private parseSoulMarkdown(content: string): SoulConfig {
    const config = this.getDefaultConfig();

    // 提取任務觸發關鍵字
    const taskSection = content.match(/#### 創建任務的情況：\s*([\s\S]*?)####/);
    if (taskSection) {
      config.taskTriggers = taskSection[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*[「『"]/, '').replace(/[」』"].*$/, '').trim());
    }

    // 提取非任務觸發關鍵字
    const nonTaskSection = content.match(/#### 不創建任務的情況：\s*([\s\S]*?)##/);
    if (nonTaskSection) {
      config.nonTaskTriggers = nonTaskSection[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*[「『"]/, '').replace(/[」』"].*$/, '').trim());
    }

    // 提取問候範本
    const greetingSection = content.match(/### 問候\s*```\s*([\s\S]*?)```/);
    if (greetingSection) {
      config.greetingTemplate = greetingSection[1].trim();
    }

    return config;
  }

  /**
   * 獲取預設配置
   */
  private getDefaultConfig(): SoulConfig {
    return {
      name: 'VSMONSTER',
      role: '智能編程助手',
      tone: ['友善', '專業', '有耐心'],
      expertise: ['程式設計', '除錯', '程式碼審查', '技術諮詢'],
      taskTriggers: [
        '幫我寫',
        '創建一個',
        '實現',
        '修改',
        '除錯',
        '新增',
        '加入',
        '刪除',
        '更新',
      ],
      nonTaskTriggers: [
        '這是什麼',
        '如何學習',
        '解釋',
        '推薦',
        '什麼是',
        '為什麼',
        '你好',
        '嗨',
      ],
      greetingTemplate: '嗨！我是BlueMonster👾，現在我和UFO🛸失聯中，請稍後再試。',
      taskResponseTemplate: '好的，我理解了。讓我幫你完成這個任務。',
      generalResponseTemplate: '關於你的問題：',
    };
  }

  /**
   * 判斷訊息是否應該創建任務
   */
  shouldCreateTask(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // 檢查是否包含任務觸發關鍵字
    const hasTaskTrigger = this.config.taskTriggers.some(trigger =>
      lowerMessage.includes(trigger.toLowerCase())
    );

    // 檢查是否包含非任務觸發關鍵字
    const hasNonTaskTrigger = this.config.nonTaskTriggers.some(trigger =>
      lowerMessage.includes(trigger.toLowerCase())
    );

    // 如果包含非任務關鍵字，優先返回 false
    if (hasNonTaskTrigger) {
      logger.info(`Non-task trigger detected in: "${message}"`);
      return false;
    }

    // 如果包含任務關鍵字
    if (hasTaskTrigger) {
      logger.info(`Task trigger detected in: "${message}"`);
      return true;
    }

    // 預設不創建任務（當作一般對話）
    logger.info(`No clear trigger detected, treating as general chat: "${message}"`);
    return false;
  }

  /**
   * 獲取問候訊息
   */
  getGreeting(): string {
    return this.config.greetingTemplate;
  }

  /**
   * 更新 soul.md 配置（AI 學習）
   */
  async updateSoul(updates: Partial<SoulConfig>): Promise<void> {
    try {
      // 合併配置
      this.config = { ...this.config, ...updates };

      // 重新生成 Markdown
      const markdown = this.generateSoulMarkdown();

      // 寫入檔案
      fs.writeFileSync(this.soulPath, markdown, 'utf-8');

      logger.info('Soul configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update soul configuration:', error);
      throw error;
    }
  }

  /**
   * 生成 soul.md 的 Markdown 內容
   */
  private generateSoulMarkdown(): string {
    return `# VSMONSTER Soul 配置

這個檔案定義了 VSMONSTER 的個性和行為模式。

## 基本個性

- **名稱**: ${this.config.name}
- **角色**: ${this.config.role}
- **語氣**: ${this.config.tone.join('、')}
- **專長**: ${this.config.expertise.join('、')}

## 行為準則

### 判斷標準

#### 創建任務的情況：
${this.config.taskTriggers.map(t => `- 「${t}」`).join('\n')}

#### 不創建任務的情況：
${this.config.nonTaskTriggers.map(t => `- 「${t}」`).join('\n')}

## 回應範本

### 問候
\`\`\`
${this.config.greetingTemplate}
\`\`\`

### 收到任務請求
\`\`\`
${this.config.taskResponseTemplate}
\`\`\`

### 一般諮詢
\`\`\`
${this.config.generalResponseTemplate}
\`\`\`

---

**注意**: 這個檔案由 AI 動態更新，最後更新時間：${new Date().toISOString()}
`;
  }

  /**
   * 獲取當前配置
   */
  getConfig(): SoulConfig {
    return { ...this.config };
  }
}
