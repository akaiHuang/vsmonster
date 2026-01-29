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

export async function activate(context: vscode.ExtensionContext) {
  console.log('vsMolt extension is now active');

  // 建立狀態列項目
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(plug) vsMolt';
  statusBarItem.tooltip = 'vsMolt: 未連接';
  statusBarItem.command = 'vsmolt.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 初始化服務
  terminalManager = new TerminalManager();
  copilotBridge = new CopilotBridge(context);
  
  // 註冊任務視圖
  const taskView = new TaskView();
  vscode.window.registerTreeDataProvider('vsmoltTasks', taskView);

  // 註冊命令
  context.subscriptions.push(
    vscode.commands.registerCommand('vsmolt.connect', () => connectToGateway(context, taskView)),
    vscode.commands.registerCommand('vsmolt.disconnect', disconnectFromGateway),
    vscode.commands.registerCommand('vsmolt.showStatus', showStatus),
    vscode.commands.registerCommand('vsmolt.startGateway', startGateway),
    vscode.commands.registerCommand('vsmolt.openSettings', openSettings),
    vscode.commands.registerCommand('vsmolt.sendToChannel', sendToChannel),
    vscode.commands.registerCommand('vsmolt.refreshTasks', () => taskView.refresh()),
  );

  // 自動連接 (如果配置了)
  const config = vscode.workspace.getConfiguration('vsmolt');
  if (config.get('autoConnect')) {
    await connectToGateway(context, taskView);
  }
}

async function connectToGateway(context: vscode.ExtensionContext, taskView: TaskView) {
  const config = vscode.workspace.getConfiguration('vsmolt');
  const gatewayUrl = config.get<string>('gatewayUrl') || 'ws://localhost:3000';

  try {
    gatewayClient = new GatewayClient(gatewayUrl);
    
    gatewayClient.on('connected', () => {
      statusBarItem.text = '$(check) vsMolt';
      statusBarItem.tooltip = 'vsMolt: 已連接';
      vscode.window.showInformationMessage('已連接到 vsMolt Gateway');
    });

    gatewayClient.on('disconnected', () => {
      statusBarItem.text = '$(plug) vsMolt';
      statusBarItem.tooltip = 'vsMolt: 未連接';
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
    statusBarItem.text = '$(plug) vsMolt';
    statusBarItem.tooltip = 'vsMolt: 未連接';
    vscode.window.showInformationMessage('已斷開 vsMolt Gateway 連接');
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
        vscode.commands.executeCommand('vsmolt.connect');
        break;
      case 'disconnect':
        vscode.commands.executeCommand('vsmolt.disconnect');
        break;
      case 'startGateway':
        vscode.commands.executeCommand('vsmolt.startGateway');
        break;
      case 'settings':
        vscode.commands.executeCommand('vsmolt.openSettings');
        break;
    }
  });
}

async function startGateway() {
  if (!terminalManager) return;
  
  const terminal = terminalManager.getOrCreateTerminal('vsMolt Gateway');
  terminal.show();
  terminal.sendText('npx vsmolt start');
}

function openSettings() {
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'vsmolt'
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
