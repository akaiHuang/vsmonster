import { v4 as uuidv4 } from 'uuid';
import { Task, SubTask, TaskStatus, TaskPriority, TaskDelivery, LLMResult, LineMetadata } from '../types';
import { MediaItem } from '@vsmonster/holography';
import { getTaskDatabase, TaskDatabase } from '../db/task-database';
import { logger } from '../utils/logger';
import { STATUS_EMOJI } from '../utils/constants';
import { SimpleCache } from '../utils/cache';

export interface CreateTaskParams {
  channel: string;
  userId: string;
  instruction: string;
  media?: MediaItem[];
  priority?: TaskPriority;
}

/** Validate that a task ID matches a safe pattern (alphanumeric + hyphens, max 100 chars). */
export function isValidTaskId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && /^[a-zA-Z0-9-]+$/.test(id);
}

/**
 * 任務管理器
 * 負責任務的建立、拆分、追蹤和狀態管理
 */
export class TaskManager {
  private db: TaskDatabase;
  private eventListeners: Map<string, Function[]> = new Map();

  // In-memory TTL caches to avoid redundant Array.from() / map lookups on
  // frequently polled endpoints (GET /api/tasks, GET /api/tasks/:id).
  // Caches are invalidated on every write operation so data is always fresh.
  private allTasksCache = new SimpleCache<Task[]>(5000);
  private taskCache = new SimpleCache<Task>(5000);

  constructor() {
    this.db = getTaskDatabase();
  }

  /** Invalidate all read caches. Must be called after every write. */
  private invalidateCaches(taskId?: string): void {
    this.allTasksCache.invalidate(); // always clear the list cache
    if (taskId) {
      this.taskCache.invalidate(taskId);
    } else {
      this.taskCache.invalidate();
    }
  }

  /**
   * 建立新任務
   */
  createTask(params: CreateTaskParams): Task {
    const taskId = this.generateTaskId();

    const task: Task = {
      id: taskId,
      channel: params.channel,
      userId: params.userId,
      instruction: params.instruction,
      media: params.media,
      status: 'pending',
      priority: params.priority || 'normal',
      progress: 0,
      subtasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 自動拆分任務
    this.analyzeAndSplitTask(task);

    this.db.insert(task);
    this.invalidateCaches(taskId);

    logger.info(`Task created: ${taskId} for user ${params.userId}`);
    this.emit('task:created', task);

    return task;
  }

  /**
   * 分析並拆分任務
   */
  private analyzeAndSplitTask(task: Task): void {
    const instruction = task.instruction.toLowerCase();
    const subtasks: SubTask[] = [];

    if (instruction.includes('專案') || instruction.includes('project')) {
      subtasks.push(
        this.createSubTask(task.id, '初始化專案結構', 1),
        this.createSubTask(task.id, '安裝依賴套件', 2),
        this.createSubTask(task.id, '建立基礎架構', 3),
        this.createSubTask(task.id, '實作核心功能', 4),
        this.createSubTask(task.id, '測試與驗證', 5)
      );
    } else if (instruction.includes('頁面') || instruction.includes('page') || instruction.includes('component')) {
      subtasks.push(
        this.createSubTask(task.id, '分析需求', 1),
        this.createSubTask(task.id, '建立組件檔案', 2),
        this.createSubTask(task.id, '實作 UI 結構', 3),
        this.createSubTask(task.id, '添加樣式', 4),
        this.createSubTask(task.id, '處理互動邏輯', 5)
      );
    } else if (instruction.includes('api') || instruction.includes('backend') || instruction.includes('後端')) {
      subtasks.push(
        this.createSubTask(task.id, '設計 API 端點', 1),
        this.createSubTask(task.id, '建立路由', 2),
        this.createSubTask(task.id, '實作控制器', 3),
        this.createSubTask(task.id, '資料驗證', 4),
        this.createSubTask(task.id, '錯誤處理', 5)
      );
    } else if (instruction.includes('bug') || instruction.includes('fix') || instruction.includes('修復')) {
      subtasks.push(
        this.createSubTask(task.id, '分析問題', 1),
        this.createSubTask(task.id, '定位問題原因', 2),
        this.createSubTask(task.id, '實作修復', 3),
        this.createSubTask(task.id, '驗證修復', 4)
      );
    } else {
      subtasks.push(
        this.createSubTask(task.id, '分析指令', 1),
        this.createSubTask(task.id, '執行任務', 2),
        this.createSubTask(task.id, '驗證結果', 3)
      );
    }

    task.subtasks = subtasks;
  }

  private createSubTask(parentId: string, description: string, order: number): SubTask {
    return {
      id: `${parentId}-${order}`,
      parentId,
      description,
      status: 'pending',
      order,
    };
  }

  private generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = uuidv4().split('-')[0];
    return `task-${timestamp}-${random}`;
  }

