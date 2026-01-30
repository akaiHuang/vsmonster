/**
 * VSMONSTER Gateway - 簡化版
 * 
 * 核心職責：
 * 1. 連接 moltbot 接收社群訊息
 * 2. 橋接到 VS Code Copilot
 * 3. 管理任務狀態
 * 
 * 社群軟體連接由 moltbot 處理，不重複造輪子！
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { loadConfig, VSMONSTERConfig } from './config/loader';
import { TaskManager } from './task/manager';
import { CopilotBridge } from './copilot/bridge';
import { MCPController } from './mcp/controller';
import { logger } from './utils/logger';
import MoltbotClient, { MoltbotMessage, CopilotResponse } from './moltbot-integration';

export class VSMONSTERGateway {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: VSMONSTERConfig;
  
  // 核心服務
  private moltbot: MoltbotClient;
  private taskManager: TaskManager;
  private copilotBridge: CopilotBridge;
  private mcpController: MCPController;
  
  private vsCodeConnections: Set<WebSocket> = new Set();

  constructor() {
    this.config = loadConfig();
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // 初始化服務
    this.moltbot = new MoltbotClient(this.config.moltbotGatewayUrl || 'ws://127.0.0.1:18789');
    this.taskManager = new TaskManager();
    this.copilotBridge = new CopilotBridge();
    this.mcpController = new MCPController(this.config.mcp);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupMoltbotIntegration();
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
        moltbotConnected: this.moltbot !== null,
        tasks: this.taskManager.getRunningTaskCount(),
        vsCodeConnections: this.vsCodeConnections.size
      });
    });

    // 狀態頁面
    this.app.get('/status', (req, res) => {
      res.json({
        version: '0.1.0',
        moltbot: {
          connected: true, // TODO: 實際狀態
          gatewayUrl: this.config.moltbotGatewayUrl
        },
        tasks: this.taskManager.getAllTasks().map(t => ({
          id: t.id,
          status: t.status,
          channel: t.channel,
          progress: t.progress
        })),
        vsCode: {
          connected: this.vsCodeConnections.size > 0,
          connectionCount: this.vsCodeConnections.size
        }
      });
    });

    // 手動觸發任務（用於測試）
    this.app.post('/api/task', async (req, res) => {
      const { message, channel = 'manual' } = req.body;
      try {
        const task = await this.processMessage({
          channel: channel as any,
          from: 'api',
          body: message,
          sessionKey: `manual:${Date.now()}`
        });
        res.json({ success: true, taskId: task.id });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientType = new URL(req.url || '', 'http://localhost').searchParams.get('type');
      
      if (clientType === 'vscode') {
        this.vsCodeConnections.add(ws);
        logger.info('VS Code extension connected');
        
        ws.on('close', () => {
          this.vsCodeConnections.delete(ws);
          logger.info('VS Code extension disconnected');
        });

        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleVSCodeMessage(ws, message);
          } catch (error) {
            logger.error('VS Code message error:', error);
          }
        });
      }
    });
  }

  /**
   * 設定 Moltbot 整合
   * 監聽來自 moltbot 的訊息，處理後回傳
   */
  private setupMoltbotIntegration(): void {
    // 監聽來自社群軟體的訊息
    this.moltbot.on('message', async (msg: MoltbotMessage) => {
      logger.info(`📥 Message from ${msg.channel}: ${msg.body.substring(0, 50)}...`);
      
      try {
        // 處理訊息（建立任務 → Copilot → 回覆）
        const task = await this.processMessage(msg);
        
        // 廣播給 VS Code
        this.broadcastToVSCode({
          type: 'task:created',
          task: {
            id: task.id,
            status: task.status,
            channel: msg.channel,
            from: msg.from,
            message: msg.body.substring(0, 100)
          }
        });
      } catch (error) {
        logger.error('Message processing error:', error);
      }
    });

    this.moltbot.on('connected', () => {
      logger.info('🦞 Connected to Moltbot Gateway');
      this.broadcastToVSCode({ type: 'moltbot:connected' });
    });

    this.moltbot.on('disconnected', () => {
      logger.warn('🔌 Disconnected from Moltbot Gateway');
      this.broadcastToVSCode({ type: 'moltbot:disconnected' });
    });

    this.moltbot.on('error', (error) => {
      logger.error('Moltbot error:', error);
    });
  }

  /**
   * 處理訊息的核心流程
   */
  private async processMessage(msg: MoltbotMessage) {
    // 1. 建立任務
    const task = this.taskManager.createTask({
      channel: msg.channel,
      userId: msg.from,
      message: msg.body,
      sessionKey: msg.sessionKey
    });

    // 2. 解析指令（如果是指令的話）
    if (msg.body.startsWith('/')) {
      const response = await this.handleCommand(msg);
      if (response) {
        await this.sendReply(msg, response);
        this.taskManager.completeTask(task.id, response);
        return task;
      }
    }

    // 3. 發送到 VS Code Copilot
    this.taskManager.updateTaskStatus(task.id, 'processing');
    
    try {
      // 透過 WebSocket 發送給 VS Code
      const copilotResponse = await this.sendToCopilot(msg);
      
      // 4. 回覆到社群軟體
      await this.sendReply(msg, copilotResponse);
      
      this.taskManager.completeTask(task.id, copilotResponse);
    } catch (error) {
      this.taskManager.failTask(task.id, String(error));
      await this.sendReply(msg, `❌ 處理失敗: ${error}`);
    }

    return task;
  }

  /**
   * 處理斜線指令
   */
  private async handleCommand(msg: MoltbotMessage): Promise<string | null> {
    const [cmd, ...args] = msg.body.trim().split(/\s+/);
    
    switch (cmd.toLowerCase()) {
      case '/status':
        const tasks = this.taskManager.getAllTasks();
        const running = tasks.filter(t => t.status === 'processing').length;
        return `📊 VSMONSTER 狀態\n` +
               `• VS Code: ${this.vsCodeConnections.size > 0 ? '✅ 已連接' : '❌ 未連接'}\n` +
               `• 進行中任務: ${running}\n` +
               `• 總任務數: ${tasks.length}`;

      case '/help':
        return `🤖 VSMONSTER 指令\n` +
               `/status - 查看狀態\n` +
               `/task <描述> - 建立任務\n` +
               `/cancel - 取消當前任務\n` +
               `/help - 顯示此訊息\n\n` +
               `直接發送訊息會自動轉發到 VS Code Copilot`;

      case '/task':
        // 任務由 processMessage 主流程處理
        return null;

      case '/cancel':
        // TODO: 取消當前任務
        return '✅ 任務已取消';

      default:
        // 不是內建指令，讓 Copilot 處理
        return null;
    }
  }

  /**
   * 發送訊息到 VS Code Copilot
   */
  private sendToCopilot(msg: MoltbotMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.vsCodeConnections.size === 0) {
        reject(new Error('VS Code 未連接'));
        return;
      }

      const requestId = `req_${Date.now()}`;
      const request = {
        type: 'copilot:request',
        id: requestId,
        channel: msg.channel,
        from: msg.from,
        message: msg.body,
        sessionKey: msg.sessionKey
      };

      // 找一個連接發送
      const ws = this.vsCodeConnections.values().next().value;
      
      // 設定回應處理（簡化版，實際需要更完整的 request-response 追蹤）
      const timeout = setTimeout(() => {
        reject(new Error('Copilot 回應超時'));
      }, 60000);

      // 暫存回調
      (ws as any).__pendingRequests = (ws as any).__pendingRequests || new Map();
      (ws as any).__pendingRequests.set(requestId, { resolve, reject, timeout });

      ws.send(JSON.stringify(request));
    });
  }

  /**
   * 處理 VS Code 發來的訊息
   */
  private async handleVSCodeMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'copilot:response':
        // 處理 Copilot 回應
        const pending = (ws as any).__pendingRequests?.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(message.response);
          (ws as any).__pendingRequests.delete(message.requestId);
        }
        break;

      case 'task:progress':
        // 更新任務進度
        this.taskManager.updateTaskProgress(message.taskId, message.progress);
        // 可以選擇性地通知使用者
        break;

      case 'task:complete':
        this.taskManager.completeTask(message.taskId, message.result);
        break;

      default:
        logger.warn('Unknown VS Code message type:', message.type);
    }
  }

  /**
   * 回覆到社群軟體
   */
  private async sendReply(originalMsg: MoltbotMessage, response: string): Promise<void> {
    await this.moltbot.sendReply({
      text: response,
      channel: originalMsg.channel,
      to: originalMsg.from,
      sessionKey: originalMsg.sessionKey
    });
  }

  /**
   * 廣播給所有 VS Code 連接
   */
  private broadcastToVSCode(message: any): void {
    const data = JSON.stringify(message);
    this.vsCodeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * 啟動 Gateway
   */
  async start(): Promise<void> {
    const port = this.config.port || 3000;

    // 檢查 moltbot 是否已安裝
    const moltbotStatus = await MoltbotClient.checkMoltbotInstalled();
    if (!moltbotStatus.installed) {
      logger.warn('⚠️  Moltbot 未安裝！請執行: npm install -g moltbot@latest');
      logger.warn('   然後執行: moltbot onboard --install-daemon');
    } else {
      logger.info(`🦞 Moltbot 已安裝 (v${moltbotStatus.version})`);
      
      // 連接到 moltbot gateway
      try {
        await this.moltbot.connect();
      } catch (error) {
        logger.warn('⚠️  無法連接到 Moltbot Gateway，請確保已執行: moltbot gateway');
      }
    }

    // 啟動 Express server
    this.server.listen(port, () => {
      logger.info(`🚀 VSMONSTER Gateway 啟動於 http://localhost:${port}`);
      logger.info(`   健康檢查: http://localhost:${port}/health`);
      logger.info(`   狀態頁面: http://localhost:${port}/status`);
    });
  }

  /**
   * 停止 Gateway
   */
  async stop(): Promise<void> {
    this.moltbot.disconnect();
    this.server.close();
    logger.info('Gateway stopped');
  }
}

// 主程式入口
if (require.main === module) {
  const gateway = new VSMONSTERGateway();
  gateway.start().catch(console.error);

  // 優雅關閉
  process.on('SIGINT', async () => {
    await gateway.stop();
    process.exit(0);
  });
}

export default VSMONSTERGateway;
