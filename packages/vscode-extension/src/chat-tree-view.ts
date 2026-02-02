import * as vscode from 'vscode';

export interface ChatMessage {
  id: string;
  timestamp: Date;
  direction: 'incoming' | 'outgoing' | 'ai';
  channel?: string;
  userName?: string;
  content: string;
}

/**
 * 聊天訊息視圖（純原生 TreeView，超快）
 */
export class ChatTreeView implements vscode.TreeDataProvider<ChatMessageItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatMessageItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private messages: ChatMessage[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatMessageItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChatMessageItem): Thenable<ChatMessageItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    if (this.messages.length === 0) {
      return Promise.resolve([new ChatMessageItem({
        id: 'empty',
        timestamp: new Date(),
        direction: 'ai',
        content: '等待訊息...',
      }, true)]);
    }
    
    // 最新的訊息在最上面
    return Promise.resolve(
      [...this.messages].reverse().map(m => new ChatMessageItem(m))
    );
  }

  /**
   * 添加訊息
   */
  addMessage(message: Omit<ChatMessage, 'id'>): void {
    const msg: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    this.messages.push(msg);
    
    // 最多保留 100 條
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
    
    this.refresh();
  }

  /**
   * 添加收到的訊息
   */
  addIncomingMessage(channel: string, userName: string, content: string): void {
    this.addMessage({
      timestamp: new Date(),
      direction: 'incoming',
      channel,
      userName,
      content
    });
  }

  /**
   * 添加 AI 回覆
   */
  addAIResponse(content: string, channel?: string): void {
    this.addMessage({
      timestamp: new Date(),
      direction: 'ai',
      channel,
      content
    });
  }

  /**
   * 添加發出的訊息
   */
  addOutgoingMessage(channel: string, content: string): void {
    this.addMessage({
      timestamp: new Date(),
      direction: 'outgoing',
      channel,
      content
    });
  }

  /**
   * 清除所有訊息
   */
  clear(): void {
    this.messages = [];
    this.refresh();
  }

  /**
   * 獲取訊息數量
   */
  getMessageCount(): number {
    return this.messages.length;
  }
}

/**
 * 訊息項目
 */
class ChatMessageItem extends vscode.TreeItem {
  constructor(
    public readonly message: ChatMessage,
    private readonly isEmpty: boolean = false
  ) {
    super(ChatMessageItem.formatLabel(message), vscode.TreeItemCollapsibleState.None);
    
    if (isEmpty) {
      this.iconPath = new vscode.ThemeIcon('info');
      this.description = '';
      return;
    }
    
    // 設定圖標
    this.iconPath = ChatMessageItem.getIcon(message);
    
    // 設定描述（時間 + 頻道）
    const time = message.timestamp.toLocaleTimeString('zh-TW', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const channel = message.channel ? `[${message.channel.toUpperCase()}]` : '';
    this.description = `${channel} ${time}`;
    
    // 設定 tooltip 顯示完整內容
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${ChatMessageItem.getDirectionLabel(message)}**\n\n`);
    if (message.userName) {
      this.tooltip.appendMarkdown(`👤 ${message.userName}\n\n`);
    }
    if (message.channel) {
      this.tooltip.appendMarkdown(`📍 ${message.channel.toUpperCase()}\n\n`);
    }
    this.tooltip.appendMarkdown(`---\n\n${message.content}`);
    
    // 點擊可以複製訊息
    this.command = {
      command: 'vsmonster.copyMessage',
      title: '複製訊息',
      arguments: [message.content]
    };
  }

  private static formatLabel(message: ChatMessage): string {
    const maxLen = 50;
    const content = message.content.replace(/\n/g, ' ');
    
    let prefix = '';
    if (message.direction === 'incoming' && message.userName) {
      prefix = `${message.userName}: `;
    } else if (message.direction === 'ai') {
      prefix = '🤖 ';
    } else if (message.direction === 'outgoing') {
      prefix = '➡️ ';
    }
    
    const text = prefix + content;
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  }

  private static getIcon(message: ChatMessage): vscode.ThemeIcon {
    switch (message.direction) {
      case 'incoming':
        // 根據頻道顯示不同顏色
        switch (message.channel) {
          case 'line': return new vscode.ThemeIcon('comment', new vscode.ThemeColor('charts.green'));
          case 'telegram': return new vscode.ThemeIcon('comment', new vscode.ThemeColor('charts.blue'));
          case 'discord': return new vscode.ThemeIcon('comment', new vscode.ThemeColor('charts.purple'));
          default: return new vscode.ThemeIcon('mail-read');
        }
      case 'ai':
        return new vscode.ThemeIcon('hubot', new vscode.ThemeColor('charts.yellow'));
      case 'outgoing':
        return new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.orange'));
      default:
        return new vscode.ThemeIcon('comment');
    }
  }

  private static getDirectionLabel(message: ChatMessage): string {
    switch (message.direction) {
      case 'incoming': return '📨 收到訊息';
      case 'ai': return '🤖 AI 回覆';
      case 'outgoing': return '➡️ 發送訊息';
      default: return '訊息';
    }
  }
}
