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
  private ufoConnections: Set<WebSocket> = new Set();
  private lineHandshakeCodes: Map<string, string> = new Map();
  private telegramHandshakeCodes: Map<string, string> = new Map();
  private readonly handshakeEmojis = ['🛸', '👾', '🚀', '✨', '🌟'];
  private adminResetToken: string;
  private ufoApprovals: Map<string, { token: string; userId: string; channel: string; taskPath: string }> = new Map();

  // 用戶管理：記錄所有驗證過的用戶
  private verifiedUsers: Map<string, {
    id: string;
    channel: string;
    ip: string;
    verifiedAt: Date;
    lastActiveAt: Date;
    messageCount: number;
    displayName?: string;
  }> = new Map();

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

    // Telegram Webhook（帶 secret token 的路由）
    this.app.post('/webhook/telegram', async (req, res) => {
      try {
        // 驗證 Telegram IP 白名單（Telegram 官方 IP 範圍）
        const telegramIPs = [
          '149.154.160.0/20',  // Telegram 官方 IP 範圍
          '91.108.4.0/22',
          '91.108.8.0/22',
          '91.108.12.0/22',
          '91.108.16.0/22',
          '91.108.56.0/22',
          '127.0.0.1',         // localhost（開發用）
          '::1',
        ];
        
        const clientIP = req.headers['cf-connecting-ip'] || 
                         req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                         req.socket.remoteAddress || '';
        
        // 簡化的 IP 檢查（生產環境建議使用完整的 CIDR 檢查）
        const isFromTelegram = telegramIPs.some(ip => 
          clientIP.includes(ip.split('/')[0].split('.').slice(0, 2).join('.')) ||
          clientIP === ip ||
          clientIP === '127.0.0.1' ||
          clientIP === '::1' ||
          clientIP.includes('149.154') ||
          clientIP.includes('91.108')
        );
        
        if (!isFromTelegram && process.env.NODE_ENV === 'production') {
          logger.warn(`🚫 Telegram webhook rejected from IP: ${clientIP}`);
          res.sendStatus(403);
          return;
        }
        
        logger.info('📩 Telegram webhook received:', JSON.stringify(req.body).substring(0, 200));
        await this.handleChannelMessage('telegram', req.body);
        res.sendStatus(200);
      } catch (error) {
        logger.error('Telegram webhook error:', error);
        res.sendStatus(500);
      }
    });

    // Telegram Webhook（帶 secret token 的路由）
    this.app.post('/webhook/telegram/:secret', async (req, res) => {
      try {
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (expectedSecret && req.params.secret !== expectedSecret) {
          logger.warn(`🚫 Telegram webhook secret mismatch`);
          res.sendStatus(403);
          return;
        }
        
        const clientIp = req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
        logger.info('📩 Telegram webhook (secret) received:', JSON.stringify(req.body).substring(0, 200));
        await this.handleChannelMessage('telegram', req.body, String(clientIp));
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

    // ========== 發送訊息 API ==========
    // POST /api/send - 發送訊息給指定用戶
    this.app.post('/api/send', async (req, res) => {
      try {
        const { channel, userId, message } = req.body;
        
        if (!channel || !userId || !message) {
          return res.status(400).json({ 
            error: 'Missing required fields: channel, userId, message' 
          });
        }
        
        await this.channelManager.sendMessage(channel, userId, message);
        logger.info(`📤 Message sent to ${channel}:${userId}: ${message.substring(0, 50)}...`);
        res.json({ success: true, channel, userId });
      } catch (error) {
        logger.error('Send message error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/channels - 取得可用頻道列表
    this.app.get('/api/channels', (req, res) => {
      res.json({
        channels: this.channelManager.getActiveChannels(),
        users: Array.from(this.lastActiveUsers.entries()).map(([key, channel]) => ({
          channel,
          userId: key.split(':')[1]
        }))
      });
    });

    // POST /api/send - 發送訊息到指定頻道
    this.app.post('/api/send', async (req, res) => {
      const { channel, userId, message } = req.body;
      
      if (!channel || !message) {
        return res.status(400).json({ error: 'channel and message are required' });
      }

      try {
        if (userId) {
          // 發送給指定用戶
          await this.sendToChannel(channel, userId, message);
          res.json({ success: true, sent: { channel, userId, message } });
        } else {
          // 廣播給該頻道所有活躍用戶
          await this.broadcastToChannelUsers(channel, message);
          const users = this.getActiveUsersForChannel(channel);
          res.json({ success: true, broadcast: { channel, users: users.length, message } });
        }
      } catch (error) {
        logger.error('Failed to send message via API:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/users - 取得所有已驗證用戶
    this.app.get('/api/users', (req, res) => {
      const users = Array.from(this.verifiedUsers.values()).map(u => ({
        ...u,
        verifiedAt: u.verifiedAt.toISOString(),
        lastActiveAt: u.lastActiveAt.toISOString()
      }));
      res.json({ users, total: users.length });
    });

    // DELETE /api/users/:channel/:userId - 移除用戶
    this.app.delete('/api/users/:channel/:userId', (req, res) => {
      const { channel, userId } = req.params;
      const key = `${channel}:${userId}`;
      
      if (this.verifiedUsers.has(key)) {
        this.verifiedUsers.delete(key);
        this.lastActiveUsers.delete(key);
        
        // 同時從白名單移除
        const channelInstance = this.channelManager.getChannel(channel) as any;
        if (channelInstance?.removeFromWhitelist) {
          channelInstance.removeFromWhitelist(userId);
        }
        
        logger.info(`🗑️ 用戶已移除: ${key}`);
        res.json({ success: true, removed: key });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });

    // 發送訊息測試頁面
    this.app.get('/send', (req, res) => {
      res.send(this.renderSendMessagePage());
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
    const mediaUrl = this.config.mediaUrl || `http://localhost:${this.config.port || 3000}`;
    initializeMediaUrl(mediaUrl);
    this.app.use('/api/media', mediaRouter);
  }

  private getVerifiedUsersPath(): string {
    const dataDir = path.join(__dirname, '..', '..', 'gateway', 'data');
    return path.join(dataDir, 'verified-users.json');
  }

  private loadVerifiedUsers(): void {
    try {
      const filePath = this.getVerifiedUsersPath();
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const users = JSON.parse(data);
        
        // 轉換日期字串回 Date 物件
        for (const [key, user] of Object.entries(users)) {
          const userData = user as any;
          this.verifiedUsers.set(key, {
            ...userData,
            verifiedAt: new Date(userData.verifiedAt),
            lastActiveAt: new Date(userData.lastActiveAt)
          });
        }
        
        logger.info(`✅ 已載入 ${this.verifiedUsers.size} 個已驗證用戶`);
      }
    } catch (err) {
      logger.error(`⚠️ 無法載入已驗證用戶: ${err}`);
    }
  }

  private saveVerifiedUsers(): void {
    try {
      const dataDir = path.dirname(this.getVerifiedUsersPath());
      
      // 確保目錄存在
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // 轉換 Map 為 Object，並處理 Date 序列化
      const data: Record<string, any> = {};
      for (const [key, user] of this.verifiedUsers) {
        data[key] = {
          ...user,
          verifiedAt: user.verifiedAt.toISOString(),
          lastActiveAt: user.lastActiveAt.toISOString()
        };
      }
      
      const filePath = this.getVerifiedUsersPath();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`⚠️ 無法保存已驗證用戶: ${err}`);
    }
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const isVsCode = req.url?.includes('vscode') ?? false;
      const isUfo = req.url?.includes('client=ufo') ?? false;
      const clientType = isVsCode ? 'vscode' : 'unknown';
      
      if (clientType === 'vscode') {
        this.vsCodeConnections.add(ws);
        if (isUfo) {
          this.ufoConnections.add(ws);
          logger.info('UFO extension connected');
        } else {
          logger.info('VS Code extension connected');
        }
        
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
        if (this.ufoConnections.has(ws)) {
          this.ufoConnections.delete(ws);
          logger.info('UFO extension disconnected');
        } else {
          logger.info('VS Code extension disconnected');
        }
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

      case 'task_status_change':
        // UFO 任務狀態變更，通知所有活躍用戶
        logger.info(`Task status change: ${message.taskId} ${message.from} → ${message.to}`);
        await this.broadcastTaskStatusToAllChannels(message);
        break;

      case 'send_message':
        // 發送訊息到指定頻道和用戶
        if (message.channel && message.userId && message.content) {
          await this.sendToChannel(message.channel, message.userId, message.content);
        } else if (message.channel && message.content) {
          // 廣播到該頻道的所有活躍用戶
          await this.broadcastToChannelUsers(message.channel, message.content);
        }
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

  private async handleChannelMessage(channel: string, event: any, clientIp: string = 'unknown'): Promise<void> {
    const parsed = this.channelManager.parseMessage(channel, event);
    if (!parsed) return;

    const { userId, text, media, messageId } = parsed;
    
    // 取得用戶顯示名稱
    const displayName = this.extractDisplayName(channel, event);

    // 記錄活躍用戶（用於廣播通知）
    this.recordActiveUser(channel, userId);

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

    // === 自助重置命令（所有用戶都可以用） ===
    if (text.trim().toLowerCase() === '/reset') {
      const lineChannel = this.channelManager.getChannel('line') as any;
      const telegramChannel = this.channelManager.getChannel('telegram') as any;
      
      if (channel === 'line' && lineChannel) {
        lineChannel.removeFromWhitelist(userId);
        this.lineHandshakeCodes.delete(userId);
        this.verifiedUsers.delete(`${channel}:${userId}`);
        this.saveVerifiedUsers();
        await this.sendToChannel(channel, userId, '🔄 重置成功！請發送「你好」開始重新握手驗證。');
        return;
      } else if (channel === 'telegram' && telegramChannel) {
        telegramChannel.removeFromWhitelist(userId);
        this.telegramHandshakeCodes.delete(userId);
        this.verifiedUsers.delete(`${channel}:${userId}`);
        this.saveVerifiedUsers();
        await this.sendToChannel(channel, userId, '🔄 重置成功！請發送「你好」開始重新握手驗證。');
        return;
      }
    }

    // === LINE 白名單握手 ===
    if (channel === 'line') {
      const lineChannel = this.channelManager.getChannel('line') as any;
      if (lineChannel && !lineChannel.isWhitelisted(userId)) {
        const normalized = text.trim().toLowerCase();
        const currentCode = this.lineHandshakeCodes.get(userId);
        const generateCode = () => {
          const code = Array.from({ length: 4 }, () => {
            return this.handshakeEmojis[Math.floor(Math.random() * this.handshakeEmojis.length)];
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
          this.recordActiveUser(channel, userId);
          
          // 記錄已驗證用戶的完整資訊
          this.verifiedUsers.set(`${channel}:${userId}`, {
            id: userId,
            channel,
            ip: clientIp,
            verifiedAt: new Date(),
            lastActiveAt: new Date(),
            messageCount: 1,
            displayName
          });
          logger.info(`✅ 用戶已驗證: ${channel}:${userId} (IP: ${clientIp}, 名稱: ${displayName || 'N/A'})`);
          
          // 保存到檔案
          this.saveVerifiedUsers();
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

    // === Telegram 白名單握手 ===
    if (channel === 'telegram') {
      const telegramChannel = this.channelManager.getChannel('telegram') as any;
      if (telegramChannel && !telegramChannel.isWhitelisted(userId)) {
        const normalized = text.trim().toLowerCase();
        const currentCode = this.telegramHandshakeCodes.get(userId);
        
        const generateCode = () => {
          const code = Array.from({ length: 4 }, () => {
            return this.handshakeEmojis[Math.floor(Math.random() * this.handshakeEmojis.length)];
          }).join('');
          this.telegramHandshakeCodes.set(userId, code);
          
          // 只在終端機顯示驗證碼（安全）
          logger.info(`🔐 Telegram 握手驗證碼: ${code} (用戶: ${userId})`);
          
          // 也發送到 VS Code
          this.broadcastToVSCode({
            type: 'handshake_code',
            channel: 'telegram',
            userId,
            code,
            message: `🔐 Telegram 握手驗證碼: ${code} (用戶 ID: ${userId})`
          });
          
          return code;
        };

        // 驗證握手碼
        if (currentCode && text.trim() === currentCode) {
          await telegramChannel.addToWhitelist(userId);
          this.telegramHandshakeCodes.delete(userId);
          this.recordActiveUser(channel, userId);
          
          // 記錄已驗證用戶的完整資訊
          this.verifiedUsers.set(`${channel}:${userId}`, {
            id: userId,
            channel,
            ip: clientIp,
            verifiedAt: new Date(),
            lastActiveAt: new Date(),
            messageCount: 1,
            displayName
          });
          logger.info(`✅ 用戶已驗證: ${channel}:${userId} (IP: ${clientIp}, 名稱: ${displayName || 'N/A'})`);
          
          // 保存到檔案
          this.saveVerifiedUsers();
          
          await this.sendToChannel(channel, userId, '✅ 驗證成功！歡迎使用 UFO 🛸');
          return;
        }
        
        // 特殊命令：重新產生驗證碼
        if (normalized === '你好' || normalized === 'hi' || normalized === 'hello' || normalized === '/start') {
          generateCode();
          await this.sendToChannel(
            channel,
            userId,
            '🔒 請查看 VS Code 終端機中的驗證碼，然後在這裡輸入。'
          );
          return;
        }

        // 管理員重置命令
        if (normalized === `/ufo-reset ${this.adminResetToken}`) {
          telegramChannel.clearWhitelist();
          this.telegramHandshakeCodes.clear();
          await this.sendToChannel(channel, userId, '🧹 已清空白名單與握手狀態');
          return;
        }

        // 如果還沒有驗證碼，產生一個
        if (!currentCode) {
          generateCode();
        }
        
        // 提示用戶查看終端機
        await this.sendToChannel(
          channel,
          userId,
          '🔒 尚未授權\n\n請查看 VS Code 終端機中的驗證碼，然後在這裡輸入相同的符號。\n\n💡 輸入「你好」可重新產生驗證碼。'
        );
        return;
      }
    }

    // 發送訊息給 UFO extension（支援所有 channel）
    if (text) {
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
      if (this.ufoConnections.size > 0) {
        return;
      }
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
      case 'task':
      case 'confirm':
        // UFO 專用指令：交由 UFO 擴充處理，不在 Gateway 端提示未知指令
        break;
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

  /**
   * 廣播任務狀態變更到所有活躍頻道的用戶
   */
  private async broadcastTaskStatusToAllChannels(message: {
    taskId: string;
    from: string;
    to: string;
    message: string;
  }): Promise<void> {
    const channels = this.channelManager.getActiveChannels();
    for (const channel of channels) {
      try {
        // 取得該頻道最近活躍的用戶
        const activeUsers = this.getActiveUsersForChannel(channel);
        for (const userId of activeUsers) {
          await this.sendToChannel(channel, userId, message.message);
        }
      } catch (error) {
        logger.error(`Failed to broadcast to ${channel}:`, error);
      }
    }
  }

  /**
   * 廣播訊息到指定頻道的所有活躍用戶
   */
  private async broadcastToChannelUsers(channel: string, content: string): Promise<void> {
    const activeUsers = this.getActiveUsersForChannel(channel);
    for (const userId of activeUsers) {
      await this.sendToChannel(channel, userId, content);
    }
  }

  /**
   * 取得頻道的活躍用戶列表
   */
  private getActiveUsersForChannel(channel: string): string[] {
    const users: string[] = [];
    this.lastActiveUsers.forEach((userChannel, key) => {
      if (userChannel === channel) {
        const userId = key.split(':')[1];
        if (userId) users.push(userId);
      }
    });
    return users;
  }

  // 記錄活躍用戶
  private lastActiveUsers = new Map<string, string>(); // key: "channel:userId", value: channel

  private recordActiveUser(channel: string, userId: string): void {
    this.lastActiveUsers.set(`${channel}:${userId}`, channel);
    
    // 更新已驗證用戶的活躍時間和訊息計數
    const key = `${channel}:${userId}`;
    const user = this.verifiedUsers.get(key);
    if (user) {
      user.lastActiveAt = new Date();
      user.messageCount++;
      
      // 每次活躍時自動保存
      this.saveVerifiedUsers();
    }
  }

  /**
   * 從事件中提取用戶顯示名稱
   */
  private extractDisplayName(channel: string, event: any): string | undefined {
    try {
      if (channel === 'telegram' && event.message?.from) {
        const from = event.message.from;
        return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username;
      }
      if (channel === 'line' && event.source?.userId) {
        // LINE 需要額外 API 呼叫取得名稱，這裡先回傳 undefined
        return undefined;
      }
      if (channel === 'discord' && event.member?.user) {
        return event.member.user.username;
      }
    } catch {
      return undefined;
    }
    return undefined;
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
    
    // 載入已驗證用戶（從持久化存儲）
    this.loadVerifiedUsers();
    
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
      logger.info(`📬 Send message page: http://localhost:${port}/send`);
      
      if (this.tunnelService.getStatus().active) {
        logger.info(`🌐 Public URL: ${this.tunnelService.getStatus().url}`);
      }
    });
  }

  private renderSendMessagePage(): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UFO - 發送訊息</title>
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
    h1 {
      text-align: center;
      margin-bottom: 30px;
      font-size: 28px;
    }
    h1 span { font-size: 40px; }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #aaa;
    }
    select, input, textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 16px;
    }
    select:focus, input:focus, textarea:focus {
      outline: none;
      border-color: #00d4ff;
      box-shadow: 0 0 0 3px rgba(0,212,255,0.2);
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0,212,255,0.4);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 8px;
      display: none;
    }
    .result.success {
      background: rgba(0,255,100,0.1);
      border: 1px solid rgba(0,255,100,0.3);
      color: #0f0;
      display: block;
    }
    .result.error {
      background: rgba(255,100,100,0.1);
      border: 1px solid rgba(255,100,100,0.3);
      color: #f66;
      display: block;
    }
    .users-list {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .users-list h3 {
      color: #aaa;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .users-list h3 button {
      background: rgba(0,212,255,0.2);
      border: 1px solid rgba(0,212,255,0.3);
      color: #0af;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .users-list h3 button:hover {
      background: rgba(0,212,255,0.3);
    }
    .user-item {
      display: flex;
      align-items: center;
      padding: 12px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      margin-bottom: 10px;
      transition: background 0.2s;
    }
    .user-item:hover {
      background: rgba(0,212,255,0.1);
    }
    .user-main {
      flex: 1;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    .user-item .channel {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-right: 12px;
      font-weight: bold;
    }
    .user-item .channel.line { background: #06c755; }
    .user-item .channel.telegram { background: #0088cc; }
    .user-item .channel.discord { background: #5865f2; }
    .user-info {
      flex: 1;
    }
    .user-name {
      font-weight: bold;
      margin-bottom: 4px;
    }
    .user-meta {
      display: flex;
      gap: 15px;
      font-size: 11px;
      color: #888;
      margin-bottom: 2px;
    }
    .user-time {
      display: flex;
      gap: 15px;
      font-size: 10px;
      color: #666;
    }
    .delete-btn {
      background: rgba(255,100,100,0.2);
      border: 1px solid rgba(255,100,100,0.3);
      color: #f66;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-left: 10px;
    }
    .delete-btn:hover {
      background: rgba(255,100,100,0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><span>🛸</span> UFO 發送訊息</h1>
    
    <form id="sendForm">
      <div class="form-group">
        <label for="channel">頻道</label>
        <select id="channel" required>
          <option value="">選擇頻道...</option>
          <option value="line">LINE</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="userId">用戶 ID</label>
        <input type="text" id="userId" placeholder="輸入用戶 ID" required>
      </div>
      
      <div class="form-group">
        <label for="message">訊息內容</label>
        <textarea id="message" placeholder="輸入要發送的訊息..." required></textarea>
      </div>
      
      <button type="submit" id="sendBtn">📤 發送訊息</button>
    </form>
    
    <div id="result" class="result"></div>
    
    <div class="users-list">
      <h3>📋 已驗證的用戶 <button onclick="loadUsers()">🔄 刷新</button></h3>
      <div id="usersList">載入中...</div>
    </div>
  </div>

  <script>
    const form = document.getElementById('sendForm');
    const result = document.getElementById('result');
    const usersList = document.getElementById('usersList');
    const channelSelect = document.getElementById('channel');
    const userIdInput = document.getElementById('userId');
    const sendBtn = document.getElementById('sendBtn');

    // 載入用戶列表
    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        
        if (data.users && data.users.length > 0) {
          usersList.innerHTML = data.users.map(u => {
            const verifiedDate = new Date(u.verifiedAt).toLocaleString('zh-TW');
            const lastActive = new Date(u.lastActiveAt).toLocaleString('zh-TW');
            const idShort = u.id.length > 15 ? u.id.substring(0, 15) + '...' : u.id;
            return \`
            <div class="user-item">
              <div class="user-main" onclick="selectUser('\${u.channel}', '\${u.id}')">
                <span class="channel \${u.channel}">\${u.channel.toUpperCase()}</span>
                <div class="user-info">
                  <div class="user-name">\${u.displayName || '未知用戶'}</div>
                  <div class="user-meta">
                    <span>🆔 \${idShort}</span>
                    <span>🌐 \${u.ip}</span>
                    <span>💬 \${u.messageCount} 則</span>
                  </div>
                  <div class="user-time">
                    <span>✅ 驗證: \${verifiedDate}</span>
                    <span>⏰ 活躍: \${lastActive}</span>
                  </div>
                </div>
              </div>
              <button class="delete-btn" onclick="deleteUser('\${u.channel}', '\${u.id}')" title="移除用戶">🗑️</button>
            </div>
          \`}).join('');
        } else {
          usersList.innerHTML = '<p style="color:#666">尚無已驗證的用戶。請先完成握手驗證。</p>';
        }
      } catch (err) {
        console.error('loadUsers error:', err);
        usersList.innerHTML = '<p style="color:#f66">無法載入用戶列表: ' + (err.message || err) + '</p>';
      }
    }

    function selectUser(channel, userId) {
      channelSelect.value = channel;
      userIdInput.value = userId;
    }

    async function deleteUser(channel, userId) {
      if (!confirm('確定要移除此用戶嗎？\\n移除後需要重新握手驗證。')) return;
      
      try {
        const res = await fetch(\`/api/users/\${channel}/\${userId}\`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          alert('✅ 用戶已移除');
          loadUsers();
        } else {
          alert('❌ ' + (data.error || '移除失敗'));
        }
      } catch (err) {
        alert('❌ 網路錯誤');
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const channel = channelSelect.value;
      const userId = userIdInput.value.trim();
      const message = document.getElementById('message').value.trim();
      
      if (!channel || !userId || !message) {
        result.className = 'result error';
        result.textContent = '請填寫所有欄位';
        return;
      }
      
      sendBtn.disabled = true;
      sendBtn.textContent = '發送中...';
      
      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, message })
        });
        
        const data = await res.json();
        
        if (data.success) {
          result.className = 'result success';
          result.textContent = '✅ 訊息已發送！';
          document.getElementById('message').value = '';
        } else {
          result.className = 'result error';
          result.textContent = '❌ ' + (data.error || '發送失敗');
        }
      } catch (err) {
        result.className = 'result error';
        result.textContent = '❌ 網路錯誤: ' + err.message;
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 發送訊息';
      }
    });

    // 載入並每 30 秒自動刷新
    loadUsers();
    setInterval(loadUsers, 30000);
  </script>
</body>
</html>`;
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