  /**
   * 更新任務狀態
   */
  updateTask(taskId: string, status: TaskStatus, progress?: number): void {
    if (!isValidTaskId(taskId)) {
      logger.warn(`Invalid task ID format: ${String(taskId).slice(0, 100)}`);
      return;
    }
    const task = this.db.findOne(taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return;
    }

    const update: Partial<Task> = { status, updatedAt: new Date() };
    if (progress !== undefined) {
      update.progress = Math.min(100, Math.max(0, progress));
    }
    if (status === 'completed') {
      update.completedAt = new Date();
      update.progress = 100;
    }

    this.db.updateOne(taskId, update);
    this.invalidateCaches(taskId);
    logger.debug(`Task ${taskId} updated: ${status} (${update.progress ?? task.progress}%)`);
    this.emit('task:updated', this.db.findOne(taskId));
  }

  /**
   * 更新子任務狀態
   */
  updateSubTask(taskId: string, subTaskId: string, status: TaskStatus, result?: any): void {
    const task = this.db.findOne(taskId);
    if (!task || !task.subtasks) return;

    const subTask = task.subtasks.find(st => st.id === subTaskId);
    if (!subTask) return;

    subTask.status = status;
    if (result) subTask.result = result;

    const completedCount = task.subtasks.filter(st => st.status === 'completed').length;
    const progress = Math.round((completedCount / task.subtasks.length) * 100);
    const update: Partial<Task> = { subtasks: task.subtasks, progress, updatedAt: new Date() };

    if (completedCount === task.subtasks.length) {
      update.status = 'completed';
      update.completedAt = new Date();
    }

    this.db.updateOne(taskId, update);
    this.invalidateCaches(taskId);
    const updated = this.db.findOne(taskId)!;
    this.emit('task:updated', updated);
    this.emit('subtask:updated', { task: updated, subTask });
  }

  /**
   * 設定任務交付資料
   */
  setTaskDelivery(taskId: string, delivery: TaskDelivery): void {
    if (!isValidTaskId(taskId)) return;
    const task = this.db.findOne(taskId);
    if (!task) return;

    const merged: TaskDelivery = { ...task.delivery, ...delivery };
    this.db.updateOne(taskId, { delivery: merged, updatedAt: new Date() });
    this.invalidateCaches(taskId);
    this.emit('task:delivered', this.db.findOne(taskId));
  }

  /**
   * 審核任務
   */
  reviewTask(taskId: string, approved: boolean, comment?: string): void {
    if (!isValidTaskId(taskId)) return;
    const task = this.db.findOne(taskId);
    if (!task) return;

    const status: TaskStatus = approved ? 'approved' : 'rejected';
    const deliveryUpdate: Partial<TaskDelivery> = {
      reviewStatus: approved ? 'approved' : 'rejected',
      reviewComment: comment,
      reviewedAt: new Date(),
    };
    const merged: TaskDelivery = { ...task.delivery, ...deliveryUpdate };
    this.db.updateOne(taskId, { delivery: merged, status, updatedAt: new Date() });
    this.invalidateCaches(taskId);
    this.emit('task:reviewed', this.db.findOne(taskId));
  }

  getTask(taskId: string): Task | undefined {
    if (!isValidTaskId(taskId)) return undefined;
    const cached = this.taskCache.get(taskId);
    if (cached !== undefined) return cached;
    const task = this.db.findOne(taskId);
    if (task) this.taskCache.set(taskId, task);
    return task;
  }

  getAllTasks(): Task[] {
    const cached = this.allTasksCache.get('__all__');
    if (cached !== undefined) return cached;
    const tasks = this.db.findAll();
    this.allTasksCache.set('__all__', tasks);
    return tasks;
  }

  getTasksForUser(userId: string): Task[] {
    return this.db.findByUser(userId);
  }

  getUserTasks(userId: string): Task[] {
    return this.getTasksForUser(userId);
  }

  updateTaskStatus(taskId: string, status: TaskStatus, progress?: number): void {
    return this.updateTask(taskId, status, progress);
  }

  completeTask(taskId: string): void {
    this.updateTask(taskId, 'completed', 100);
  }

