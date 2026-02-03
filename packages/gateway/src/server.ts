import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { loadConfig, VSMONSTERConfig } from './config/loader';
import { ChannelManager } from './channels/manager';
import { TaskManager } from './task/manager';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { WebInterface } from './web-interface';
import { SoulManager } from './soul/manager';
import { logger } from './utils/logger';
import mediaRouter from './routes/media.routes';
import { initializeMediaUrl } from './services/media.service';
import { uploadFromLINE } from './services/media-integration';
import crypto from 'crypto';

export class VSMONSTERGateway {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: VSMONSTERConfig;
  
  private channelManager: ChannelManager;
  private taskManager: TaskManager;
  private tunnelService: TunnelService;
  private copilotBridge: CopilotBridge;
  private mcpController: MCPController;
  private webInterface: WebInterface;
  private soulManager: SoulManager;
  
  private vsCodeConnections: Set<WebSocket> = new Set();
  private lineHandshakeCodes: Map<string, string> = new Map();
  private readonly lineHandshakeEmojis = ['🛸', '👾'];
  private adminResetToken: string;
  private ufoApprovals: Map<string, { token: string; userId: string; channel: string; taskPath: string }> = new Map();

  constructor() {
    this.config = loadConfig();
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // 初始化各個服務
    this.channelManager = new ChannelManager(this.config.channels);
    this.taskManager = new TaskManager();
    this.tunnelService = new TunnelService(this.config.tunnel);
    this.copilotBridge = new CopilotBridge();
    this.mcpController = new MCPController(this.config.mcp);
    this.webInterface = new WebInterface(this.app, this.copilotBridge, this.config.port);
    this.soulManager = new SoulManager();
    this.adminResetToken = crypto.randomBytes(8).toString('hex');
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();

    logger.info(`UFO Admin reset token: ${this.adminResetToken}`);
  }

