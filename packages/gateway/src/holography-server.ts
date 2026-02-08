/**
 * Holography-based Gateway Server
 * 使用 @vsmonster/holography 模組的獨立入口點
 * 
 * 這是原始 server.ts 的替代版本，完全使用 Holography 模組
 */

import {
  HolographyServer,
  HolographyServerConfig,
  ChannelType,
  IncomingMessage
} from '@vsmonster/holography';
import { loadConfig } from './config/loader';
import { TaskManager } from './task/manager';
import { CommandProcessor } from './commands/processor';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { SoulManager } from './soul/manager';
import { logger } from './utils/logger';
import express, { Express, Router } from 'express';
import mediaRouter from './routes/media.routes';
import { initializeMediaUrl } from './services/media.service';

export class HolographyGateway {
  private holography: HolographyServer;
  private config: ReturnType<typeof loadConfig>;
  
  private taskManager: TaskManager;
  private commandProcessor: CommandProcessor;
  private tunnelService: TunnelService;
  private copilotBridge: CopilotBridge;
  private mcpController: MCPController;
  private soulManager: SoulManager;

  constructor() {
    this.config = loadConfig();
    
    // 建立 Holography 伺服器配置
    const holographyConfig: HolographyServerConfig = {
      port: this.config.port || 3000,
      wsPort: (this.config.port || 3000) + 1,
      channels: {
        line: this.config.channels.line ? {
          channelAccessToken: this.config.channels.line.channelAccessToken,
          channelSecret: this.config.channels.line.channelSecret,
          webhookSecret: this.config.channels.line.webhookSecret,
        } : undefined,
        telegram: this.config.channels.telegram ? {
          botToken: this.config.channels.telegram.botToken,
          webhookUrl: this.config.channels.telegram.webhookUrl,
        } : undefined,
        discord: this.config.channels.discord ? {
          botToken: this.config.channels.discord.botToken,
          applicationId: this.config.channels.discord.applicationId,
        } : undefined,
      },
      corsOrigins: ['*'],
    };
    
    this.holography = new HolographyServer(holographyConfig);
    
    // 初始化其他服務
    this.taskManager = new TaskManager();
    this.commandProcessor = new CommandProcessor(this.taskManager);
    this.tunnelService = new TunnelService(this.config.tunnel);
    this.copilotBridge = new CopilotBridge();
    this.mcpController = new MCPController(this.config.mcp);
    this.soulManager = new SoulManager();

    // 設定 CommandProcessor 回調
    this.commandProcessor.setCallbacks({
      sendToVSCode: (type, data) => {
        this.holography.broadcastRawToExtensions({ type, ...data });
      },
      replyToChannel: async (message, text) => {
        await this.holography.sendMessage(
          message.channel as ChannelType,
          message.chatId || message.userId,
          { text, chatId: message.chatId }
        );
      },
    });

    this.setupEventHandlers();
    this.setupAdditionalRoutes();
  }

  /**
   * 設定 Holography 事件處理器
   */
  private setupEventHandlers(): void {
    // 當收到已驗證的社群訊息時
    this.holography.on('messageForwarded', ({ message }) => {
      this.handleVerifiedMessage(message);
    });

    // 頻道初始化
    this.holography.on('channelInitialized', ({ channel }) => {
      logger.info(`✅ ${channel} channel initialized via Holography`);
    });

    this.holography.on('channelError', ({ channel, error }) => {
      logger.error(`❌ ${channel} channel error:`, error);
    });

    // WebSocket 連接
    this.holography.on('wsClientConnected', ({ clientId }) => {
      logger.info(`🔌 VS Code client connected: ${clientId}`);
    });

    this.holography.on('wsClientDisconnected', ({ clientId }) => {
      logger.info(`🔌 VS Code client disconnected: ${clientId}`);
    });

    // Extension 訊息
    this.holography.on('extensionMessage', ({ clientId, message }) => {
      this.handleExtensionMessage(clientId, message);
    });

    // Webhook 註冊
    this.holography.on('webhookRegistered', ({ channel, path }) => {
      logger.info(`📬 ${channel} webhook registered: ${path}`);
    });
  }

