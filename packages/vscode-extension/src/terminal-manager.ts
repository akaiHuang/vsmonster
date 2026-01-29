import * as vscode from 'vscode';

/**
 * 終端機管理器
 * 負責管理 VS Code 終端機的建立和控制
 */
export class TerminalManager {
  private terminals: Map<string, vscode.Terminal> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // 監聽終端機關閉事件
    this.disposables.push(
      vscode.window.onDidCloseTerminal(terminal => {
        for (const [name, t] of this.terminals.entries()) {
          if (t === terminal) {
            this.terminals.delete(name);
            break;
          }
        }
      })
    );
  }

  /**
   * 取得或建立終端機
   */
  getOrCreateTerminal(name: string): vscode.Terminal {
    let terminal = this.terminals.get(name);
    
    if (!terminal || this.isTerminalClosed(terminal)) {
      terminal = vscode.window.createTerminal({
        name,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });
      this.terminals.set(name, terminal);
    }

    return terminal;
  }

  /**
   * 執行命令
   */
  async executeCommand(
    terminalName: string,
    command: string,
    options?: { show?: boolean; focus?: boolean }
  ): Promise<void> {
    const terminal = this.getOrCreateTerminal(terminalName);
    
    if (options?.show !== false) {
      terminal.show(options?.focus !== false);
    }
    
    terminal.sendText(command);
  }

  /**
   * 執行多個命令
   */
  async executeCommands(
    terminalName: string,
    commands: string[],
    options?: { show?: boolean; focus?: boolean }
  ): Promise<void> {
    const terminal = this.getOrCreateTerminal(terminalName);
    
    if (options?.show !== false) {
      terminal.show(options?.focus !== false);
    }
    
    for (const command of commands) {
      terminal.sendText(command);
    }
  }

  /**
   * 建立新的 MCP 終端機
   */
  createMCPTerminal(mcpName: string): vscode.Terminal {
    const name = `MCP: ${mcpName}`;
    return this.getOrCreateTerminal(name);
  }

  /**
   * 關閉終端機
   */
  closeTerminal(name: string): void {
    const terminal = this.terminals.get(name);
    if (terminal) {
      terminal.dispose();
      this.terminals.delete(name);
    }
  }

  /**
   * 關閉所有終端機
   */
  closeAllTerminals(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  /**
   * 檢查終端機是否已關閉
   */
  private isTerminalClosed(terminal: vscode.Terminal): boolean {
    // VS Code 沒有直接的 API 來檢查終端機狀態
    // 我們通過嘗試發送空命令來檢測
    try {
      terminal.processId; // 如果終端機已關閉，這會拋出異常
      return false;
    } catch {
      return true;
    }
  }

  /**
   * 取得所有終端機
   */
  getAllTerminals(): vscode.Terminal[] {
    return Array.from(this.terminals.values());
  }

  /**
   * 銷毀
   */
  dispose(): void {
    this.closeAllTerminals();
    this.disposables.forEach(d => d.dispose());
  }
}
