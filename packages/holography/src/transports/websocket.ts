/**
 * Holography WebSocket Transport
 * 管理與 VS Code Extension 的 WebSocket 連接
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import { WSMessage, WSMessageType, IncomingMessage } from '../core/types';

export interface WebSocketTransportConfig {
  /** WebSocket 伺服器埠口（獨立模式） */
  port?: number;
  /** HTTP Server（共用端口模式） */
  server?: HttpServer;
  /** 心跳間隔（毫秒） */
  heartbeatInterval?: number;
  /** 連接超時（毫秒） */
  connectionTimeout?: number;
}

interface ClientConnection {
  ws: WebSocket;
  id: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  isAlive: boolean;
}

export class WebSocketTransport extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private config: WebSocketTransportConfig & { heartbeatInterval: number; connectionTimeout: number };
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private httpServer: HttpServer | null = null;

  constructor(config: WebSocketTransportConfig = {}) {
    super();
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval || 30000,
      connectionTimeout: config.connectionTimeout || 60000,
    };
    this.httpServer = config.server || null;
  }

  /**
   * 設定 HTTP Server（用於共用端口模式）
   */
  setServer(server: HttpServer): void {
    this.httpServer = server;
  }

  /**
   * 啟動 WebSocket 伺服器
   */
  start(): void {
    if (this.httpServer) {
      // 共用 HTTP Server 端口模式
      this.wss = new WebSocketServer({ server: this.httpServer });
    } else if (this.config.port) {
      // 獨立端口模式
      this.wss = new WebSocketServer({ port: this.config.port });
    } else {
      throw new Error('WebSocketTransport requires either a server or a port');
    }

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      this.emit('error', error);
    });

    // 啟動心跳檢查
    this.startHeartbeat();

    this.emit('started', { port: this.config.port || 'shared' });
  }

  /**
   * 處理新連接
   */
  private handleConnection(ws: WebSocket): void {
    const clientId = this.generateClientId();
    
    const client: ClientConnection = {
      ws,
      id: clientId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      isAlive: true,
    };

    this.clients.set(clientId, client);

    ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      this.emit('clientDisconnected', { clientId });
    });

    ws.on('error', (error) => {
      this.emit('clientError', { clientId, error });
    });

    ws.on('pong', () => {
      const c = this.clients.get(clientId);
      if (c) {
        c.isAlive = true;
        c.lastHeartbeat = new Date();
      }
    });

    // 發送連接確認
    this.sendToClient(clientId, {
      type: 'connected',
      payload: { clientId },
      timestamp: new Date().toISOString(),
    });

    this.emit('clientConnected', { clientId });
  }

  /**
   * 處理接收的訊息
   */
  private handleMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());
      
      // 更新心跳時間
      const client = this.clients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
      }

      switch (message.type) {
        case 'pong':
          // 心跳回應
          break;
        case 'message':
          this.emit('message', { clientId, message: message.payload });
          break;
        case 'response':
          this.emit('response', { clientId, response: message.payload });
          break;
        case 'command':
          this.emit('command', { clientId, command: message.payload });
          break;
        default:
          this.emit('unknownMessage', { clientId, message });
      }
    } catch (error) {
      this.emit('parseError', { clientId, error, data: data.toString() });
    }
  }

  /**
   * 發送訊息到指定客戶端
   */
  sendToClient(clientId: string, message: WSMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    client.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * 廣播訊息到所有客戶端
   */
  broadcast(message: WSMessage): void {
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * 轉發社群訊息到 VS Code Extension
   */
  forwardMessage(incomingMessage: IncomingMessage): void {
    const wsMessage: WSMessage = {
      type: 'message',
      payload: incomingMessage,
      timestamp: new Date().toISOString(),
    };

    this.broadcast(wsMessage);
  }

  /**
   * 發送指令到 Extension
   */
  sendCommand(command: string, args?: any): void {
    const wsMessage: WSMessage = {
      type: 'command',
      payload: { command, args },
      timestamp: new Date().toISOString(),
    };

    this.broadcast(wsMessage);
  }

  /**
   * 啟動心跳檢查
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          // 上次心跳沒有回應，關閉連接
          client.ws.terminate();
          this.clients.delete(clientId);
          this.emit('clientTimeout', { clientId });
          continue;
        }

        client.isAlive = false;
        client.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止 WebSocket 伺服器
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [clientId, client] of this.clients) {
      client.ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.emit('stopped');
  }

  /**
   * 獲取連接的客戶端數量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 獲取所有客戶端資訊
   */
  getClients(): { id: string; connectedAt: Date; lastHeartbeat: Date }[] {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      lastHeartbeat: c.lastHeartbeat,
    }));
  }

  /**
   * 檢查是否有活動連接
   */
  hasActiveConnections(): boolean {
    return this.clients.size > 0;
  }

  /**
   * 生成客戶端 ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
