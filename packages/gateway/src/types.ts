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
}

export interface SubTask {
  id: string;
  parentId: string;
  description: string;
  status: TaskStatus;
  order: number;
  result?: any;
}
