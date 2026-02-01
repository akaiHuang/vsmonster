import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import { GatewayClient } from './gateway-client';
import { CopilotBridge } from './copilot-bridge';
import { TerminalManager } from './terminal-manager';
import { TaskView } from './task-view';
import { ChannelsView } from './channels-view';
import { MCPView } from './mcp-view';
import { ChatTreeView } from './chat-tree-view';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let gatewayClient: GatewayClient | undefined;
let copilotBridge: CopilotBridge | undefined;
let terminalManager: TerminalManager | undefined;
let chatTreeView: ChatTreeView | undefined;
let statusBarItem: vscode.StatusBarItem;

const FIRST_RUN_KEY = 'vsmonster.hasCompletedSetup';
const INSTANCE_LOCK_FILE = path.join(os.tmpdir(), 'vsmonster-instance.lock');

// Localization helper
function t(key: string): string {
  return vscode.l10n.t(key);
}

/**
 * 檢查是否有其他 VSCode 實例正在運行 VSMONSTER
 */
function checkSingleInstance(context: vscode.ExtensionContext): boolean {
  try {
    if (fs.existsSync(INSTANCE_LOCK_FILE)) {
      const lockContent = fs.readFileSync(INSTANCE_LOCK_FILE, 'utf-8');
      const lockData = JSON.parse(lockContent);
      
      // 檢查鎖文件的 PID 是否還在運行
      const isProcessRunning = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      
      if (lockData.pid && isProcessRunning(lockData.pid)) {
        // 另一個實例正在運行
        console.warn(`Another VSMONSTER instance is running (PID: ${lockData.pid})`);
        return false;
      } else {
        // 鎖文件無效，刪除它
        fs.unlinkSync(INSTANCE_LOCK_FILE);
      }
    }
    
    // 創建新的鎖文件
    fs.writeFileSync(INSTANCE_LOCK_FILE, JSON.stringify({
      pid: process.pid,
      workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      timestamp: Date.now()
    }));
    
    // 清理函數
    context.subscriptions.push({
      dispose: () => {
        try {
          if (fs.existsSync(INSTANCE_LOCK_FILE)) {
            fs.unlinkSync(INSTANCE_LOCK_FILE);
          }
        } catch (err) {
          console.error('Failed to clean up lock file:', err);
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error checking single instance:', error);
    return true; // 發生錯誤時仍然允許啟動
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('VSMONSTER extension is now active');
  
  // 檢查單一實例
  if (!checkSingleInstance(context)) {
    const msg = vscode.env.language.startsWith('zh') 
      ? 'VSMONSTER 已在另一個 VS Code 視窗中運行。為避免衝突，此視窗的 VSMONSTER 已停用。'
      : 'VSMONSTER is already running in another VS Code window. This instance has been disabled to avoid conflicts.';
    
    vscode.window.showWarningMessage(msg);
    
    // 創建停用狀態的狀態欄
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = '$(error) VSMONSTER (Disabled)';
    statusBarItem.tooltip = msg;
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    
    return; // 停止啟動
  }

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(plug) VSMONSTER';
  statusBarItem.tooltip = `VSMONSTER: ${t('Disconnected')}`;
  statusBarItem.command = 'vsmonster.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Initialize services
  terminalManager = new TerminalManager();
  copilotBridge = new CopilotBridge(context);
  
  // Register task view
  const taskView = new TaskView();
  vscode.window.registerTreeDataProvider('vsmonsterTasks', taskView);
  
  // Register channels view
  const channelsView = new ChannelsView();
  vscode.window.registerTreeDataProvider('vsmonsterChannels', channelsView);
  
  // Register MCP view
  const mcpView = new MCPView();
  vscode.window.registerTreeDataProvider('vsmonsterMCP', mcpView);

  // Register chat view (純原生 TreeView，最快！)
  chatTreeView = new ChatTreeView();
  vscode.window.registerTreeDataProvider('vsmonsterChat', chatTreeView);

  // 設定初始連接狀態
  vscode.commands.executeCommand('setContext', 'vsmonster.connected', false);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vsmonster.connect', () => connectToGateway(context, taskView, channelsView, mcpView)),
    vscode.commands.registerCommand('vsmonster.disconnect', () => disconnectFromGateway(channelsView, mcpView)),
    vscode.commands.registerCommand('vsmonster.showStatus', showStatus),
    vscode.commands.registerCommand('vsmonster.startGateway', startGateway),
    vscode.commands.registerCommand('vsmonster.openSettings', openSettings),
    vscode.commands.registerCommand('vsmonster.sendToChannel', sendToChannel),
    vscode.commands.registerCommand('vsmonster.refreshTasks', () => taskView.refresh()),
    vscode.commands.registerCommand('vsmonster.refreshChannels', () => channelsView.refresh()),
    vscode.commands.registerCommand('vsmonster.refreshMCP', () => mcpView.refresh()),
    vscode.commands.registerCommand('vsmonster.clearTasks', () => {
      taskView.clearTasks();
      vscode.window.showInformationMessage('已清除所有任務');
    }),
    vscode.commands.registerCommand('vsmonster.runSetupWizard', () => runSetupWizard(context)),
    vscode.commands.registerCommand('vsmonster.openQuickStart', openQuickStart),
    vscode.commands.registerCommand('vsmonster.switchLanguage', switchLanguage),
    vscode.commands.registerCommand('vsmonster.selectModel', () => selectModel(copilotBridge)),
    vscode.commands.registerCommand('vsmonster.refreshChat', () => chatTreeView?.refresh()),
    vscode.commands.registerCommand('vsmonster.clearChat', () => chatTreeView?.clear()),
    vscode.commands.registerCommand('vsmonster.copyMessage', (content: string) => {
      vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage('已複製訊息');
    }),
    vscode.commands.registerCommand('vsmonster.sendToCopilot', () => sendToCopilot()),
    vscode.commands.registerCommand('vsmonster.sendToLine', () => sendToChannelQuick('line')),
    vscode.commands.registerCommand('vsmonster.sendToTelegram', () => sendToChannelQuick('telegram')),
    vscode.commands.registerCommand('vsmonster.sendToDiscord', () => sendToChannelQuick('discord')),
  );

  // Check if first run
  const hasCompletedSetup = context.globalState.get<boolean>(FIRST_RUN_KEY);
  
  if (!hasCompletedSetup) {
    // First run, show setup wizard
    void showWelcomeMessage(context, taskView).catch(error => {
      console.error('[VSMONSTER] Failed to show welcome message:', error);
    });
  } else {
    // Auto-connect if configured
    const config = vscode.workspace.getConfiguration('vsmonster');
    if (config.get('autoConnect')) {
      void connectToGateway(context, taskView, channelsView, mcpView).catch(error => {
        console.error('[VSMONSTER] Auto-connect failed:', error);
      });
    }
  }
}

/**
 * Switch language command
 */
async function switchLanguage() {
  const selection = await vscode.window.showQuickPick(
    [
      { label: 'English', value: 'en' },
      { label: '繁體中文', value: 'zh-TW' },
    ],
    {
      placeHolder: t('Select language'),
      title: 'VSMONSTER - Language / 語言',
    }
  );

  if (selection) {
    const config = vscode.workspace.getConfiguration('vsmonster');
    await config.update('language', selection.value, vscode.ConfigurationTarget.Global);
    
    const reload = await vscode.window.showInformationMessage(
      t('Language changed. Please reload VS Code.'),
      t('Reload'),
      t('Cancel')
    );
    
    if (reload === t('Reload')) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}

/**
 * Select AI model command - dynamically fetches available Copilot models
 */
async function selectModel(bridge: CopilotBridge | undefined) {
  console.log('[VSMONSTER] selectModel command triggered');
  
  if (!bridge) {
    vscode.window.showErrorMessage(t('CopilotBridge not initialized'));
    return;
  }

  let models = bridge.getAvailableModels();

  if (models.length === 0) {
    // 顯示載入中提示（僅在無快取時）
    models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('Loading available AI models...'),
        cancellable: false
      },
      async () => {
        return await bridge.refreshAvailableModels();
      }
    );
  } else {
    // 背景更新模型列表，避免阻塞 UI
    void bridge.refreshAvailableModels().catch(error => {
      console.error('[VSMONSTER] Failed to refresh models in background:', error);
    });
  }

  if (models.length === 0) {
    vscode.window.showWarningMessage(
      t('No Copilot models available. Please make sure you have GitHub Copilot installed and are signed in.')
    );
    return;
  }

  // Create quick pick items from available models
  const items = models.map(model => ({
    label: model.name,
    description: `${model.family} (${model.vendor})`,
    detail: `Max tokens: ${model.maxInputTokens.toLocaleString()}`,
    value: model.id
  }));

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select AI model'),
    title: 'VSMONSTER - Select Copilot Model',
  });

  if (selection) {
    const config = vscode.workspace.getConfiguration('vsmonster');
    await config.update('defaultModel', selection.value, vscode.ConfigurationTarget.Global);
    await bridge.switchModel(selection.value);
    vscode.window.showInformationMessage(t('Model switched to: ') + selection.label);
  }
}

/**
 * Show welcome message and setup guide
 */
async function showWelcomeMessage(context: vscode.ExtensionContext, taskView: TaskView) {
  // Detect language for welcome message
  const vscodeLocale = vscode.env.language;
  const isChineseLocale = vscodeLocale.startsWith('zh');
  
  const welcomeMsg = isChineseLocale 
    ? '🦞 歡迎使用 VSMONSTER！透過 LINE/Telegram/Discord 遠端操控 VS Code Copilot'
    : '🦞 Welcome to VSMONSTER! Control VS Code Copilot remotely via LINE/Telegram/Discord';
  
  const startSetup = isChineseLocale ? '開始設定' : 'Start Setup';
  const viewTutorial = isChineseLocale ? '查看教學' : 'View Tutorial';
  const later = isChineseLocale ? '稍後設定' : 'Later';
  
  const selection = await vscode.window.showInformationMessage(
    welcomeMsg,
    startSetup,
    viewTutorial,
    later
  );

  switch (selection) {
    case startSetup:
    case '開始設定':
      await runSetupWizard(context);
      break;
    case viewTutorial:
    case '查看教學':
      await openQuickStart();
      break;
    case later:
    case '稍後設定':
      const laterMsg = isChineseLocale
        ? '你可以隨時透過命令面板執行 "VSMONSTER: 執行設定向導" 開始設定'
        : 'You can run "VSMONSTER: Run Setup Wizard" from the command palette anytime';
      vscode.window.showInformationMessage(laterMsg);
      break;
  }
}

/**
 * Run setup wizard
 */
async function runSetupWizard(context: vscode.ExtensionContext) {
  const vscodeLocale = vscode.env.language;
  const isChineseLocale = vscodeLocale.startsWith('zh');
  
  // Step 1: Check Copilot
  const hasCopilot = await checkCopilotExtension();
  
  if (!hasCopilot) {
    const copilotMsg = isChineseLocale
      ? 'VSMONSTER 需要 GitHub Copilot 擴展才能運作'
      : 'VSMONSTER requires GitHub Copilot extension to work';
    const installBtn = isChineseLocale ? '安裝 GitHub Copilot' : 'Install GitHub Copilot';
    const continueBtn = isChineseLocale ? '繼續（不安裝）' : 'Continue (without installing)';
    
    const installCopilot = await vscode.window.showWarningMessage(
      copilotMsg,
      installBtn,
      continueBtn
    );

    if (installCopilot === installBtn || installCopilot === '安裝 GitHub Copilot') {
      await vscode.commands.executeCommand(
        'workbench.extensions.search',
        'GitHub.copilot'
      );
      return; // Wait for user to install and restart
    }
  }

  // Step 2: Select messaging platform
  const telegramDesc = isChineseLocale ? '設定最簡單，推薦新手' : 'Easiest setup, recommended for beginners';
  const lineDesc = isChineseLocale ? '適合台灣、日本用戶' : 'Best for Taiwan/Japan users';
  const discordDesc = isChineseLocale ? '適合團隊協作' : 'Best for team collaboration';
  const skipDesc = isChineseLocale ? '跳過頻道設定' : 'Skip channel setup';
  const skipLabel = isChineseLocale ? '稍後設定' : 'Skip for now';
  const placeholder = isChineseLocale ? '選擇要綁定的社群平台' : 'Select a messaging platform to connect';
  const stepTitle = isChineseLocale ? 'VSMONSTER 設定向導 - 步驟 1/3' : 'VSMONSTER Setup Wizard - Step 1/3';
  
  const channel = await vscode.window.showQuickPick(
    [
      { label: '$(comment-discussion) Telegram', value: 'telegram', description: telegramDesc },
      { label: '$(comment) LINE', value: 'line', description: lineDesc },
      { label: '$(organization) Discord', value: 'discord', description: discordDesc },
      { label: `$(clock) ${skipLabel}`, value: 'skip', description: skipDesc },
    ],
    {
      placeHolder: placeholder,
      title: stepTitle,
    }
  );

  if (!channel) return;

  if (channel.value !== 'skip') {
    // Show setup guide
    await showChannelSetupGuide(channel.value);
  }

  // Step 3: Start Gateway
  const startMsg = isChineseLocale
    ? '設定完成！是否現在啟動 Gateway 服務？'
    : 'Setup complete! Would you like to start the Gateway service now?';
  const startBtn = isChineseLocale ? '啟動 Gateway' : 'Start Gateway';
  const laterBtn = isChineseLocale ? '稍後啟動' : 'Start Later';
  
  const startNow = await vscode.window.showInformationMessage(
    startMsg,
    startBtn,
    laterBtn
  );

  if (startNow === startBtn || startNow === '啟動 Gateway') {
    await startGateway();
    
    // Wait for Gateway to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to connect
    const taskView = new TaskView();
    const channelsView = new ChannelsView();
    const mcpView = new MCPView();
    await connectToGateway(context, taskView, channelsView, mcpView);
  }

  // Mark setup complete
  await context.globalState.update(FIRST_RUN_KEY, true);

  const completeMsg = isChineseLocale
    ? '🎉 VSMONSTER 設定完成！你現在可以透過社群軟體控制 VS Code Copilot 了'
    : '🎉 VSMONSTER setup complete! You can now control VS Code Copilot via messaging apps';
  vscode.window.showInformationMessage(completeMsg);
}

/**
 * 檢查 Copilot 擴展
 */
async function checkCopilotExtension(): Promise<boolean> {
  const copilot = vscode.extensions.getExtension('GitHub.copilot');
  const copilotChat = vscode.extensions.getExtension('GitHub.copilot-chat');
  return !!(copilot || copilotChat);
}

/**
 * 顯示頻道設定教學
 */
async function showChannelSetupGuide(channel: string) {
  const guides: Record<string, { title: string; steps: string[] }> = {
    telegram: {
      title: 'Telegram Bot 設定',
      steps: [
        '1. 在 Telegram 搜尋 @BotFather',
        '2. 發送 /newbot 建立新 Bot',
        '3. 依指示輸入 Bot 名稱和用戶名',
        '4. 複製取得的 Bot Token',
        '5. 在專案的 configs/config.json 中填入 Token',
      ],
    },
    line: {
      title: 'LINE Messaging API 設定',
      steps: [
        '1. 前往 LINE Developers Console',
        '2. 建立新的 Messaging API Channel',
        '3. 取得 Channel Access Token 和 Channel Secret',
        '4. 在 configs/config.json 中填入憑證',
        '5. 啟動 Gateway 後設定 Webhook URL',
      ],
    },
    discord: {
      title: 'Discord Bot 設定',
      steps: [
        '1. 前往 Discord Developer Portal',
        '2. 建立新的 Application 和 Bot',
        '3. 取得 Bot Token 和 Application ID',
        '4. 邀請 Bot 到你的伺服器',
        '5. 在 configs/config.json 中填入憑證',
      ],
    },
  };

  const guide = guides[channel];
  if (!guide) return;

  // 建立 WebView 顯示詳細教學
  const panel = vscode.window.createWebviewPanel(
    'vsmonsterSetup',
    `VSMONSTER - ${guide.title}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getSetupWebviewContent(channel, guide);
}

/**
 * 產生設定頁面 HTML
 */
function getSetupWebviewContent(channel: string, guide: { title: string; steps: string[] }): string {
  const docLinks: Record<string, string> = {
    telegram: 'https://core.telegram.org/bots#creating-a-new-bot',
    line: 'https://developers.line.biz/en/docs/messaging-api/getting-started/',
    discord: 'https://discord.com/developers/docs/getting-started',
  };

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guide.title}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 {
      color: var(--vscode-textLink-foreground);
      border-bottom: 1px solid var(--vscode-textSeparator-foreground);
      padding-bottom: 10px;
    }
    .step {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    .step-number {
      color: var(--vscode-textLink-foreground);
      font-weight: bold;
      font-size: 1.2em;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
    .actions {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-textSeparator-foreground);
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      margin-right: 10px;
      cursor: pointer;
      border-radius: 4px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .tip {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      padding: 10px;
      border-radius: 4px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>🦞 ${guide.title}</h1>
  
  <div class="steps">
    ${guide.steps.map((step, i) => `
      <div class="step">
        <span class="step-number">步驟 ${i + 1}</span>
        <p>${step.replace(/^\d+\.\s*/, '')}</p>
      </div>
    `).join('')}
  </div>

  <div class="tip">
    <strong>💡 提示:</strong> 完成設定後，在專案根目錄執行 <code>pnpm dev</code> 啟動 Gateway
  </div>

  <div class="actions">
    <a href="${docLinks[channel]}" target="_blank">
      <button>📖 查看官方文件</button>
    </a>
  </div>
</body>
</html>`;
}

/**
 * 開啟快速開始文件
 */
async function openQuickStart() {
  // 嘗試開啟專案內的文件
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const quickStartPath = vscode.Uri.joinPath(folder.uri, 'docs', 'quick-start.md');
      try {
        await vscode.workspace.fs.stat(quickStartPath);
        const doc = await vscode.workspace.openTextDocument(quickStartPath);
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      } catch {
        // 文件不存在，繼續
      }
    }
  }

  // 如果找不到文件，顯示基本說明
  vscode.window.showInformationMessage(
    '快速開始: 1) 執行 vsmonster init 設定頻道 2) 執行 pnpm dev 啟動 Gateway 3) 在 VS Code 連接 Gateway'
  );
}