  updateTaskProgress(taskId: string, progress: number): void {
    this.updateTask(taskId, 'running', progress);
  }

  getRunningTaskCount(): number {
    return this.db.findByStatus('running').length;
  }

  getNextSubTask(taskId: string): SubTask | null {
    const task = this.db.findOne(taskId);
    if (!task || !task.subtasks) return null;
    return task.subtasks.find(st => st.status === 'pending') || null;
  }

  failTask(taskId: string, error: string): void {
    if (!isValidTaskId(taskId)) return;
    const task = this.db.findOne(taskId);
    if (!task) return;

    this.db.updateOne(taskId, { status: 'failed', error, updatedAt: new Date() });
    this.invalidateCaches(taskId);
    logger.error(`Task ${taskId} failed: ${error}`);
    this.emit('task:failed', this.db.findOne(taskId));
  }

  cancelTask(taskId: string): void {
    if (!isValidTaskId(taskId)) return;
    this.db.updateOne(taskId, { status: 'cancelled', updatedAt: new Date() });
    this.invalidateCaches(taskId);
    logger.info(`Task ${taskId} cancelled`);
    this.emit('task:cancelled', this.db.findOne(taskId));
  }

  formatTaskStatus(task: Task): string {
    let result = `${STATUS_EMOJI[task.status] || '❓'} 任務: ${task.id}\n`;
    result += `指令: ${task.instruction.slice(0, 50)}${task.instruction.length > 50 ? '...' : ''}\n`;
    result += `進度: ${task.progress}%\n`;

    if (task.subtasks && task.subtasks.length > 0) {
      result += '\n子任務:\n';
      for (const st of task.subtasks) {
        const stEmoji = STATUS_EMOJI[st.status] || '❓';
        result += `  ${stEmoji} [${st.order}] ${st.description}\n`;
      }
    }

    if (task.error) {
      result += `\n錯誤: ${task.error}`;
    }

    return result;
  }

  on(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`Event listener error for ${event}:`, error);
      }
    });
  }

  // ============================================
  // LINE 長任務支持方法
  // ============================================

  /**
   * 設定 LLM 結果
   */
  setLLMResult(taskId: string, content: string, metadata?: { model?: string; tokensUsed?: number }): void {
    if (!isValidTaskId(taskId)) return;
    const task = this.db.findOne(taskId);
    if (!task) {
      logger.warn(`Task not found for LLM result: ${taskId}`);
      return;
    }

    const llmResult: LLMResult = {
      content,
      model: metadata?.model,
      tokensUsed: metadata?.tokensUsed,
      generatedAt: new Date(),
    };

    this.db.updateOne(taskId, { llmResult, updatedAt: new Date() });
    this.invalidateCaches(taskId);
    logger.info(`LLM result set for task ${taskId}`);
    this.emit('task:llm_result', { taskId, llmResult });
  }

  /**
   * 獲取 LLM 結果
   */
  getLLMResult(taskId: string): LLMResult | undefined {
    if (!isValidTaskId(taskId)) return undefined;
    const task = this.db.findOne(taskId);
    return task?.llmResult;
  }

  /**
   * 檢查是否有 LLM 結果
   */
  hasLLMResult(taskId: string): boolean {
    if (!isValidTaskId(taskId)) return false;
    const task = this.db.findOne(taskId);
    return !!task?.llmResult;
  }

  /**
   * 設定 LINE 元數據
   */
  setLineMetadata(taskId: string, metadata: Partial<LineMetadata>): void {
    if (!isValidTaskId(taskId)) return;
    const task = this.db.findOne(taskId);
    if (!task) return;

    const existingMetadata = task.lineMetadata || {};
    const merged: LineMetadata = { ...existingMetadata, ...metadata };

    this.db.updateOne(taskId, { lineMetadata: merged, updatedAt: new Date() });
    this.invalidateCaches(taskId);
  }

  /**
   * 獲取 LINE 元數據
   */
  getLineMetadata(taskId: string): LineMetadata | undefined {
    if (!isValidTaskId(taskId)) return undefined;
    const task = this.db.findOne(taskId);
    return task?.lineMetadata;
  }

  /**
   * 清除超時計時器
   */
  clearLineTimeoutTimer(taskId: string): void {
    const task = this.db.findOne(taskId);
    if (task?.lineMetadata?.timeoutTimer) {
      clearTimeout(task.lineMetadata.timeoutTimer);
      this.setLineMetadata(taskId, { timeoutTimer: undefined });
    }
  }
}
