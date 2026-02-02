import * as vscode from 'vscode';

export interface ChatMessage {
  id: string;
  timestamp: Date;
  direction: 'incoming' | 'outgoing' | 'ai';
  channel?: string;
  userId?: string;
  userName?: string;
  content: string;
  status?: 'sending' | 'sent' | 'failed';
}

/**
 * VSMONSTER 聊天面板
 * 顯示通訊軟體訊息和 AI 回覆，支援雙向發送
 */
export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _messages: ChatMessage[] = [];
  private _onSendToChannel: (channel: string, message: string) => void;
  private _onSendToCopilot: (message: string) => void;

  public static createOrShow(
    extensionUri: vscode.Uri,
    onSendToChannel: (channel: string, message: string) => void,
    onSendToCopilot: (message: string) => void
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已經有面板，顯示它
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel._panel.reveal(column);
      return ChatPanel.currentPanel;
    }

    // 創建新面板
    const panel = vscode.window.createWebviewPanel(
      'vsmonsterChat',
      'VSMONSTER 訊息中心',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, onSendToChannel, onSendToCopilot);
    return ChatPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    onSendToChannel: (channel: string, message: string) => void,
    onSendToCopilot: (message: string) => void
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._onSendToChannel = onSendToChannel;
    this._onSendToCopilot = onSendToCopilot;

    // 設定 HTML 內容
    this._update();

    // 監聽面板關閉
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // 監聽來自 Webview 的訊息
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'sendToChannel':
            this._onSendToChannel(message.channel, message.text);
            this.addMessage({
              id: this._generateId(),
              timestamp: new Date(),
              direction: 'outgoing',
              channel: message.channel,
              content: message.text,
              status: 'sending'
            });
            break;
          case 'sendToCopilot':
            this._onSendToCopilot(message.text);
            this.addMessage({
              id: this._generateId(),
              timestamp: new Date(),
              direction: 'outgoing',
              channel: 'copilot',
              content: message.text,
              status: 'sending'
            });
            break;
          case 'clearMessages':
            this._messages = [];
            this._updateMessages();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * 添加訊息
   */
  public addMessage(message: ChatMessage) {
    this._messages.push(message);
    // 最多保留 500 條訊息
    if (this._messages.length > 500) {
      this._messages = this._messages.slice(-500);
    }
    this._updateMessages();
  }

  /**
   * 更新訊息狀態
   */
  public updateMessageStatus(id: string, status: 'sent' | 'failed') {
    const msg = this._messages.find(m => m.id === id);
    if (msg) {
      msg.status = status;
      this._updateMessages();
    }
  }

  /**
   * 添加收到的訊息（來自通訊軟體）
   */
  public addIncomingMessage(channel: string, userId: string, userName: string, content: string) {
    this.addMessage({
      id: this._generateId(),
      timestamp: new Date(),
      direction: 'incoming',
      channel,
      userId,
      userName,
      content
    });
  }

  /**
   * 添加 AI 回覆
   */
  public addAIResponse(content: string, channel?: string) {
    this.addMessage({
      id: this._generateId(),
      timestamp: new Date(),
      direction: 'ai',
      channel,
      content
    });
  }

  private _generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _updateMessages() {
    this._panel.webview.postMessage({
      command: 'updateMessages',
      messages: this._messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString()
      }))
    });
  }

  private _update() {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const nonce = this._getNonce();
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>VSMONSTER 訊息中心</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      padding: 12px 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header h1 {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .header-actions {
      display: flex;
      gap: 8px;
    }
    
    .header-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .header-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      position: relative;
    }
    
    .message.incoming {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-bottom-left-radius: 4px;
    }
    
    .message.outgoing {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 4px;
    }
    
    .message.ai {
      align-self: flex-start;
      background: linear-gradient(135deg, var(--vscode-editor-selectionBackground), var(--vscode-editor-selectionHighlightBackground));
      border: 1px solid var(--vscode-focusBorder);
      border-bottom-left-radius: 4px;
    }
    
    .message-header {
      font-size: 11px;
      opacity: 0.8;
      margin-bottom: 4px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    
    .channel-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 500;
    }
    
    .channel-badge.line { background: #06C755; color: white; }
    .channel-badge.telegram { background: #0088cc; color: white; }
    .channel-badge.discord { background: #5865F2; color: white; }
    .channel-badge.web { background: #666; color: white; }
    .channel-badge.copilot { background: #8B5CF6; color: white; }
    
    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    
    .message-status {
      font-size: 10px;
      opacity: 0.6;
      text-align: right;
      margin-top: 4px;
    }
    
    .message-time {
      font-size: 10px;
      opacity: 0.6;
      margin-top: 4px;
    }
    
    .input-area {
      padding: 12px 16px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-panel-border);
    }
    
    .target-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .target-btn {
      padding: 6px 12px;
      border: 1px solid var(--vscode-input-border);
      background: transparent;
      color: var(--vscode-foreground);
      border-radius: 16px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    
    .target-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .target-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    
    .input-row {
      display: flex;
      gap: 8px;
    }
    
    .message-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 20px;
      font-size: 13px;
      outline: none;
      resize: none;
      min-height: 40px;
      max-height: 120px;
    }
    
    .message-input:focus {
      border-color: var(--vscode-focusBorder);
    }
    
    .send-btn {
      padding: 10px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
    }
    
    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      text-align: center;
      padding: 40px;
    }
    
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.4;
    }
    
    .empty-state p {
      font-size: 13px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
      </svg>
      訊息中心
    </h1>
    <div class="header-actions">
      <button class="header-btn" onclick="clearMessages()">清除訊息</button>
    </div>
  </div>
  
  <div class="messages-container" id="messagesContainer">
    <div class="empty-state" id="emptyState">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      </svg>
      <p>尚無訊息<br>來自通訊軟體的訊息和 AI 回覆會顯示在這裡</p>
    </div>
  </div>
  
  <div class="input-area">
    <div class="target-selector">
      <button class="target-btn active" data-target="copilot" onclick="selectTarget('copilot')">
        🤖 發送到 Copilot
      </button>
      <button class="target-btn" data-target="line" onclick="selectTarget('line')">
        💬 LINE
      </button>
      <button class="target-btn" data-target="telegram" onclick="selectTarget('telegram')">
        ✈️ Telegram
      </button>
      <button class="target-btn" data-target="discord" onclick="selectTarget('discord')">
        🎮 Discord
      </button>
    </div>
    <div class="input-row">
      <textarea 
        class="message-input" 
        id="messageInput" 
        placeholder="輸入訊息..."
        onkeydown="handleKeyDown(event)"
      ></textarea>
      <button class="send-btn" onclick="sendMessage()">發送</button>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let messages = [];
    let currentTarget = 'copilot';
    
    function selectTarget(target) {
      currentTarget = target;
      document.querySelectorAll('.target-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === target);
      });
      
      const input = document.getElementById('messageInput');
      if (target === 'copilot') {
        input.placeholder = '向 Copilot 發送訊息...';
      } else {
        input.placeholder = '發送訊息到 ' + target.toUpperCase() + '...';
      }
    }
    
    function handleKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    }
    
    function sendMessage() {
      const input = document.getElementById('messageInput');
      const text = input.value.trim();
      
      if (!text) return;
      
      if (currentTarget === 'copilot') {
        vscode.postMessage({
          command: 'sendToCopilot',
          text: text
        });
      } else {
        vscode.postMessage({
          command: 'sendToChannel',
          channel: currentTarget,
          text: text
        });
      }
      
      input.value = '';
      input.style.height = 'auto';
    }
    
    function clearMessages() {
      vscode.postMessage({ command: 'clearMessages' });
    }
    
    function formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    function getChannelIcon(channel) {
      const icons = {
        line: '💬',
        telegram: '✈️',
        discord: '🎮',
        web: '🌐',
        copilot: '🤖'
      };
      return icons[channel] || '📨';
    }
    
    function renderMessages() {
      const container = document.getElementById('messagesContainer');
      const emptyState = document.getElementById('emptyState');
      
      if (messages.length === 0) {
        emptyState.style.display = 'flex';
        // 移除其他訊息元素
        Array.from(container.children).forEach(child => {
          if (child !== emptyState) {
            child.remove();
          }
        });
        return;
      }
      
      emptyState.style.display = 'none';
      
      // 清除舊訊息
      container.innerHTML = '';
      
      messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message ' + msg.direction;
        
        let header = '';
        if (msg.direction === 'incoming') {
          header = '<div class="message-header">' +
            '<span class="channel-badge ' + (msg.channel || '') + '">' + 
              getChannelIcon(msg.channel) + ' ' + (msg.channel || '').toUpperCase() +
            '</span>' +
            '<span>' + (msg.userName || msg.userId || '未知用戶') + '</span>' +
          '</div>';
        } else if (msg.direction === 'ai') {
          header = '<div class="message-header">' +
            '<span class="channel-badge copilot">🤖 Copilot</span>' +
            (msg.channel ? '<span>→ ' + msg.channel.toUpperCase() + '</span>' : '') +
          '</div>';
        } else if (msg.direction === 'outgoing') {
          header = '<div class="message-header">' +
            '<span class="channel-badge ' + (msg.channel || '') + '">' + 
              '→ ' + (msg.channel || '').toUpperCase() +
            '</span>' +
          '</div>';
        }
        
        let status = '';
        if (msg.status) {
          const statusText = {
            sending: '發送中...',
            sent: '已發送',
            failed: '發送失敗'
          };
          status = '<div class="message-status">' + statusText[msg.status] + '</div>';
        }
        
        div.innerHTML = header +
          '<div class="message-content">' + escapeHtml(msg.content) + '</div>' +
          '<div class="message-time">' + formatTime(msg.timestamp) + '</div>' +
          status;
        
        container.appendChild(div);
      });
      
      // 滾動到底部
      container.scrollTop = container.scrollHeight;
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    // 監聽來自擴展的訊息
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'updateMessages':
          messages = message.messages;
          renderMessages();
          break;
      }
    });
    
    // 自動調整輸入框高度
    const textarea = document.getElementById('messageInput');
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  </script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose() {
    ChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
