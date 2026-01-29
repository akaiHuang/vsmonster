import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { loadConfig, VsMoltConfig } from './config/loader';
import { ChannelManager } from './channels/manager';
import { TaskManager } from './task/manager';
import { TunnelService } from './tunnel/service';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { logger } from './utils/logger';

export class VsMoltGateway {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: VsMoltConfig;
  
  private channelManager: ChannelManager;
  private taskManager: TaskManager;
  private tunnelService: TunnelService;
  private copilotBridge: CopilotBridge;
  private mcpController: MCPController;
  
  private vsCodeConnections: Set<WebSocket> = new Set();

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
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
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

    // LINE Webhook
    this.app.post('/webhook/line', async (req, res) => {
      try {
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
    }
  }

  private async handleChannelMessage(channel: string, event: any): Promise<void> {
    const parsed = this.channelManager.parseMessage(channel, event);
    if (!parsed) return;

    const { userId, text, media } = parsed;

    // 解析指令
    const command = this.parseCommand(text);
    
    if (command) {
      await this.handleCommand(channel, userId, command);
    } else {
      // 一般訊息，發送到 Copilot
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

      // 發送確認訊息到社群
      await this.sendToChannel(channel, userId, `📋 收到指令，任務已建立: ${task.id}\n正在處理中...`);
    }
  }

  private parseCommand(text: string): { cmd: string; args: string } | null {
    if (!text.startsWith('/')) return null;
    
    const [cmd, ...argParts] = text.slice(1).split(' ');
    return { cmd: cmd.toLowerCase(), args: argParts.join(' ') };
  }

  private async handleCommand(channel: string, userId: string, command: { cmd: string; args: string }): Promise<void> {
    switch (command.cmd) {
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
📖 vsMolt 指令說明:

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
      logger.info(`🚀 vsMolt Gateway running on port ${port}`);
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
    logger.info('vsMolt Gateway stopped');
  }
}

// 主入口
if (require.main === module) {
  const gateway = new VsMoltGateway();
  
  gateway.start().catch(err => {
    logger.error('Failed to start gateway:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await gateway.stop();
    process.exit(0);
  });
}
