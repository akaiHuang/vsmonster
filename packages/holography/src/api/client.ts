/**
 * UFO ↔ BlueMonster API Client
 * 用於 UFO Extension 連接到 BlueMonster
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  Task,
  TaskStatus,
  ChatMessage,
  ChatSession,
  DispatchTaskRequest,
  DispatchTaskResponse,
  GetTasksRequest,
  GetTasksResponse,
  GetChatHistoryRequest,
  GetChatHistoryResponse,
  TaskStatusUpdate,
  SendMessageRequest,
  APIMessage,
  createMessageId,
  wrapMessage,
} from './types';

export interface BlueMonsterAPIConfig {
  wsUrl: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export class BlueMonsterAPI extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<BlueMonsterAPIConfig>;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: BlueMonsterAPIConfig) {
    super();
    this.config = {
      wsUrl: config.wsUrl,
      autoReconnect: config.autoReconnect !== false,
      reconnectInterval: config.reconnectInterval || 5000,
    };
  }

  /**
   * 連接到 BlueMonster
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.isConnected = false;
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
    });
  }

  /**
   * 處理接收的訊息
   */
  private handleMessage(data: string): void {
    try {
      const message: APIMessage = JSON.parse(data);

      // 檢查是否是對 pending request 的回應
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        pending.resolve(message.payload);
        return;
      }

      // 處理推送訊息
      const payload = message.payload;
      if (payload.type === 'task_status_update') {
        this.emit('taskStatusUpdate', payload as TaskStatusUpdate);
      } else if (payload.type === 'send_message') {
        this.emit('sendMessageRequest', payload as SendMessageRequest);
      } else {
        this.emit('message', message);
      }
    } catch (error) {
      this.emit('parseError', { error, data });
    }
  }

  /**
   * 發送請求並等待回應
   */
  private async sendRequest<TReq, TRes>(payload: TReq, timeoutMs = 30000): Promise<TRes> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to BlueMonster');
    }

    const message = wrapMessage(payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(message.id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * 派發任務到 BlueMonster
   */
  async dispatchTask(
    title: string,
    options: {
      description?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      channel: string;
      userId: string;
      messageId?: string;
      context?: string;
    }
  ): Promise<DispatchTaskResponse> {
    const request: DispatchTaskRequest = {
      type: 'dispatch_task',
      task: {
        title,
        description: options.description,
        priority: options.priority,
        source: {
          channel: options.channel as any,
          userId: options.userId,
          messageId: options.messageId,
        },
        context: options.context,
      },
    };

    return this.sendRequest<DispatchTaskRequest, DispatchTaskResponse>(request);
  }

  /**
   * 取得任務列表
   */
  async getTasks(filter?: {
    status?: TaskStatus;
    channel?: string;
    userId?: string;
    limit?: number;
  }): Promise<Task[]> {
    const request: GetTasksRequest = {
      type: 'get_tasks',
      filter,
    };

    const response = await this.sendRequest<GetTasksRequest, GetTasksResponse>(request);
    return response.tasks;
  }

  /**
   * 取得聊天歷史
   */
  async getChatHistory(options: {
    sessionId?: string;
    channel?: string;
    userId?: string;
    limit?: number;
  }): Promise<{ session?: ChatSession; messages: ChatMessage[] }> {
    const request: GetChatHistoryRequest = {
      type: 'get_chat_history',
      ...options,
    };

    const response = await this.sendRequest<GetChatHistoryRequest, GetChatHistoryResponse>(request);
    return {
      session: response.session,
      messages: response.messages,
    };
  }

  /**
   * 排程重連
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // 重連失敗會在 close 事件中再次排程
      });
    }, this.config.reconnectInterval);
  }

  /**
   * 中斷連接
   */
  disconnect(): void {
    this.config.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 是否已連接
   */
  isConnectedToBlueMonster(): boolean {
    return this.isConnected;
  }
}
