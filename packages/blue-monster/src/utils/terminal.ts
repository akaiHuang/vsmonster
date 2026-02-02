/**
 * 終端機相關工具
 */
import * as vscode from 'vscode';

const TERMINAL_NAME = 'BlueMonster';

// 共享終端機實例
let sharedTerminal: vscode.Terminal | undefined;
let sharedTerminalCwd: string | undefined;

/**
 * 監聽終端機關閉事件
 */
export function setupTerminalCloseHandler(): vscode.Disposable {
  return vscode.window.onDidCloseTerminal((t) => {
    if (t === sharedTerminal) {
      sharedTerminal = undefined;
      sharedTerminalCwd = undefined;
    }
  });
}

/**
 * 取得或建立共享終端機
 */
export function getTerminal(cwd?: string): vscode.Terminal {
  if (cwd && cwd !== sharedTerminalCwd) {
    sharedTerminal?.dispose();
    sharedTerminal = undefined;
    sharedTerminalCwd = undefined;
  }

  if (!sharedTerminal) {
    sharedTerminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      cwd: cwd || undefined
    });
    sharedTerminalCwd = cwd;
  }

  return sharedTerminal;
}

/**
 * 清理終端機資源
 */
export function disposeTerminal(): void {
  sharedTerminal?.dispose();
  sharedTerminal = undefined;
  sharedTerminalCwd = undefined;
}