async function connectToGateway(
  context: vscode.ExtensionContext, 
  taskView: TaskView,
  channelsView: ChannelsView,
  mcpView: MCPView
) {
  const config = vscode.workspace.getConfiguration('vsmonster');
  const gatewayUrl = config.get<string>('gatewayUrl') || 'ws://localhost:3000';

  try {
    gatewayClient = new GatewayClient(gatewayUrl);
    
    gatewayClient.on('connected', () => {
      statusBarItem.text = '$(check) VSMONSTER';
      statusBarItem.tooltip = 'VSMONSTER: 已連接';
      vscode.window.showInformationMessage('已連接到 VSMONSTER Gateway');
      
      // 更新連接狀態 context（用於工具列按鈕顯示）
      vscode.commands.executeCommand('setContext', 'vsmonster.connected', true);
      
      // 請求初始狀態
      gatewayClient?.send({ type: 'get_status' });
    });

    gatewayClient.on('disconnected', () => {
      statusBarItem.text = '$(plug) VSMONSTER';
      statusBarItem.tooltip = 'VSMONSTER: 未連接';
      
      // 更新連接狀態 context
      vscode.commands.executeCommand('setContext', 'vsmonster.connected', false);
      
      // 清空視圖
      channelsView.setChannels([]);
      mcpView.setServers([]);
    });
    
    // 處理初始狀態
    gatewayClient.on('init', (data: any) => {
      if (data.channels) {
        channelsView.setChannels(data.channels);
      }
      if (data.mcpServers) {
        mcpView.setServers(data.mcpServers);
      }
    });
    
    // 處理頻道更新
    gatewayClient.on('channel_update', (data: any) => {
      channelsView.updateChannel(data.name, data);
    });
    
    // 處理 MCP 更新
    gatewayClient.on('mcp_update', (data: any) => {
      mcpView.updateServer(data.name, data);
    });

    gatewayClient.on('new_task', async (data: any) => {
      await handleNewTask(data, taskView);
    });
    
    gatewayClient.on('chat_message', async (data: any) => {
      await handleChatMessage(data);
    });

    gatewayClient.on('switch_model', async (data: any) => {
      await copilotBridge?.switchModel(data.model);
    });

    await gatewayClient.connect();
  } catch (error) {
    vscode.window.showErrorMessage(`連接失敗: ${error}`);
  }
}