  /**
   * 設定額外的 API 路由
   */
  private setupAdditionalRoutes(): void {
    const app: Express = this.holography.getApp();

    // 任務 API
    app.get('/api/tasks', (req, res) => {
      res.json(this.taskManager.getAllTasks());
    });

    app.get('/api/tasks/:id', (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (task) {
        res.json(task);
      } else {
        res.status(404).json({ error: 'Task not found' });
      }
    });

    // MCP 控制 API
    app.get('/api/mcp/servers', (req, res) => {
      res.json(this.mcpController.listServers());
    });

    app.post('/api/mcp/:server/invoke', async (req, res) => {
      try {
        const result = await this.mcpController.invoke(
          req.params.server,
          req.body.action,
          req.body.params
        );
        res.json(result);
      } catch (error) {
        logger.error('MCP invoke error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Tunnel 狀態
    app.get('/api/tunnel', (req, res) => {
      res.json(this.tunnelService.getStatus());
    });

    // 多媒體路由
    const mediaUrl = this.config.mediaUrl || `http://localhost:${this.config.port || 3000}`;
    initializeMediaUrl(mediaUrl);
    app.use('/api/media', mediaRouter);

    // 覆寫 /api/users — 返回 { users: [...] } 格式（Send 頁面期望）
    app.get('/api/users', (req, res) => {
      const users = this.holography.getChannelManager().getVerifiedUsers();
      res.json({ users });
    });

    // 刪除已驗證用戶
    app.delete('/api/users/:channel/:userId', (req, res) => {
      const { channel, userId } = req.params;
      try {
        const cm = this.holography.getChannelManager();
        const ch = cm.getChannel(channel as ChannelType);
        if (ch) {
          ch.removeFromWhitelist(userId);
          res.json({ success: true });
        } else {
          res.status(404).json({ error: `Channel ${channel} not found` });
        }
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // 列出啟用的頻道
    app.get('/api/channels', (req, res) => {
      res.json({ channels: this.holography.getChannelManager().getEnabledChannels() });
    });

    // 覆寫 /api/send — 支援 string message 自動包裝
    app.post('/api/send', async (req, res) => {
      try {
        const { channel, userId, message } = req.body;
        const outgoing = typeof message === 'string' ? { text: message } : message;
        await this.holography.sendMessage(channel as ChannelType, userId, outgoing);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    // 發送訊息頁面
    app.get('/send', (req, res) => {
      res.send(this.renderSendMessagePage());
    });
  }

  /**
   * 處理已驗證的訊息
   */
  private async handleVerifiedMessage(message: IncomingMessage): Promise<void> {
    const { channel, userId, text, media } = message;

    logger.info(`📨 [${channel}] ${userId}: ${text?.substring(0, 100) || '(media)'}`);

    // 先交給 CommandProcessor 處理（/help, /status, /task 等指令）
    if (text?.startsWith('/')) {
      const result = await this.commandProcessor.processMessage(message);
      if (result) return; // 指令已處理，不再轉發
    }

    // 非指令訊息 → 轉發給 VS Code Extension（使用扁平 JSON）
    this.holography.broadcastRawToExtensions({
      type: 'ufo_message',
      channel,
      userId,
      text,
      media,
      messageId: message.messageId,
      timestamp: message.timestamp.toISOString(),
    });
  }

  /**
   * 處理來自 Extension 的訊息
   */
  private async handleExtensionMessage(clientId: string, message: any): Promise<void> {
    logger.debug(`Extension message from ${clientId}:`, message);

    switch (message.type) {
      case 'copilot_response': {
        // UFO 送 content，舊版送 text — 兩者都支援
        const text = message.text || message.content;
        if (message.channel && message.userId && text) {
          await this.holography.sendMessage(
            message.channel as ChannelType,
            message.chatId || message.userId,
            { text, chatId: message.chatId }
          );
        }
        break;
      }

      case 'task_update':
        this.taskManager.updateTask(message.taskId, message.status, message.progress);
        break;

      case 'task_status_change': {
        // 廣播任務狀態變更到社群用戶
        const task = this.taskManager.getTask(message.taskId);
        if (task) {
          this.taskManager.updateTask(message.taskId, message.status, message.progress);
          const statusText = this.taskManager.formatTaskStatus(task);
          await this.holography.sendMessage(
            task.channel as ChannelType,
            task.userId,
            { text: statusText }
          );
        }
        break;
      }

      case 'send_message': {
        // Extension 請求發送訊息到社群
        if (message.channel && message.userId && (message.text || message.content)) {
          await this.holography.sendMessage(
            message.channel as ChannelType,
            message.chatId || message.userId,
            { text: message.text || message.content, chatId: message.chatId }
          );
        }
        break;
      }

      case 'mcp_invoke': {
        // Extension 請求執行 MCP
        try {
          const result = await this.mcpController.invoke(
            message.server,
            message.action,
            message.params
          );
          // 回傳結果給 Extension
          this.holography.broadcastRawToExtensions({
            type: 'mcp_result',
            requestId: message.requestId,
            result,
          });
        } catch (error) {
          this.holography.broadcastRawToExtensions({
            type: 'mcp_result',
            requestId: message.requestId,
            error: String(error),
          });
        }
        break;
      }

      default:
        logger.debug(`Unknown extension message type: ${message.type}`);
    }
  }

  /**
   * 啟動服務
   */
  async start(): Promise<void> {
    const port = this.config.port || 3000;

    // 啟動 Holography 伺服器
    await this.holography.start();

    // 啟動 ngrok (如果配置了)
    if (this.config.tunnel?.enabled) {
      await this.tunnelService.start(port);
    }

    // 初始化 MCP 服務器
    await this.mcpController.initialize();

    logger.info(`🚀 Holography Gateway running on port ${port}`);
    logger.info(`📡 Active channels: ${this.holography.getChannelManager().getEnabledChannels().join(', ')}`);
    logger.info(`📬 Send message page: http://localhost:${port}/send`);

    if (this.tunnelService.getStatus().active) {
      const tunnelUrl = this.tunnelService.getStatus().url;
      logger.info(`🌐 Public URL: ${tunnelUrl}`);
      if (tunnelUrl) {
        this.commandProcessor.setTunnelUrl(tunnelUrl);
      }
    }

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await this.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await this.stop();
      process.exit(0);
    });
  }

  /**
   * 停止服務
   */
  async stop(): Promise<void> {
    logger.info('Shutting down gateway...');
    await this.tunnelService.stop?.();
    await this.mcpController.shutdown?.();
    await this.holography.stop();
    logger.info('Gateway stopped');
  }

  /**
   * 渲染發送訊息頁面
   */
  private renderSendMessagePage(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UFO - 發送訊息 (Holography)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 20px;
      color: #fff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 { text-align: center; margin-bottom: 10px; font-size: 28px; }
    h1 span { font-size: 40px; }
    .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #aaa; }
    select, input, textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 16px;
    }
    textarea { min-height: 120px; resize: vertical; }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    .result { margin-top: 20px; padding: 15px; border-radius: 8px; display: none; }
    .result.success { background: rgba(0,200,100,0.2); border: 1px solid #00c864; display: block; }
    .result.error { background: rgba(200,50,50,0.2); border: 1px solid #c83232; display: block; }
    .users-list { margin-top: 30px; }
    .users-list h3 { margin-bottom: 15px; font-size: 18px; }
    .user-item {
      padding: 10px 15px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-info { display: flex; align-items: center; gap: 10px; }
    .channel-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .channel-badge.line { background: #00c300; }
    .channel-badge.telegram { background: #0088cc; }
    .channel-badge.discord { background: #5865f2; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span>🛸</span> UFO</h1>
    <p class="subtitle">Powered by Holography</p>
    
    <form id="sendForm">
      <div class="form-group">
        <label>頻道</label>
        <select id="channel" required>
          <option value="">選擇頻道...</option>
          <option value="line">LINE</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>用戶 ID</label>
        <input type="text" id="userId" placeholder="輸入用戶 ID 或從下方選擇" required>
      </div>
      
      <div class="form-group">
        <label>訊息</label>
        <textarea id="message" placeholder="輸入要發送的訊息..." required></textarea>
      </div>
      
      <button type="submit">發送訊息</button>
    </form>
    
    <div id="result" class="result"></div>
    
    <div class="users-list">
      <h3>已驗證用戶</h3>
      <div id="usersList">載入中...</div>
    </div>
  </div>
  
  <script>
    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const list = document.getElementById('usersList');
        
        if (!data.users || data.users.length === 0) {
          list.innerHTML = '<p style="color:#888">尚無已驗證用戶</p>';
          return;
        }
        
        list.innerHTML = data.users.map(u => \`
          <div class="user-item" onclick="selectUser('\${u.channel}', '\${u.id}')">
            <div class="user-info">
              <span class="channel-badge \${u.channel}">\${u.channel.toUpperCase()}</span>
              <span>\${u.displayName || u.id}</span>
            </div>
            <span style="color:#888">\${u.id.substring(0,10)}...</span>
          </div>
        \`).join('');
      } catch (e) {
        document.getElementById('usersList').innerHTML = '<p style="color:#f66">載入失敗</p>';
      }
    }
    
    function selectUser(channel, userId) {
      document.getElementById('channel').value = channel;
      document.getElementById('userId').value = userId;
    }
    
    document.getElementById('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = document.getElementById('result');
      
      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: document.getElementById('channel').value,
            userId: document.getElementById('userId').value,
            message: document.getElementById('message').value
          })
        });
        
        const data = await res.json();
        result.className = 'result ' + (data.success ? 'success' : 'error');
        result.textContent = data.success ? '✅ 訊息已發送' : '❌ ' + (data.error || '發送失敗');
      } catch (e) {
        result.className = 'result error';
        result.textContent = '❌ 網路錯誤';
      }
    });
    
    loadUsers();
    setInterval(loadUsers, 30000);
  </script>
</body>
</html>`;
  }
}

// 如果直接執行此檔案
if (require.main === module) {
  const gateway = new HolographyGateway();
  gateway.start().catch(err => {
    logger.error('Failed to start Holography Gateway:', err);
    process.exit(1);
  });
}

export default HolographyGateway;
