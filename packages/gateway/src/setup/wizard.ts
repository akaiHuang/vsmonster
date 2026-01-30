/**
 * VSMONSTER 設定向導
 * 引導用戶完成首次設定
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { logger } from '../utils/logger';

export interface SetupResult {
  success: boolean;
  channel?: string;
  configPath?: string;
  error?: string;
}

export interface SetupOptions {
  skipVscode?: boolean;
  skipChannel?: boolean;
}

/**
 * 設定向導類別
 */
export class SetupWizard {
  private rl: readline.Interface;
  private configDir: string;
  private configPath: string;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    // 找到 configs 目錄
    this.configDir = this.findConfigDir();
    this.configPath = path.join(this.configDir, 'config.json');
  }

  /**
   * 找到配置目錄
   */
  private findConfigDir(): string {
    // 從當前目錄往上查找 configs 目錄
    let dir = process.cwd();
    while (dir !== '/') {
      const configDir = path.join(dir, 'configs');
      if (fs.existsSync(configDir)) {
        return configDir;
      }
      dir = path.dirname(dir);
    }
    // 預設在當前目錄建立
    return path.join(process.cwd(), 'configs');
  }

  /**
   * 提問並等待回答
   */
  private ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 顯示選項並等待選擇
   */
  private async select(question: string, options: string[]): Promise<number> {
    console.log(question);
    options.forEach((opt, idx) => {
      console.log(`  ${idx + 1}. ${opt}`);
    });
    
    while (true) {
      const answer = await this.ask('請輸入數字選擇: ');
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= options.length) {
        return num - 1;
      }
      console.log('❌ 無效選擇，請重新輸入');
    }
  }

  /**
   * 確認是否繼續
   */
  private async confirm(question: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const answer = await this.ask(`${question} ${hint}: `);
    
    if (!answer) {
      return defaultYes;
    }
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  /**
   * 執行完整設定向導
   */
  async run(options: SetupOptions = {}): Promise<SetupResult> {
    try {
      this.printWelcome();

      // 步驟 1: 檢查環境
      console.log('\n📋 步驟 1/4: 檢查環境...\n');
      await this.checkEnvironment();

      // 步驟 2: 檢查 VS Code
      if (!options.skipVscode) {
        console.log('\n📋 步驟 2/4: 檢查 VS Code 連接...\n');
        await this.checkVSCode();
      }

      // 步驟 3: 設定社群頻道
      let selectedChannel: string | undefined;
      if (!options.skipChannel) {
        console.log('\n📋 步驟 3/4: 設定社群頻道...\n');
        selectedChannel = await this.setupChannel();
      }

      // 步驟 4: 完成設定
      console.log('\n📋 步驟 4/4: 完成設定...\n');
      await this.finalize();

      this.printSuccess(selectedChannel);

      return {
        success: true,
        channel: selectedChannel,
        configPath: this.configPath,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ 設定失敗: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      this.rl.close();
    }
  }

  /**
   * 顯示歡迎訊息
   */
  private printWelcome(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║      VSMONSTER - VS Code Copilot 社群整合平台                   ║
║                                                               ║
║   讓你透過 LINE、Telegram、Discord 遠端操控 VS Code Copilot   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

歡迎使用 VSMONSTER 設定向導！
本向導將協助你完成以下設定:

  1. ✅ 檢查環境需求
  2. 🔗 連接 VS Code 與 Copilot
  3. 📱 綁定社群軟體 (LINE / Telegram / Discord)
  4. 🚀 完成設定並啟動

`);
  }

  /**
   * 檢查環境
   */
  private async checkEnvironment(): Promise<void> {
    const checks = [
      { name: 'Node.js 版本', check: () => this.checkNodeVersion() },
      { name: 'pnpm 套件管理器', check: () => this.checkPnpm() },
      { name: '配置目錄', check: () => this.checkConfigDir() },
    ];

    for (const { name, check } of checks) {
      process.stdout.write(`  檢查 ${name}... `);
      try {
        const result = await check();
        console.log(`✅ ${result}`);
      } catch (error) {
        console.log(`❌ 失敗`);
        throw error;
      }
    }
  }

  /**
   * 檢查 Node.js 版本
   */
  private checkNodeVersion(): string {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0], 10);
    
    if (major < 20) {
      throw new Error(`Node.js 版本過低 (${version})，需要 v20.0.0 或以上`);
    }
    
    return version;
  }

  /**
   * 檢查 pnpm
   */
  private checkPnpm(): string {
    try {
      const version = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
      return `v${version}`;
    } catch {
      throw new Error('找不到 pnpm，請執行: npm install -g pnpm');
    }
  }

  /**
   * 檢查配置目錄
   */
  private checkConfigDir(): string {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      return `已建立 ${this.configDir}`;
    }
    return `存在 ${this.configDir}`;
  }

  /**
   * 檢查 VS Code
   */
  private async checkVSCode(): Promise<void> {
    // 檢查 VS Code 是否安裝
    process.stdout.write('  檢查 VS Code 安裝... ');
    const vscodeInstalled = this.checkVSCodeInstalled();
    
    if (!vscodeInstalled) {
      console.log('❌ 未安裝');
      console.log('\n⚠️  VS Code 未安裝或不在 PATH 中');
      console.log('請前往 https://code.visualstudio.com/ 下載安裝');
      
      const continueAnyway = await this.confirm('\n是否繼續設定（稍後再安裝 VS Code）？', false);
      if (!continueAnyway) {
        throw new Error('需要安裝 VS Code');
      }
    } else {
      console.log('✅ 已安裝');
    }

    // 檢查 VSMONSTER 擴展
    process.stdout.write('  檢查 VSMONSTER 擴展... ');
    const extensionInstalled = this.checkVSMONSTERExtension();
    
    if (!extensionInstalled) {
      console.log('⚠️  未安裝');
      console.log('\n需要安裝 VSMONSTER VS Code 擴展才能使用完整功能');
      
      const installNow = await this.confirm('是否現在安裝擴展？');
      if (installNow) {
        await this.installVSMONSTERExtension();
      } else {
        console.log('\n📝 稍後可以在 VS Code 中搜尋 "VSMONSTER" 安裝擴展');
      }
    } else {
      console.log('✅ 已安裝');
    }

    // 檢查 Copilot
    process.stdout.write('  檢查 GitHub Copilot... ');
    const copilotInstalled = this.checkCopilotExtension();
    
    if (!copilotInstalled) {
      console.log('⚠️  未安裝');
      console.log('\n需要安裝 GitHub Copilot 擴展');
      console.log('請在 VS Code 中搜尋 "GitHub Copilot" 並安裝');
      console.log('注意: 需要 GitHub Copilot 訂閱才能使用');
    } else {
      console.log('✅ 已安裝');
    }
  }

  /**
   * 檢查 VS Code 是否安裝
   */
  private checkVSCodeInstalled(): boolean {
    try {
      execSync('code --version', { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 檢查 VSMONSTER 擴展
   */
  private checkVSMONSTERExtension(): boolean {
    try {
      const extensions = execSync('code --list-extensions', { 
        encoding: 'utf-8', 
        stdio: 'pipe' 
      });
      return extensions.toLowerCase().includes('vsmonster');
    } catch {
      return false;
    }
  }

  /**
   * 檢查 Copilot 擴展
   */
  private checkCopilotExtension(): boolean {
    try {
      const extensions = execSync('code --list-extensions', { 
        encoding: 'utf-8', 
        stdio: 'pipe' 
      });
      return extensions.toLowerCase().includes('github.copilot');
    } catch {
      return false;
    }
  }

  /**
   * 安裝 VSMONSTER 擴展
   */
  private async installVSMONSTERExtension(): Promise<void> {
    console.log('\n📦 正在從本地安裝 VSMONSTER 擴展...');
    
    // 目前先提示手動安裝
    // TODO: 實作 VSIX 打包和安裝
    console.log('\n由於擴展尚未發布到市集，請按照以下步驟手動安裝:');
    console.log('  1. 在專案根目錄執行: pnpm extension:build');
    console.log('  2. 在 VS Code 中按 F1，輸入 "Install from VSIX"');
    console.log('  3. 選擇 packages/vscode-extension/vsmonster-*.vsix 檔案');
  }

  /**
   * 設定社群頻道
   */
  private async setupChannel(): Promise<string> {
    const channels = [
      { name: 'LINE', value: 'line', desc: '適合台灣、日本用戶' },
      { name: 'Telegram', value: 'telegram', desc: '全球通用，設定簡單' },
      { name: 'Discord', value: 'discord', desc: '適合團隊協作' },
      { name: '稍後設定', value: 'skip', desc: '跳過此步驟' },
    ];

    console.log('請選擇要綁定的社群軟體:');
    console.log('(你可以稍後再新增其他頻道)\n');

    const idx = await this.select('', channels.map(c => `${c.name} - ${c.desc}`));
    const selected = channels[idx];

    if (selected.value === 'skip') {
      console.log('\n📝 已跳過頻道設定');
      console.log('稍後可以執行 vsmonster channel add <channel> 來新增頻道');
      return 'none';
    }

    console.log(`\n你選擇了: ${selected.name}`);
    console.log('');

    // 根據選擇的頻道執行設定
    switch (selected.value) {
      case 'line':
        await this.setupLineChannel();
        break;
      case 'telegram':
        await this.setupTelegramChannel();
        break;
      case 'discord':
        await this.setupDiscordChannel();
        break;
    }

    return selected.value;
  }

  /**
   * 設定 LINE 頻道
   */
  private async setupLineChannel(): Promise<void> {
    console.log('📱 LINE 頻道設定\n');
    console.log('需要以下資訊 (從 LINE Developers Console 取得):');
    console.log('  - Channel Access Token');
    console.log('  - Channel Secret');
    console.log('\n詳細步驟請參考: docs/setup-line.md\n');

    const hasCredentials = await this.confirm('你是否已經有這些憑證？');

    if (!hasCredentials) {
      await this.showLineSetupGuide();
      return;
    }

    const channelAccessToken = await this.ask('請輸入 Channel Access Token: ');
    const channelSecret = await this.ask('請輸入 Channel Secret: ');

    if (!channelAccessToken || !channelSecret) {
      console.log('\n❌ 憑證不完整，請稍後再設定');
      return;
    }

    // 儲存配置
    await this.saveChannelConfig('line', {
      channelAccessToken,
      channelSecret,
    });

    console.log('\n✅ LINE 頻道配置已儲存');
    console.log('\n⚠️  重要: 你還需要設定 Webhook URL');
    console.log('啟動 Gateway 後，將 Webhook URL 設為:');
    console.log('  https://<your-ngrok-url>/webhook/line');
  }

  /**
   * 顯示 LINE 設定指南
   */
  private async showLineSetupGuide(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    LINE 頻道設定指南                           ║
╚═══════════════════════════════════════════════════════════════╝

步驟 1: 建立 LINE Developers 帳號
  → 前往 https://developers.line.biz/
  → 使用 LINE 帳號登入

步驟 2: 建立 Messaging API Channel
  → 點擊 "Create a new channel"
  → 選擇 "Messaging API"
  → 填寫 Bot 名稱和描述

步驟 3: 取得憑證
  → Channel Access Token: Messaging API 標籤 → Issue
  → Channel Secret: Basic settings 標籤

步驟 4: 重新執行設定
  → vsmonster init

詳細圖文教學: docs/setup-line.md
`);

    const openDocs = await this.confirm('是否要開啟詳細教學文件？');
    if (openDocs) {
      const docsPath = path.join(this.configDir, '..', 'docs', 'setup-line.md');
      try {
        execSync(`open "${docsPath}" || xdg-open "${docsPath}" || start "" "${docsPath}"`, {
          stdio: 'ignore',
        });
      } catch {
        console.log(`\n請手動開啟: ${docsPath}`);
      }
    }
  }

  /**
   * 設定 Telegram 頻道
   */
  private async setupTelegramChannel(): Promise<void> {
    console.log('📱 Telegram 頻道設定\n');
    console.log('需要以下資訊:');
    console.log('  - Bot Token (從 @BotFather 取得)');
    console.log('\n詳細步驟請參考: docs/setup-telegram.md\n');

    const hasToken = await this.confirm('你是否已經有 Bot Token？');

    if (!hasToken) {
      await this.showTelegramSetupGuide();
      return;
    }

    const botToken = await this.ask('請輸入 Bot Token: ');

    if (!botToken) {
      console.log('\n❌ Token 不完整，請稍後再設定');
      return;
    }

    // 驗證 Token 格式
    if (!this.validateTelegramToken(botToken)) {
      console.log('\n⚠️  Token 格式似乎不正確，但仍會儲存');
    }

    // 儲存配置
    await this.saveChannelConfig('telegram', {
      botToken,
    });

    console.log('\n✅ Telegram 頻道配置已儲存');
    console.log('\n📝 Telegram 預設使用 Polling 模式，無需設定 Webhook');
  }

  /**
   * 驗證 Telegram Token 格式
   */
  private validateTelegramToken(token: string): boolean {
    // Telegram token 格式: 數字:字母數字
    return /^\d+:[A-Za-z0-9_-]+$/.test(token);
  }

  /**
   * 顯示 Telegram 設定指南
   */
  private async showTelegramSetupGuide(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  Telegram 頻道設定指南                         ║
╚═══════════════════════════════════════════════════════════════╝

步驟 1: 開啟 Telegram
  → 搜尋 @BotFather
  → 開始對話

步驟 2: 建立 Bot
  → 發送 /newbot
  → 輸入 Bot 顯示名稱 (例: My VSMONSTER Bot)
  → 輸入 Bot 用戶名 (必須以 bot 結尾，例: my_vsmonster_bot)

步驟 3: 取得 Token
  → BotFather 會回覆 Token
  → 格式類似: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
  → 複製這個 Token

步驟 4: 重新執行設定
  → vsmonster init

詳細圖文教學: docs/setup-telegram.md
`);

    const openDocs = await this.confirm('是否要開啟詳細教學文件？');
    if (openDocs) {
      const docsPath = path.join(this.configDir, '..', 'docs', 'setup-telegram.md');
      try {
        execSync(`open "${docsPath}" || xdg-open "${docsPath}" || start "" "${docsPath}"`, {
          stdio: 'ignore',
        });
      } catch {
        console.log(`\n請手動開啟: ${docsPath}`);
      }
    }
  }

  /**
   * 設定 Discord 頻道
   */
  private async setupDiscordChannel(): Promise<void> {
    console.log('📱 Discord 頻道設定\n');
    console.log('需要以下資訊 (從 Discord Developer Portal 取得):');
    console.log('  - Bot Token');
    console.log('  - Application ID');
    console.log('  - Public Key (選填)');
    console.log('\n詳細步驟請參考: docs/setup-discord.md\n');

    const hasCredentials = await this.confirm('你是否已經有這些憑證？');

    if (!hasCredentials) {
      await this.showDiscordSetupGuide();
      return;
    }

    const botToken = await this.ask('請輸入 Bot Token: ');
    const applicationId = await this.ask('請輸入 Application ID: ');
    const publicKey = await this.ask('請輸入 Public Key (可選，直接 Enter 跳過): ');

    if (!botToken || !applicationId) {
      console.log('\n❌ 憑證不完整，請稍後再設定');
      return;
    }

    // 儲存配置
    const config: Record<string, string> = {
      botToken,
      applicationId,
    };
    
    if (publicKey) {
      config.publicKey = publicKey;
    }

    await this.saveChannelConfig('discord', config);

    console.log('\n✅ Discord 頻道配置已儲存');
  }

  /**
   * 顯示 Discord 設定指南
   */
  private async showDiscordSetupGuide(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   Discord 頻道設定指南                         ║
╚═══════════════════════════════════════════════════════════════╝

步驟 1: 建立 Discord Application
  → 前往 https://discord.com/developers/applications
  → 點擊 "New Application"
  → 輸入名稱並建立

步驟 2: 建立 Bot
  → 在左側選單點擊 "Bot"
  → 點擊 "Add Bot"
  → 點擊 "Reset Token" 取得 Bot Token

步驟 3: 取得 Application ID
  → 在 "General Information" 頁面
  → 複製 "Application ID"

步驟 4: 邀請 Bot 到伺服器
  → 在 "OAuth2" → "URL Generator"
  → 勾選 "bot" 和 "applications.commands"
  → 選擇需要的權限
  → 複製 URL 並在瀏覽器開啟

步驟 5: 重新執行設定
  → vsmonster init

詳細圖文教學: docs/setup-discord.md
`);

    const openDocs = await this.confirm('是否要開啟詳細教學文件？');
    if (openDocs) {
      const docsPath = path.join(this.configDir, '..', 'docs', 'setup-discord.md');
      if (fs.existsSync(docsPath)) {
        try {
          execSync(`open "${docsPath}" || xdg-open "${docsPath}" || start "" "${docsPath}"`, {
            stdio: 'ignore',
          });
        } catch {
          console.log(`\n請手動開啟: ${docsPath}`);
        }
      } else {
        console.log(`\n📝 文件尚未建立，請參考 docs/setup-telegram.md 的格式`);
      }
    }
  }

  /**
   * 儲存頻道配置
   */
  private async saveChannelConfig(channel: string, config: Record<string, string>): Promise<void> {
    let fullConfig: Record<string, any> = {};

    // 讀取現有配置
    if (fs.existsSync(this.configPath)) {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      fullConfig = JSON.parse(content);
    } else {
      // 複製範例配置
      const examplePath = path.join(this.configDir, 'config.example.json');
      if (fs.existsSync(examplePath)) {
        const content = fs.readFileSync(examplePath, 'utf-8');
        fullConfig = JSON.parse(content);
      }
    }

    // 更新頻道配置
    if (!fullConfig.channels) {
      fullConfig.channels = {};
    }
    fullConfig.channels[channel] = config;

    // 儲存配置
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(fullConfig, null, 2),
      'utf-8'
    );

    logger.info(`Channel config saved: ${channel}`);
  }

  /**
   * 完成設定
   */
  private async finalize(): Promise<void> {
    // 確認配置檔案存在
    if (!fs.existsSync(this.configPath)) {
      // 複製範例配置
      const examplePath = path.join(this.configDir, 'config.example.json');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, this.configPath);
        console.log('✅ 已建立配置檔案');
      }
    } else {
      console.log('✅ 配置檔案已存在');
    }

    // 詢問是否要啟用 ngrok
    const enableNgrok = await this.confirm('\n是否要啟用 ngrok 隧道？（用於接收 Webhook）');
    
    if (enableNgrok) {
      const ngrokToken = await this.ask('請輸入 ngrok Auth Token (可從 https://ngrok.com 取得): ');
      
      if (ngrokToken) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(content);
        config.tunnel = {
          enabled: true,
          authtoken: ngrokToken,
          region: 'ap',
        };
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log('✅ ngrok 配置已儲存');
      }
    }
  }

  /**
   * 顯示成功訊息
   */
  private printSuccess(channel?: string): void {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎉  VSMONSTER 設定完成！                                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📁 配置檔案: ${this.configPath}
${channel && channel !== 'none' ? `📱 已設定頻道: ${channel.toUpperCase()}` : ''}

下一步:

  1. 啟動 Gateway:
     $ pnpm dev
     或
     $ vsmonster start

  2. 在 VS Code 中:
     → 安裝 VSMONSTER 擴展
     → 按 Cmd+Shift+P，執行 "VSMONSTER: Connect"

  3. 開始使用:
     → 在 ${channel === 'line' ? 'LINE' : channel === 'telegram' ? 'Telegram' : 'Discord'} 中發送訊息給 Bot
     → Bot 會將指令傳送給 VS Code Copilot

需要幫助？
  → 文件: docs/
  → 問題回報: GitHub Issues

`);
  }

  /**
   * 快速檢查是否已完成設定
   */
  static isConfigured(): boolean {
    const configPaths = [
      path.join(process.cwd(), 'configs', 'config.json'),
      path.join(process.cwd(), '..', 'configs', 'config.json'),
      path.join(process.cwd(), '..', '..', 'configs', 'config.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(content);
          // 檢查是否有任何頻道配置
          if (config.channels) {
            const hasValidChannel = Object.values(config.channels).some(
              (ch: any) => ch && (ch.channelAccessToken || ch.botToken)
            );
            if (hasValidChannel) {
              return true;
            }
          }
        } catch {
          continue;
        }
      }
    }

    return false;
  }
}