function disconnectFromGateway(channelsView: ChannelsView, mcpView: MCPView) {
  if (gatewayClient) {
    gatewayClient.disconnect();
    gatewayClient = undefined;
    statusBarItem.text = '$(plug) VSMONSTER';
    statusBarItem.tooltip = 'VSMONSTER: 未連接';
    vscode.window.showInformationMessage('已斷開 VSMONSTER Gateway 連接');
    
    // 更新連接狀態 context
    vscode.commands.executeCommand('setContext', 'vsmonster.connected', false);
    
    // 清空視圖
    channelsView.setChannels([]);
    mcpView.setServers([]);
  }
}

async function handleNewTask(data: any, taskView: TaskView) {
  const { task, instruction, media } = data;
  
  // 更新任務視圖
  taskView.addTask(task);

  // 使用 Copilot 處理任務
  if (copilotBridge) {
    try {
      // 顯示進度
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `執行任務: ${instruction.slice(0, 30)}...`,
          cancellable: true,
        },
        async (progress, token) => {
          // 逐一執行子任務
          for (const subtask of task.subtasks || []) {
            if (token.isCancellationRequested) break;

            progress.report({ 
              message: subtask.description,
              increment: 100 / (task.subtasks?.length || 1)
            });

            // 發送到 Copilot
            const result = await copilotBridge!.executeSubtask(subtask, instruction);
            
            // 回報進度
            gatewayClient?.send({
              type: 'task_update',
              taskId: task.id,
              subTaskId: subtask.id,
              status: 'completed',
              result,
            });
          }

          // 任務完成
          gatewayClient?.send({
            type: 'copilot_response',
            channel: task.channel,
            userId: task.userId,
            content: `✅ 任務完成: ${instruction}`,
          });
        }
      );
    } catch (error) {
      gatewayClient?.send({
        type: 'task_update',
        taskId: task.id,
        status: 'failed',
        error: String(error),
      });
    }
  }
}

