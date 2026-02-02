import * as vscode from 'vscode';

export interface ChannelInfo {
  name: string;
  type: 'line' | 'telegram' | 'discord' | 'web';
  connected: boolean;
  webhookUrl?: string;
  userCount?: number;
}

/**
 * 頻道狀態視圖
 * 顯示已連接的社群頻道狀態
 */
export class ChannelsView implements vscode.TreeDataProvider<ChannelItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChannelItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private channels: ChannelInfo[] = [];

  /**
   * 刷新視圖
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 設定頻道列表
   */
  setChannels(channels: ChannelInfo[]): void {
    this.channels = channels;
    this.refresh();
  }

  /**
   * 更新單一頻道狀態
   */
  updateChannel(name: string, updates: Partial<ChannelInfo>): void {
    const index = this.channels.findIndex(c => c.name === name);
    if (index !== -1) {
      this.channels[index] = { ...this.channels[index], ...updates };
      this.refresh();
    }
  }

  /**
   * 添加頻道
   */
  addChannel(channel: ChannelInfo): void {
    const existing = this.channels.findIndex(c => c.name === channel.name);
    if (existing !== -1) {
      this.channels[existing] = channel;
    } else {
      this.channels.push(channel);
    }
    this.refresh();
  }

  getTreeItem(element: ChannelItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChannelItem): Thenable<ChannelItem[]> {
    if (!element) {
      if (this.channels.length === 0) {
        // 沒有頻道時顯示提示
        return Promise.resolve([
          new ChannelItem({
            name: '尚未連接任何頻道',
            type: 'line',
            connected: false,
          }, true)
        ]);
      }
      return Promise.resolve(
        this.channels.map(channel => new ChannelItem(channel))
      );
    }
    return Promise.resolve([]);
  }
}

/**
 * 頻道項目
 */
class ChannelItem extends vscode.TreeItem {
  constructor(
    public readonly channel: ChannelInfo,
    private readonly isPlaceholder: boolean = false
  ) {
    super(
      isPlaceholder ? channel.name : `${channel.type.toUpperCase()}: ${channel.name}`,
      vscode.TreeItemCollapsibleState.None
    );

    if (isPlaceholder) {
      this.iconPath = new vscode.ThemeIcon('info');
      this.description = '點擊設定頻道';
      this.command = {
        command: 'vsmonster.runSetupWizard',
        title: '設定頻道',
      };
    } else {
      // 根據頻道類型設定圖示
      const iconMap: Record<string, string> = {
        line: 'comment',
        telegram: 'comment-discussion',
        discord: 'organization',
        web: 'globe',
      };

      this.iconPath = new vscode.ThemeIcon(
        iconMap[channel.type] || 'comment',
        channel.connected 
          ? new vscode.ThemeColor('charts.green')
          : new vscode.ThemeColor('charts.red')
      );

      this.description = channel.connected ? '已連接' : '未連接';
      
      if (channel.webhookUrl) {
        this.tooltip = `Webhook: ${channel.webhookUrl}`;
      }

      if (channel.userCount !== undefined) {
        this.description += ` (${channel.userCount} 用戶)`;
      }
    }
  }
}
