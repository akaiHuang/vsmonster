/**
 * Gateway 本地型別定義
 * 從舊的 channels/base.ts 提取，供 TaskManager 等模組使用
 */

import { MediaItem } from '@vsmonster/holography';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  | 'delivered' | 'approved' | 'rejected';

export interface TaskDelivery {
  mediaIds?: string[];
  summary?: string;
  deliveredAt?: Date;
  reviewedAt?: Date;
  reviewStatus?: 'approved' | 'rejected';
  reviewComment?: string;
}

/**
 * LLM 結果存儲
 */
export interface LLMResult {
  content: string;
  model?: string;
  tokensUsed?: number;
  generatedAt: Date;
}

/**
 * LINE 特定元數據
 */
export interface LineMetadata {
  originalReplyToken?: string;
  loadingStartedAt?: Date;
  timeoutHandled?: boolean;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface Task {
  id: string;
  channel: string;
  userId: string;
  instruction: string;
  media?: MediaItem[];
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  subtasks?: SubTask[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  delivery?: TaskDelivery;
  // LINE 長任務支持
  llmResult?: LLMResult;
  lineMetadata?: LineMetadata;
}

export interface SubTask {
  id: string;
  parentId: string;
  description: string;
  status: TaskStatus;
  order: number;
  result?: any;
}
