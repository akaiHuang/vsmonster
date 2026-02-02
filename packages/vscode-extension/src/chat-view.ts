import * as vscode from 'vscode';

export interface ChatMessage {
  timestamp: Date;
  direction: 'incoming' | 'outgoing' | 'ai';
  channel?: string;
  userName?: string;
  content: string;
}

/**
 * VSMONSTER 聊天視圖（使用原生 WebviewView，預載入更快）
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vsmonsterChat';
  
  private _view?: vscode.WebviewView;
  private _messages: ChatMessage[] = [];
  private _onSendToChannel: (channel: string, message: string) => void;
  private _onSendToCopilot: (message: string) => void;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    onSendToChannel: (channel: string, message: string) => void,
    onSendToCopilot: (message: string) => void
  ) {
    this._onSendToChannel = onSendToChannel;
    this._onSendToCopilot = onSendToCopilot;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent();

    // 處理來自 webview 的訊息
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'sendToChannel':
          this._onSendToChannel(message.channel, message.text);
          this.addMessage({
            timestamp: new Date(),
            direction: 'outgoing',
            channel: message.channel,
            content: message.text
          });
          break;
        case 'sendToCopilot':
          this._onSendToCopilot(message.text);
          this.addMessage({
            timestamp: new Date(),
            direction: 'outgoing',
            channel: 'copilot',
            content: message.text
          });
          break;
        case 'clear':
          this._messages = [];
          this._updateMessages();
          break;
      }
    });

    // 如果有舊訊息，恢復顯示
    if (this._messages.length > 0) {
      this._updateMessages();
    }
  }

  /**
   * 添加訊息
   */
  public addMessage(message: ChatMessage) {
    this._messages.push(message);
    if (this._messages.length > 200) {
      this._messages = this._messages.slice(-200);
    }
    this._updateMessages();
  }

  /**
   * 添加收到的訊息
   */
  public addIncomingMessage(channel: string, userName: string, content: string) {
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
  public addAIResponse(content: string, channel?: string) {
    this.addMessage({
      timestamp: new Date(),
      direction: 'ai',
      channel,
      content
    });
  }

  private _updateMessages() {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateMessages',
        messages: this._messages.map(m => ({
          ...m,
          timestamp: m.timestamp.toISOString()
        }))
      });
    }
  }

  private _getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .msg {
      padding: 6px 10px;
      border-radius: 8px;
      max-width: 90%;
      word-break: break-word;
    }
    .msg.incoming {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .msg.outgoing {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .msg.ai {
      align-self: flex-start;
      background: var(--vscode-editor-selectionBackground);
      border-left: 3px solid var(--vscode-focusBorder);
    }
    .msg-header {
      font-size: 10px;
      opacity: 0.7;
      margin-bottom: 2px;
    }
    .badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 8px;
      font-size: 9px;
      font-weight: 600;
    }
    .badge.line { background: #06C755; color: #fff; }
    .badge.telegram { background: #0088cc; color: #fff; }
    .badge.discord { background: #5865F2; color: #fff; }
    .badge.copilot { background: #8B5CF6; color: #fff; }
    .badge.web { background: #666; color: #fff; }
    .input-area {
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    .target-row {
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .target-btn {
      padding: 3px 8px;
      border: 1px solid var(--vscode-input-border);
      background: transparent;
      color: var(--vscode-foreground);
      border-radius: 12px;
      cursor: pointer;
      font-size: 10px;
    }
    .target-btn:hover { background: var(--vscode-list-hoverBackground); }
    .target-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    .input-row {
      display: flex;
      gap: 4px;
    }
    .msg-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 14px;
      font-size: 12px;
      outline: none;
      resize: none;
      min-height: 28px;
      max-height: 80px;
    }
    .msg-input:focus { border-color: var(--vscode-focusBorder); }
    .send-btn {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 14px;
      cursor: pointer;
      font-size: 11px;
    }
    .send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.5;
      text-align: center;
      padding: 20px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="messages" id="msgs">
    <div class="empty" id="empty">等待訊息...</div>
  </div>
  <div class="input-area">
    <div class="target-row">
      <button class="target-btn active" data-t="copilot">🤖 Copilot</button>
      <button class="target-btn" data-t="line">💬 LINE</button>
      <button class="target-btn" data-t="telegram">✈️ TG</button>
      <button class="target-btn" data-t="discord">🎮 DC</button>
    </div>
    <div class="input-row">
      <textarea class="msg-input" id="input" placeholder="輸入訊息..." rows="1"></textarea>
      <button class="send-btn" onclick="send()">送出</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let messages = [];
    let target = 'copilot';
    
    document.querySelectorAll('.target-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        target = btn.dataset.t;
      };
    });
    
    document.getElementById('input').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    };
    
    function send() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text) return;
      
      vscode.postMessage({
        command: target === 'copilot' ? 'sendToCopilot' : 'sendToChannel',
        channel: target,
        text
      });
      input.value = '';
    }
    
    function render() {
      const container = document.getElementById('msgs');
      const empty = document.getElementById('empty');
      
      if (messages.length === 0) {
        empty.style.display = 'flex';
        return;
      }
      empty.style.display = 'none';
      
      container.innerHTML = messages.map(m => {
        const time = new Date(m.timestamp).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit'});
        const badge = m.channel ? '<span class="badge ' + m.channel + '">' + 
          (m.direction === 'ai' ? '🤖' : m.direction === 'incoming' ? '📨' : '➡️') + 
          ' ' + m.channel.toUpperCase() + '</span> ' : '';
        const user = m.userName ? m.userName + ' ' : '';
        return '<div class="msg ' + m.direction + '">' +
          '<div class="msg-header">' + badge + user + time + '</div>' +
          '<div>' + escapeHtml(m.content) + '</div></div>';
      }).join('');
      
      container.scrollTop = container.scrollHeight;
    }
    
    function escapeHtml(t) {
      const d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML;
    }
    
    window.addEventListener('message', e => {
      if (e.data.command === 'updateMessages') {
        messages = e.data.messages;
        render();
      }
    });
  </script>
</body>
</html>`;
  }
}