/**
 * 處理一般聊天訊息（不創建任務）
 */
async function handleChatMessage(data: any) {
  const { channel, userId, userName, message, media } = data;
  
  // 在聊天視圖中顯示收到的訊息
  chatTreeView?.addIncomingMessage(
    channel,
    userName || userId,
    message
  );
  
  if (!copilotBridge) {
    console.warn('CopilotBridge not initialized');
    return;
  }

  try {
    // 使用 Copilot 進行對話
    const response = await copilotBridge.chat(message, userId);
    
    // 在聊天視圖中顯示 AI 回覆
    chatTreeView?.addAIResponse(response, channel);
    
    // 回傳回應到 Gateway
    gatewayClient?.send({
      type: 'copilot_response',
      channel,
      userId,
      content: response,
    });
  } catch (error) {
    console.error('Failed to handle chat message:', error);
    
    const errorMsg = `抱歉，處理訊息時發生錯誤: ${error}`;
    
    // 在聊天視圖中顯示錯誤
    chatTreeView?.addAIResponse(errorMsg, channel);
    
    gatewayClient?.send({
      type: 'copilot_response',
      channel,
      userId,
      content: errorMsg,
    });
  }
}

function showStatus() {
  const isConnected = gatewayClient?.isConnected() || false;
  
  vscode.window.showQuickPick([
    {
      label: isConnected ? '$(check) 已連接' : '$(x) 未連接',
      description: 'Gateway 連接狀態',
    },
    {
      label: '$(server) 啟動 Gateway',
      description: '在終端機中啟動 Gateway 服務',
      action: 'startGateway',
    },
    {
      label: isConnected ? '$(debug-disconnect) 斷開連接' : '$(plug) 連接 Gateway',
      action: isConnected ? 'disconnect' : 'connect',
    },
    {
      label: '$(gear) 設定',
      action: 'settings',
    },
  ]).then(item => {
    if (!item) return;
    
    switch ((item as any).action) {
      case 'connect':
        vscode.commands.executeCommand('vsmonster.connect');
        break;
      case 'disconnect':
        vscode.commands.executeCommand('vsmonster.disconnect');
        break;
      case 'startGateway':
        vscode.commands.executeCommand('vsmonster.startGateway');
        break;
      case 'settings':
        vscode.commands.executeCommand('vsmonster.openSettings');
        break;
    }
  });
}