  private setupMiddleware(): void {
    this.app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf.toString();
        }
      })
    );
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for VS Code extension
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // 健康檢查
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        channels: this.channelManager.getActiveChannels(),
        tasks: this.taskManager.getRunningTaskCount()
      });
    });

    // LINE Webhook - 使用動態安全路徑
    this.app.get('/webhook/line/:secret', (req, res) => {
      // Some platforms perform a GET verification. Respond 200 if the path matches.
      const lineChannel = this.channelManager.getChannel('line') as any;
      if (lineChannel && lineChannel.webhookPath) {
        const expectedPath = lineChannel.webhookPath.replace('/webhook/line/', '');
        if (req.params.secret !== expectedPath) {
          logger.warn('LINE webhook invalid secret in URL (GET)');
          return res.sendStatus(403);
        }
      }
      return res.sendStatus(200);
    });

    this.app.post('/webhook/line/:secret', async (req, res) => {
      try {
        // 驗證 webhook token header
        const authToken = req.headers['x-line-signature'];
        if (!authToken) {
          logger.warn('LINE webhook request without signature header');
          return res.sendStatus(403);
        }

        const rawBody = (req as any).rawBody as string | undefined;
        const lineChannel = this.channelManager.getChannel('line') as any;
        if (!rawBody || !lineChannel?.config?.channelSecret) {
          logger.warn('LINE webhook missing raw body or channel secret');
          return res.sendStatus(403);
        }

        const expectedSignature = crypto
          .createHmac('sha256', lineChannel.config.channelSecret)
          .update(rawBody)
          .digest('base64');

        if (authToken !== expectedSignature) {
          logger.warn('LINE webhook signature mismatch');
          return res.sendStatus(403);
        }

        // 驗證 URL 路徑中的 secret
        if (lineChannel && lineChannel.webhookPath) {
          const expectedPath = lineChannel.webhookPath.replace('/webhook/line/', '');
          if (req.params.secret !== expectedPath) {
            logger.warn('LINE webhook invalid secret in URL');
            return res.sendStatus(403);
          }
        }
        
        const events = req.body.events || [];
        for (const event of events) {
          await this.handleChannelMessage('line', event);
        }
        res.sendStatus(200);
      } catch (error) {
        logger.error('LINE webhook error:', error);
        res.sendStatus(500);
      }
    });

    // Telegram Webhook
    this.app.post('/webhook/telegram', async (req, res) => {
      try {
        await this.handleChannelMessage('telegram', req.body);
        res.sendStatus(200);
      } catch (error) {
        logger.error('Telegram webhook error:', error);
        res.sendStatus(500);
      }
    });

    // Discord interactions
    this.app.post('/webhook/discord', async (req, res) => {
      try {
        await this.handleChannelMessage('discord', req.body);
        res.json({ type: 1 }); // ACK
      } catch (error) {
        logger.error('Discord webhook error:', error);
        res.sendStatus(500);
      }
    });

    // 任務 API
    this.app.get('/api/tasks', (req, res) => {
      res.json(this.taskManager.getAllTasks());
    });

    this.app.get('/api/tasks/:id', (req, res) => {
      const task = this.taskManager.getTask(req.params.id);
      if (task) {
        res.json(task);
      } else {
        res.status(404).json({ error: 'Task not found' });
      }
    });

    // MCP 控制 API
    this.app.get('/api/mcp/servers', (req, res) => {
      res.json(this.mcpController.listServers());
    });

    this.app.post('/api/mcp/:server/invoke', async (req, res) => {
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
    this.app.get('/api/tunnel', (req, res) => {
      res.json(this.tunnelService.getStatus());
    });

    // UFO approval pages
    this.app.get('/ufo/approve/:taskId', (req, res) => {
      const taskId = req.params.taskId;
      const approval = this.ufoApprovals.get(taskId);
      if (!approval) {
        return res.sendStatus(404);
      }

      const token = String(req.query.token || '');
      if (token !== approval.token) {
        return res.sendStatus(403);
      }

      const files = this.readTaskFiles(approval.taskPath, taskId);
      return res.send(this.renderApprovalPage(taskId, token, files));
    });

    this.app.post('/api/ufo/approve/:taskId', (req, res) => {
      const taskId = req.params.taskId;
      const approval = this.ufoApprovals.get(taskId);
      if (!approval) {
        return res.sendStatus(404);
      }

      const token = String(req.query.token || '');
      if (token !== approval.token) {
        return res.sendStatus(403);
      }

      this.ufoApprovals.delete(taskId);
      this.broadcastToVSCode({
        type: 'ufo_approved',
        taskId,
        userId: approval.userId,
        channel: approval.channel,
        taskPath: approval.taskPath
      });
      return res.json({ success: true });
    });

    // 多媒體路由
    // 初始化媒體 URL（使用 mediaUrl 配置或預設）
    const mediaUrl = this.config.mediaUrl || 'https://media.ufo.fawstudio.com';
    initializeMediaUrl(mediaUrl);
    this.app.use('/api/media', mediaRouter);
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientType = req.url?.includes('vscode') ? 'vscode' : 'unknown';
      
      if (clientType === 'vscode') {
        this.vsCodeConnections.add(ws);
        logger.info('VS Code extension connected');
        
        // 發送當前狀態
        ws.send(JSON.stringify({
          type: 'init',
          data: {
            channels: this.channelManager.getActiveChannels(),
            tasks: this.taskManager.getAllTasks(),
            tunnel: this.tunnelService.getStatus()
          }
        }));
      }

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          logger.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        this.vsCodeConnections.delete(ws);
        logger.info('VS Code extension disconnected');
      });
    });
  }

  private async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'copilot_response':
        // 收到 Copilot 回應，轉發到社群頻道
        await this.sendToChannel(message.channel, message.userId, message.content);
        break;
        
      case 'task_update':
        // 任務狀態更新
        this.taskManager.updateTask(message.taskId, message.status, message.progress);
        this.broadcastToChannels('task_progress', message);
        break;
        
      case 'tunnel_url':
        // ngrok URL 更新
        this.broadcastToChannels('preview_url', { url: message.url });
        break;
        
      case 'mcp_invoke':
        // MCP 調用請求
        const result = await this.mcpController.invoke(
          message.server,
          message.action,
          message.params
        );
        ws.send(JSON.stringify({ type: 'mcp_result', requestId: message.requestId, result }));
        break;

      case 'ufo_request_approval': {
        const { taskId, taskPath, channel, userId } = message;
        if (!taskId || !taskPath || !channel || !userId) {
          break;
        }
        const token = crypto.randomBytes(8).toString('hex');
        this.ufoApprovals.set(taskId, { token, userId, channel, taskPath });
        const base = this.getPublicUrl();
        const approvalUrl = `${base}/ufo/approve/${encodeURIComponent(taskId)}?token=${token}`;
        await this.sendToChannel(channel, userId, `📝 請確認需求與規格：\n${approvalUrl}`);
        ws.send(JSON.stringify({ type: 'ufo_approval_link', taskId, url: approvalUrl }));
        break;
      }
    }
  }

  private async handleChannelMessage(channel: string, event: any): Promise<void> {
    const parsed = this.channelManager.parseMessage(channel, event);
    if (!parsed) return;

    const { userId, text, media, messageId } = parsed;

    // 自動上傳媒體檔案
    if (media && media.length > 0) {
      for (const mediaItem of media) {
        if (channel === 'line' && mediaItem.type === 'image') {
          try {
            const fileName = `line_photo_${Date.now()}.jpg`;
            const record = await uploadFromLINE(
              this.channelManager.getChannel('line'),
              mediaItem.id,
              fileName,
              'line'
            );
            
            if (record) {
              logger.info(`✅ LINE 照片已上傳: ${record.id}`);
              await this.sendToChannel(
                channel,
                userId,
                `📸 照片已保存\n連結: ${record.publicUrl}`
              );
            }
          } catch (error) {
            logger.error(`❌ LINE 照片上傳失敗`, error);
          }
        }
      }
    }

    if (!text) {
      return;
    }

    if (channel === 'line') {
      const lineChannel = this.channelManager.getChannel('line') as any;
      if (lineChannel && !lineChannel.isWhitelisted(userId)) {
        const normalized = text.trim().toLowerCase();
        const currentCode = this.lineHandshakeCodes.get(userId);
        const generateCode = () => {
          const code = Array.from({ length: 4 }, () => {
            return this.lineHandshakeEmojis[Math.floor(Math.random() * this.lineHandshakeEmojis.length)];
          }).join('');
          this.lineHandshakeCodes.set(userId, code);
          logger.info(`LINE handshake code for ${userId}: ${code}`);
          return code;
        };

        if (!currentCode) {
          generateCode();
        }

        if (text.trim() === currentCode) {
          await lineChannel.addToWhitelist(userId);
          this.lineHandshakeCodes.delete(userId);
        } else {
          if (normalized === '你好') {
            generateCode();
          }

          if (normalized === `/ufo-reset ${this.adminResetToken}`) {
            lineChannel.clearWhitelist();
            this.lineHandshakeCodes.clear();
            await this.sendToChannel(channel, userId, '🧹 已清空白名單與握手狀態');
            return;
          }

          await this.sendToChannel(
            channel,
            userId,
            '🔒 尚未授權。請依照後台顯示的握手符號回覆。若未看到請回覆「你好」以重新產生。'
          );
        }
        return;
      }
    }

    if (channel === 'line' && text) {
      this.broadcastToVSCode({
        type: 'ufo_message',
        channel,
        userId,
        text,
        messageId: parsed.messageId,
        timestamp: parsed.timestamp.toISOString(),
        media
      });
    }

    // 檢查是否為問候或第一次使用
    if (this.isGreeting(text)) {
      const greeting = this.soulManager.getGreeting();
      await this.sendToChannel(channel, userId, greeting);
      return;
    }

    // 解析指令
    const command = this.parseCommand(text);
    
    if (command) {
      await this.handleCommand(channel, userId, command);
    } else {
      // 使用 Soul Manager 判斷是否應該創建任務
      const shouldCreateTask = this.soulManager.shouldCreateTask(text);
      
      if (shouldCreateTask) {
        // 創建正式任務
        const task = this.taskManager.createTask({
          channel,
          userId,
          instruction: text,
          media
        });

        // 通知 VS Code extension
        this.broadcastToVSCode({
          type: 'new_task',
          task,
          instruction: text,
          media
        });
        
        logger.info(`Task created for user ${userId}: ${text}`);
      } else {
        // 一般對話，不創建任務，直接使用 Copilot 聊天
        logger.info(`General chat from user ${userId}: ${text}`);
        
        this.broadcastToVSCode({
          type: 'chat_message',
          channel,
          userId,
          message: text,
          media
        });
      }
    }
  }
  
  /**
   * 檢查是否為問候訊息
   */
  private isGreeting(text: string): boolean {
    const greetings = ['你好', '嗨', 'hi', 'hello', '哈囉', '安安'];
    const lowerText = text.toLowerCase().trim();
    return greetings.some(g => lowerText === g || lowerText === g + '!');
  }

  private parseCommand(text: string): { cmd: string; args: string } | null {
    if (!text.startsWith('/')) return null;
    
    const [cmd, ...argParts] = text.slice(1).split(' ');
    return { cmd: cmd.toLowerCase(), args: argParts.join(' ') };
  }

  private async handleCommand(channel: string, userId: string, command: { cmd: string; args: string }): Promise<void> {
    switch (command.cmd) {
      case 'ufo-reset': {
        if (channel !== 'line') {
          await this.sendToChannel(channel, userId, '❌ 此指令僅支援 LINE');
          break;
        }
        const token = command.args.trim();
        if (!token || token !== this.adminResetToken) {
          await this.sendToChannel(channel, userId, '❌ Reset token 不正確');
          break;
        }
        const lineChannel = this.channelManager.getChannel('line') as any;
        if (lineChannel) {
          lineChannel.clearWhitelist();
        }
        this.lineHandshakeCodes.clear();
        await this.sendToChannel(channel, userId, '🧹 已清空白名單與握手狀態');
        break;
      }
      case 'status':
        const tasks = this.taskManager.getTasksForUser(userId);
        const status = tasks.length > 0 
          ? tasks.map(t => `${t.status === 'running' ? '🔄' : t.status === 'completed' ? '✅' : '⏳'} ${t.id}: ${t.instruction.slice(0, 30)}...`).join('\n')
          : '目前沒有進行中的任務';
        await this.sendToChannel(channel, userId, `📊 任務狀態:\n${status}`);
        break;
        
      case 'model':
        this.broadcastToVSCode({
          type: 'switch_model',
          model: command.args,
          userId
        });
        await this.sendToChannel(channel, userId, `🤖 已切換模型至: ${command.args}`);
        break;
        
      case 'preview':
        const tunnelStatus = this.tunnelService.getStatus();
        if (tunnelStatus.active && tunnelStatus.url) {
          await this.sendToChannel(channel, userId, `🌐 預覽連結: ${tunnelStatus.url}`);
        } else {
          await this.sendToChannel(channel, userId, '❌ 目前沒有可用的預覽連結');
        }
        break;
        
      case 'mcp':
        const [server, action, ...params] = command.args.split(' ');
        if (server && action) {
          try {
            const result = await this.mcpController.invoke(server, action, params);
            await this.sendToChannel(channel, userId, `✅ MCP 執行結果:\n${JSON.stringify(result, null, 2)}`);
          } catch (error) {
            await this.sendToChannel(channel, userId, `❌ MCP 執行失敗: ${error}`);
          }
        } else {
          await this.sendToChannel(channel, userId, '用法: /mcp <server> <action> [params]');
        }
        break;
        
      case 'help':
        await this.sendToChannel(channel, userId, `
📖 VSMONSTER 指令說明:

/task <指令> - 建立新任務
/status - 查看任務狀態
/model <模型名> - 切換 AI 模型
/preview - 獲取預覽連結
/mcp <server> <action> - 執行 MCP 動作
/help - 顯示此說明
        `.trim());
        break;
        
      default:
        await this.sendToChannel(channel, userId, `❓ 未知指令: /${command.cmd}\n輸入 /help 查看可用指令`);
    }
  }

  private async sendToChannel(channel: string, userId: string, message: string): Promise<void> {
    try {
      await this.channelManager.sendMessage(channel, userId, message);
    } catch (error) {
      logger.error(`Failed to send message to ${channel}:`, error);
    }
  }

  private broadcastToVSCode(message: object): void {
    const data = JSON.stringify(message);
    this.vsCodeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  private broadcastToChannels(type: string, data: any): void {
    // 廣播到所有有活躍用戶的頻道
    this.channelManager.broadcastMessage(type, data);
  }

  private getPublicUrl(): string {
    if (this.config.publicUrl) {
      return this.config.publicUrl.replace(/\/+$/, '');
    }
    const tunnelStatus = this.tunnelService.getStatus();
    if (tunnelStatus.active && tunnelStatus.url) {
      return tunnelStatus.url.replace(/\/+$/, '');
    }
    return `http://localhost:${this.config.port || 3000}`;
  }

  private readTaskFiles(taskPath: string, taskId: string): { readme: string; agents: string; devSpec: string } {
    const safeTaskPath = path.resolve(taskPath);
    const readmePath = path.join(safeTaskPath, 'README.md');
    const agentsPath = path.join(safeTaskPath, 'AGENTS.md');
    const devSpecPath = path.join(safeTaskPath, `dev-spec-${taskId}.md`);

    const readFileSafe = (p: string) => {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch {
        return '';
      }
    };

    return {
      readme: readFileSafe(readmePath),
      agents: readFileSafe(agentsPath),
      devSpec: readFileSafe(devSpecPath)
    };
  }

  private renderApprovalPage(
    taskId: string,
    token: string,
    files: { readme: string; agents: string; devSpec: string }
  ): string {
    const escape = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UFO 任務確認 - ${taskId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f1115; color:#e5e7eb; padding:24px; }
    h1 { margin-bottom: 8px; }
    pre { background:#111827; padding:16px; border-radius:8px; overflow:auto; white-space:pre-wrap; }
    .card { margin-bottom: 24px; }
    button { padding:12px 16px; font-size:16px; border-radius:8px; border:none; background:#22c55e; color:#0b0f14; cursor:pointer; }
  </style>
</head>
<body>
  <h1>UFO 任務確認</h1>
  <p>任務 ID：${taskId}</p>

  <div class="card">
    <h2>README</h2>
    <pre>${escape(files.readme)}</pre>
  </div>
  <div class="card">
    <h2>AGENTS</h2>
    <pre>${escape(files.agents)}</pre>
  </div>
  <div class="card">
    <h2>DEV SPEC</h2>
    <pre>${escape(files.devSpec)}</pre>
  </div>

  <button id="approve">✅ 確認並開始開發</button>

  <script>
    document.getElementById('approve').addEventListener('click', async () => {
      const res = await fetch('/api/ufo/approve/${taskId}?token=${token}', { method: 'POST' });
      if (res.ok) {
        alert('已確認，任務已交接。');
      } else {
        alert('確認失敗，請稍後再試。');
      }
    });
  </script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    const port = this.config.port || 3000;
    
    // 初始化頻道
    await this.channelManager.initialize();
    
    // 啟動 ngrok (如果配置了)
    if (this.config.tunnel?.enabled) {
      await this.tunnelService.start(port);
    }
    
    // 初始化 MCP 服務器
    await this.mcpController.initialize();
    
    // 啟動服務器
    this.server.listen(port, () => {
      logger.info(`🚀 VSMONSTER Gateway running on port ${port}`);
      logger.info(`📡 Active channels: ${this.channelManager.getActiveChannels().join(', ')}`);
      
      if (this.tunnelService.getStatus().active) {
        logger.info(`🌐 Public URL: ${this.tunnelService.getStatus().url}`);
      }
    });
  }

  async stop(): Promise<void> {
    await this.tunnelService.stop();
    await this.mcpController.shutdown();
    this.server.close();
    logger.info('VSMONSTER Gateway stopped');
  }
}

// 主入口
if (require.main === module) {
  const gateway = new VSMONSTERGateway();
  
  gateway.start().catch(err => {
    logger.error('Failed to start gateway:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await gateway.stop();
    process.exit(0);
  });
}
