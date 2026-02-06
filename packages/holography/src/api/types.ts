/**
 * UFO ↔ BlueMonster API Types
 * 定義 UFO Extension 與 BlueMonster 之間的通訊協議
 */

// ============================================
// 任務相關
// ============================================

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  source: TaskSource;
  metadata?: Record<string, any>;
}

export type TaskStatus = 
  | 'pending'      // 等待處理
  | 'in_progress'  // 處理中
  | 'completed'    // 完成
  | 'failed'       // 失敗
  | 'cancelled';   // 取消

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskSource {
  channel: 'line' | 'telegram' | 'discord' | 'vscode';
  userId: string;
  messageId?: string;
}

// ============================================
// 聊天歷史
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  channel?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  channel: string;
  userId: string;
  messages: ChatMessage[];
  startedAt: Date;
  lastActivityAt: Date;
}

// ============================================
// API 請求/回應
// ============================================

// UFO → BlueMonster: 派發任務
export interface DispatchTaskRequest {
  type: 'dispatch_task';
  task: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    source: TaskSource;
    context?: string;  // 相關的對話內容
  };
}

export interface DispatchTaskResponse {
  success: boolean;
  taskId?: string;
  error?: string;
}

// UFO → BlueMonster: 取得任務列表
export interface GetTasksRequest {
  type: 'get_tasks';
  filter?: {
    status?: TaskStatus;
    channel?: string;
    userId?: string;
    limit?: number;
  };
}

export interface GetTasksResponse {
  success: boolean;
  tasks: Task[];
  total: number;
}

// UFO → BlueMonster: 取得聊天歷史
export interface GetChatHistoryRequest {
  type: 'get_chat_history';
  sessionId?: string;
  channel?: string;
  userId?: string;
  limit?: number;
}

export interface GetChatHistoryResponse {
  success: boolean;
  session?: ChatSession;
  messages: ChatMessage[];
}

// BlueMonster → UFO: 任務狀態更新
export interface TaskStatusUpdate {
  type: 'task_status_update';
  taskId: string;
  status: TaskStatus;
  message?: string;
  result?: any;
}

// BlueMonster → UFO: 發送訊息請求
export interface SendMessageRequest {
  type: 'send_message';
  channel: string;
  userId: string;
  message: string;
  replyToMessageId?: string;
}

// ============================================
// WebSocket 訊息封裝
// ============================================

export type UFOToBlueMonsterMessage = 
  | DispatchTaskRequest
  | GetTasksRequest
  | GetChatHistoryRequest;

export type BlueMonsterToUFOMessage = 
  | TaskStatusUpdate
  | SendMessageRequest;

export interface APIMessage<T = any> {
  id: string;           // 訊息 ID（用於請求-回應配對）
  timestamp: string;
  payload: T;
}

// ============================================
// 輔助函數
// ============================================

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function wrapMessage<T>(payload: T): APIMessage<T> {
  return {
    id: createMessageId(),
    timestamp: new Date().toISOString(),
    payload,
  };
}