async function startGateway() {
  if (!terminalManager) return;
  
  const terminal = terminalManager.getOrCreateTerminal('VSMONSTER Gateway');
  terminal.show();
  terminal.sendText('npx vsmonster start');
}

function openSettings() {
  console.log('[VSMONSTER] Opening settings...');
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:vsmonster.vsmonster'
  );
}

async function sendToChannel() {
  if (!gatewayClient?.isConnected()) {
    vscode.window.showWarningMessage('請先連接到 Gateway');
    return;
  }

  const message = await vscode.window.showInputBox({
    prompt: '輸入要發送到社群頻道的訊息',
    placeHolder: '例如: 任務已完成，請查看...',
  });

  if (message) {
    gatewayClient.send({
      type: 'broadcast',
      message,
    });
  }
}

/**
 * 發送訊息到 Copilot（原生 InputBox，超快）
 */
async function sendToCopilot() {
  const message = await vscode.window.showInputBox({
    prompt: '輸入要發送給 Copilot 的訊息',
    placeHolder: '例如: 幫我寫一個函數...',
  });

  if (!message) return;

  // 顯示發送的訊息
  chatTreeView?.addOutgoingMessage('copilot', message);

  if (!copilotBridge) {
    vscode.window.showWarningMessage('Copilot 未初始化');
    return;
  }

  try {
    const response = await copilotBridge.chat(message);
    chatTreeView?.addAIResponse(response);
  } catch (error) {
    vscode.window.showErrorMessage(`Copilot 錯誤: ${error}`);
  }
}

/**
 * 快速發送訊息到指定頻道（原生 InputBox，超快）
 */
async function sendToChannelQuick(channel: string) {
  if (!gatewayClient?.isConnected()) {
    vscode.window.showWarningMessage('請先連接到 Gateway');
    return;
  }

  const channelNames: Record<string, string> = {
    line: 'LINE',
    telegram: 'Telegram',
    discord: 'Discord'
  };

  const message = await vscode.window.showInputBox({
    prompt: `輸入要發送到 ${channelNames[channel] || channel} 的訊息`,
    placeHolder: '輸入訊息內容...',
  });

  if (!message) return;

  // 顯示發送的訊息
  chatTreeView?.addOutgoingMessage(channel, message);

  gatewayClient.send({
    type: 'send_to_channel',
    channel,
    content: message,
  });
}

export function deactivate() {
  if (gatewayClient) {
    gatewayClient.disconnect();
    gatewayClient = undefined;
  }
}
