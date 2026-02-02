import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Gateway 客戶端
 * 負責與 VSMONSTER Gateway 的 WebSocket 通訊
 */
export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private pingInterval: NodeJS.Timer | null = null;

  constructor(url: string) {
    super();
    this.url = url.replace(/^http/, 'ws') + '/vscode';
  }

  /**
   * 連接到 Gateway
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        this.ws.on('close', () => {
          this.stopPingInterval();
          this.emit('disconnected');
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 斷開連接
   */
  disconnect(): void {
    this.stopPingInterval();
    this.reconnectAttempts = this.maxReconnectAttempts; // 防止重連
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 發送訊息
   */
  send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * 是否已連接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 處理收到的訊息
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'init':
        this.emit('init', message.data);
        break;
      
      case 'new_task':
        this.emit('new_task', message);
        break;
      
      case 'chat_message':
        this.emit('chat_message', message);
        break;
      
      case 'switch_model':
        this.emit('switch_model', message);
        break;
      
      case 'mcp_request':
        this.emit('mcp_request', message);
        break;
      
      case 'tunnel_update':
        this.emit('tunnel_update', message);
        break;
      
      case 'channel_update':
        this.emit('channel_update', message.data);
        break;
      
      case 'mcp_update':
        this.emit('mcp_update', message.data);
        break;
      
      case 'pong':
        // 收到心跳回應
        break;
      
      default:
        this.emit('message', message);
    }
  }

  /**
   * 啟動心跳檢測
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  /**
   * 停止心跳檢測
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval as any);
      this.pingInterval = null;
    }
  }

  /**
   * 嘗試重新連接
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.connect();
    } catch {
      // 重連失敗，會在 close 事件中再次嘗試
    }
  }
}
