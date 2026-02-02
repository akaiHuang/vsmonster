import * as vscode from 'vscode';

export interface MCPServer {
  name: string;
  status: 'running' | 'stopped' | 'error';
  command?: string;
  lastError?: string;
}

/**
 * MCP 服務視圖
 * 顯示 MCP 服務器狀態
 */
export class MCPView implements vscode.TreeDataProvider<MCPItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MCPItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private servers: MCPServer[] = [];

  /**
   * 刷新視圖
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 設定服務器列表
   */
  setServers(servers: MCPServer[]): void {
    this.servers = servers;
    this.refresh();
  }

  /**
   * 更新服務器狀態
   */
  updateServer(name: string, updates: Partial<MCPServer>): void {
    const index = this.servers.findIndex(s => s.name === name);
    if (index !== -1) {
      this.servers[index] = { ...this.servers[index], ...updates };
      this.refresh();
    }
  }

  /**
   * 添加服務器
   */
  addServer(server: MCPServer): void {
    const existing = this.servers.findIndex(s => s.name === server.name);
    if (existing !== -1) {
      this.servers[existing] = server;
    } else {
      this.servers.push(server);
    }
    this.refresh();
  }

  getTreeItem(element: MCPItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MCPItem): Thenable<MCPItem[]> {
    if (!element) {
      if (this.servers.length === 0) {
        // 沒有 MCP 服務器時顯示提示
        return Promise.resolve([
          new MCPItem({
            name: '尚未配置 MCP 服務',
            status: 'stopped',
          }, true)
        ]);
      }
      return Promise.resolve(
        this.servers.map(server => new MCPItem(server))
      );
    }
    return Promise.resolve([]);
  }
}

/**
 * MCP 服務項目
 */
class MCPItem extends vscode.TreeItem {
  constructor(
    public readonly server: MCPServer,
    private readonly isPlaceholder: boolean = false
  ) {
    super(
      server.name,
      vscode.TreeItemCollapsibleState.None
    );

    if (isPlaceholder) {
      this.iconPath = new vscode.ThemeIcon('info');
      this.description = '在 config.json 中配置';
      this.command = {
        command: 'vsmonster.openSettings',
        title: '開啟設定',
      };
    } else {
      // 根據狀態設定圖示
      const statusConfig: Record<string, { icon: string; color: string; desc: string }> = {
        running: { icon: 'play-circle', color: 'charts.green', desc: '運行中' },
        stopped: { icon: 'stop-circle', color: 'charts.yellow', desc: '已停止' },
        error: { icon: 'error', color: 'charts.red', desc: '錯誤' },
      };

      const config = statusConfig[server.status] || statusConfig.stopped;
      
      this.iconPath = new vscode.ThemeIcon(
        config.icon,
        new vscode.ThemeColor(config.color)
      );

      this.description = config.desc;
      
      if (server.command) {
        this.tooltip = `命令: ${server.command}`;
      }

      if (server.lastError) {
        this.tooltip = `錯誤: ${server.lastError}`;
      }

      // 添加右鍵選單命令
      this.contextValue = server.status === 'running' ? 'mcpRunning' : 'mcpStopped';
    }
  }
}
