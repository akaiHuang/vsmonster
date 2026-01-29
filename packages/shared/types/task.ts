/**
 * 任務類型定義
 */

import { MediaItem } from './message';

/**
 * 任務優先級
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 任務狀態
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 子任務定義
 */
export interface SubTask {
  /** 子任務 ID */
  id: string;
  /** 父任務 ID */
  parentId: string;
  /** 描述 */
  description: string;
  /** 狀態 */
  status: TaskStatus;
  /** 順序 */
  order: number;
  /** 結果 */
  result?: any;
}

/**
 * 任務定義
 */
export interface Task {
  /** 任務 ID */
  id: string;
  /** 來源頻道 */
  channel: string;
  /** 用戶 ID */
  userId: string;
  /** 原始指令 */
  instruction: string;
  /** 附帶的媒體 */
  media?: MediaItem[];
  /** 任務狀態 */
  status: TaskStatus;
  /** 優先級 */
  priority: TaskPriority;
  /** 進度 (0-100) */
  progress: number;
  /** 子任務 */
  subtasks?: SubTask[];
  /** 建立時間 */
  createdAt: Date;
  /** 更新時間 */
  updatedAt: Date;
  /** 完成時間 */
  completedAt?: Date;
  /** 結果 */
  result?: any;
  /** 錯誤訊息 */
  error?: string;
}

/**
 * 建立任務的參數
 */
export interface CreateTaskParams {
  channel: string;
  userId: string;
  instruction: string;
  media?: MediaItem[];
  priority?: TaskPriority;
}

/**
 * 任務事件
 */
export interface TaskEvent {
  type: 'created' | 'updated' | 'completed' | 'failed' | 'cancelled';
  task: Task;
  timestamp: Date;
}

/**
 * 子任務事件
 */
export interface SubTaskEvent {
  type: 'started' | 'completed' | 'failed';
  task: Task;
  subTask: SubTask;
  timestamp: Date;
}
