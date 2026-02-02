import express from 'express';
import { CopilotBridge } from './copilot/bridge';
import { logger } from './utils/logger';

/**
 * Web Interface - 提供瀏覽器直接與 VSMonster Copilot 通訊的 Web UI
 */
export class WebInterface {
  private app: express.Application;
  private copilotBridge: CopilotBridge;
  private port: number;

  constructor(app: express.Application, copilotBridge: CopilotBridge, port: number = 3001) {
    this.app = app;
    this.copilotBridge = copilotBridge;
    this.port = port;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // 靜態文件服務 - Web UI
    this.app.get('/web', (req, res) => {
      res.send(this.getWebUIHTML());
    });

    // WebSocket 或 SSE 連接用於即時通訊
    this.app.post('/api/web/chat', async (req, res) => {
      try {
        const { message, conversationId } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        // 使用 Copilot Bridge 處理訊息
        const response = await this.copilotBridge.chat(message, conversationId);

        res.json({
          success: true,
          response,
          conversationId: conversationId || 'default',
        });
      } catch (error) {
        logger.error('Web chat error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 獲取會話歷史
    this.app.get('/api/web/conversations/:id', (req, res) => {
      try {
        const history = this.copilotBridge.getConversationHistory(req.params.id);
        res.json({ success: true, history });
      } catch (error) {
        logger.error('Failed to get conversation history:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 清除會話
    this.app.delete('/api/web/conversations/:id', (req, res) => {
      try {
        this.copilotBridge.clearConversation(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to clear conversation:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    logger.info(`Web Interface available at http://localhost:${this.port}/web`);
  }

  /**
   * 生成 Web UI HTML
   */
  private getWebUIHTML(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSMONSTER Web Interface</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 800px;
      width: 100%;
      height: 600px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
    }

    .header h1 {
      font-size: 24px;
      margin-bottom: 5px;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: #f5f5f5;
    }

    .message {
      margin-bottom: 15px;
      display: flex;
      animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      justify-content: flex-end;
    }

    .message-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
    }

    .message.user .message-bubble {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-bubble {
      background: white;
      color: #333;
      border-bottom-left-radius: 4px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }

    .input-container {
      display: flex;
      padding: 20px;
      background: white;
      border-top: 1px solid #e0e0e0;
    }

    .input-container input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.3s;
    }

    .input-container input:focus {
      border-color: #667eea;
    }

    .input-container button {
      margin-left: 10px;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: transform 0.2s;
    }

    .input-container button:hover {
      transform: scale(1.05);
    }

    .input-container button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: scale(1);
    }

    .typing-indicator {
      display: none;
      padding: 12px 16px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      width: fit-content;
    }

    .typing-indicator.active {
      display: block;
    }

    .typing-indicator span {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #999;
      margin: 0 2px;
      animation: typing 1.4s infinite;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-10px); }
    }

    .error {
      background: #f44336;
      color: white;
      padding: 10px;
      border-radius: 8px;
      margin: 10px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🦞 VSMONSTER</h1>
      <p>直接與 VS Code Copilot 對話</p>
    </div>
    
    <div class="chat-container" id="chatContainer">
      <div class="message assistant">
        <div class="message-bubble">
          👋 你好！我是 VSMONSTER Copilot。我可以幫你解決程式問題、生成程式碼、解釋概念等。有什麼我可以幫忙的嗎？
        </div>
      </div>
    </div>

    <div class="input-container">
      <input 
        type="text" 
        id="messageInput" 
        placeholder="輸入訊息..."
        onkeypress="handleKeyPress(event)"
      />
      <button onclick="sendMessage()" id="sendButton">發送</button>
    </div>
  </div>

  <script>
    const chatContainer = document.getElementById('chatContainer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    let conversationId = 'web-' + Date.now();

    function addMessage(text, isUser) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + (isUser ? 'user' : 'assistant');
      
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = text;
      
      messageDiv.appendChild(bubble);
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showTypingIndicator() {
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator active';
      indicator.id = 'typingIndicator';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      chatContainer.appendChild(indicator);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function hideTypingIndicator() {
      const indicator = document.getElementById('typingIndicator');
      if (indicator) {
        indicator.remove();
      }
    }

    function showError(message) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = '❌ ' + message;
      chatContainer.appendChild(errorDiv);
      setTimeout(() => errorDiv.remove(), 5000);
    }

    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      // 禁用輸入
      messageInput.disabled = true;
      sendButton.disabled = true;

      // 顯示用戶訊息
      addMessage(message, true);
      messageInput.value = '';

      // 顯示輸入中指示器
      showTypingIndicator();

      try {
        const response = await fetch('/api/web/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            conversationId,
          }),
        });

        const data = await response.json();
        
        hideTypingIndicator();

        if (data.success) {
          addMessage(data.response, false);
        } else {
          showError(data.error || '發生錯誤');
        }
      } catch (error) {
        hideTypingIndicator();
        showError('無法連接到伺服器: ' + error.message);
      } finally {
        // 重新啟用輸入
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
      }
    }

    function handleKeyPress(event) {
      if (event.key === 'Enter') {
        sendMessage();
      }
    }

    // 自動聚焦輸入框
    messageInput.focus();
  </script>
</body>
</html>`;
  }
}
