import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import { GatewayClient } from './gateway-client';
import { CopilotBridge } from './copilot-bridge';
import { TerminalManager } from './terminal-manager';
import { TaskView } from './task-view';

let gatewayClient: GatewayClient | undefined;
let copilotBridge: CopilotBridge | undefined;
let terminalManager: TerminalManager | undefined;
let statusBarItem: vscode.StatusBarItem;

const FIRST_RUN_KEY = 'vsmonster.hasCompletedSetup';

export async function activate(context: vscode.ExtensionContext) {
  console.log('VSMONSTER extension is now active');

  // 建立狀態列項目
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(plug) VSMONSTER';
  statusBarItem.tooltip = 'VSMONSTER: 未連接';
  statusBarItem.command = 'vsmonster.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 初始化服務
  terminalManager = new TerminalManager();
  copilotBridge = new CopilotBridge(context);
  
  // 註冊任務視圖
  const taskView = new TaskView();
  vscode.window.registerTreeDataProvider('vsmonsterTasks', taskView);

  // 註冊命令
  context.subscriptions.push(
    vscode.commands.registerCommand('vsmonster.connect', () => connectToGateway(context, taskView)),
    vscode.commands.registerCommand('vsmonster.disconnect', disconnectFromGateway),
    vscode.commands.registerCommand('vsmonster.showStatus', showStatus),
    vscode.commands.registerCommand('vsmonster.startGateway', startGateway),
    vscode.commands.registerCommand('vsmonster.openSettings', openSettings),
    vscode.commands.registerCommand('vsmonster.sendToChannel', sendToChannel),
    vscode.commands.registerCommand('vsmonster.refreshTasks', () => taskView.refresh()),
    vscode.commands.registerCommand('vsmonster.runSetupWizard', () => runSetupWizard(context)),
    vscode.commands.registerCommand('vsmonster.openQuickStart', openQuickStart),
  );

  // 檢查是否首次啟動
  const hasCompletedSetup = context.globalState.get<boolean>(FIRST_RUN_KEY);
  
  if (!hasCompletedSetup) {
    // 首次啟動，執行設定向導
    await showWelcomeMessage(context, taskView);
  } else {
    // 自動連接 (如果配置了)
    const config = vscode.workspace.getConfiguration('vsmonster');
    if (config.get('autoConnect')) {
      await connectToGateway(context, taskView);
    }
  }
}

/**
 * 顯示歡迎訊息和設定引導
 */
async function showWelcomeMessage(context: vscode.ExtensionContext, taskView: TaskView) {
  const selection = await vscode.window.showInformationMessage(
    '🦞 歡迎使用 VSMONSTER！透過 LINE/Telegram/Discord 遠端操控 VS Code Copilot',
    '開始設定',
    '查看教學',
    '稍後設定'
  );

  switch (selection) {
    case '開始設定':
      await runSetupWizard(context);
      break;
    case '查看教學':
      await openQuickStart();
      break;
    case '稍後設定':
      vscode.window.showInformationMessage(
        '你可以隨時透過命令面板執行 "VSMONSTER: 執行設定向導" 開始設定'
      );
      break;
  }
}

/**
 * 執行設定向導
 */
async function runSetupWizard(context: vscode.ExtensionContext) {
  // Step 1: 檢查 Copilot
  const hasCopilot = await checkCopilotExtension();
  
  if (!hasCopilot) {
    const installCopilot = await vscode.window.showWarningMessage(
      'VSMONSTER 需要 GitHub Copilot 擴展才能運作',
      '安裝 GitHub Copilot',
      '繼續（不安裝）'
    );

    if (installCopilot === '安裝 GitHub Copilot') {
      await vscode.commands.executeCommand(
        'workbench.extensions.search',
        'GitHub.copilot'
      );
      return; // 等用戶安裝後重新啟動
    }
  }

  // Step 2: 選擇社群平台
  const channel = await vscode.window.showQuickPick(
    [
      { label: '$(comment-discussion) Telegram', value: 'telegram', description: '設定最簡單，推薦新手' },
      { label: '$(comment) LINE', value: 'line', description: '適合台灣、日本用戶' },
      { label: '$(organization) Discord', value: 'discord', description: '適合團隊協作' },
      { label: '$(clock) 稍後設定', value: 'skip', description: '跳過頻道設定' },
    ],
    {
      placeHolder: '選擇要綁定的社群平台',
      title: 'VSMONSTER 設定向導 - 步驟 1/3',
    }
  );

  if (!channel) return;

  if (channel.value !== 'skip') {
    // 顯示設定教學
    await showChannelSetupGuide(channel.value);
  }

  // Step 3: 啟動 Gateway
  const startNow = await vscode.window.showInformationMessage(
    '設定完成！是否現在啟動 Gateway 服務？',
    '啟動 Gateway',
    '稍後啟動'
  );

  if (startNow === '啟動 Gateway') {
    await startGateway();
    
    // 等待 Gateway 啟動
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 嘗試連接
    const taskView = new TaskView();
    await connectToGateway(context, taskView);
  }

  // 標記設定完成
  await context.globalState.update(FIRST_RUN_KEY, true);

  vscode.window.showInformationMessage(
    '🎉 VSMONSTER 設定完成！你現在可以透過社群軟體控制 VS Code Copilot 了'
  );
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

async function connectToGateway(context: vscode.ExtensionContext, taskView: TaskView) {
  const config = vscode.workspace.getConfiguration('vsmonster');
  const gatewayUrl = config.get<string>('gatewayUrl') || 'ws://localhost:3000';

  try {
    gatewayClient = new GatewayClient(gatewayUrl);
    
    gatewayClient.on('connected', () => {
      statusBarItem.text = '$(check) VSMONSTER';
      statusBarItem.tooltip = 'VSMONSTER: 已連接';
      vscode.window.showInformationMessage('已連接到 VSMONSTER Gateway');
    });

    gatewayClient.on('disconnected', () => {
      statusBarItem.text = '$(plug) VSMONSTER';
      statusBarItem.tooltip = 'VSMONSTER: 未連接';
    });

    gatewayClient.on('new_task', async (data: any) => {
      await handleNewTask(data, taskView);
    });

    gatewayClient.on('switch_model', async (data: any) => {
      await copilotBridge?.switchModel(data.model);
    });

    await gatewayClient.connect();
  } catch (error) {
    vscode.window.showErrorMessage(`連接失敗: ${error}`);
  }
}

function disconnectFromGateway() {
  if (gatewayClient) {
    gatewayClient.disconnect();
    gatewayClient = undefined;
    statusBarItem.text = '$(plug) VSMONSTER';
    statusBarItem.tooltip = 'VSMONSTER: 未連接';
    vscode.window.showInformationMessage('已斷開 VSMONSTER Gateway 連接');
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
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'vsmonster'
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

export function deactivate() {
  disconnectFromGateway();
}
