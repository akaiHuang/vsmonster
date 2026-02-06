/**
 * Holography Client
 * 用於 VS Code Extension 連接到 Holography Server
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { WSMessage, IncomingMessage, OutgoingMessage, ChannelType, VerifiedUser } from '../core/types';

export interface HolographyClientConfig {
  /** WebSocket 伺服器 URL */
  serverUrl: string;
  /** 自動重連 */
  autoReconnect?: boolean;
  /** 重連間隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重連嘗試次數 */
  maxReconnectAttempts?: number;
}

export class HolographyClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<HolographyClientConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private clientId: string | null = null;
  private isConnected = false;

  constructor(config: HolographyClientConfig) {
    super();
    this.config = {
      serverUrl: config.serverUrl,
      autoReconnect: config.autoReconnect !== false,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    };
  }

  /**
   * 連接到 Holography Server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          this.clientId = null;
          this.emit('disconnected');
          
          if (this.config.autoReconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 處理接收的訊息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'connected':
          this.clientId = message.payload?.clientId;
          this.emit('ready', { clientId: this.clientId });
          break;

        case 'message':
          // 來自社群的訊息
          this.emit('socialMessage', message.payload as IncomingMessage);
          break;

        case 'handshakeCode':
          this.emit('handshakeCode', message.payload);
          break;

        case 'users':
          this.emit('users', message.payload as VerifiedUser[]);
          break;

        case 'response':
          this.emit('response', message.payload);
          break;

        default:
          this.emit('unknownMessage', message);
      }
    } catch (error) {
      this.emit('parseError', { error, data: data.toString() });
    }
  }

  /**
   * 發送訊息到 Server
   */
  send(message: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * 發送命令到 Server
   */
  sendCommand(command: string, payload?: any): boolean {
    return this.send({
      type: 'command',
      payload: { type: command, payload },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 發送訊息到社群
   */
  sendToSocial(channel: ChannelType, userId: string, message: OutgoingMessage): boolean {
    return this.sendCommand('send', { channel, userId, message });
  }

  /**
   * 請求生成握手碼
   */
  requestHandshakeCode(): boolean {
    return this.sendCommand('generateHandshake');
  }

  /**
   * 請求用戶列表
   */
  requestUsers(): boolean {
    return this.sendCommand('getUsers');
  }

  /**
   * 排程重連
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    this.emit('reconnecting', { 
      attempt: this.reconnectAttempts, 
      maxAttempts: this.config.maxReconnectAttempts 
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // 重連失敗，會在 close 事件中再次排程
      });
    }, this.config.reconnectInterval);
  }

  /**
   * 中斷連接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.config.autoReconnect = false;
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 是否已連接
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 獲取客戶端 ID
   */
  getClientId(): string | null {
    return this.clientId;
  }
}
