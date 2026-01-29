import { v4 as uuidv4 } from 'uuid';
import { Task, SubTask, TaskStatus, TaskPriority, MediaItem } from '../channels/base';
import { logger } from '../utils/logger';

export interface CreateTaskParams {
  channel: string;
  userId: string;
  instruction: string;
  media?: MediaItem[];
  priority?: TaskPriority;
}

/**
 * 任務管理器
 * 負責任務的建立、拆分、追蹤和狀態管理
 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private userTasks: Map<string, string[]> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();

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

    this.tasks.set(taskId, task);
    
    // 記錄用戶任務關係
    const userTaskList = this.userTasks.get(params.userId) || [];
    userTaskList.push(taskId);
    this.userTasks.set(params.userId, userTaskList);

    // 自動拆分任務
    this.analyzeAndSplitTask(task);

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

    // 基於指令關鍵字分析任務類型
    if (instruction.includes('專案') || instruction.includes('project')) {
      // 專案建立類任務
      subtasks.push(
        this.createSubTask(task.id, '初始化專案結構', 1),
        this.createSubTask(task.id, '安裝依賴套件', 2),
        this.createSubTask(task.id, '建立基礎架構', 3),
        this.createSubTask(task.id, '實作核心功能', 4),
        this.createSubTask(task.id, '測試與驗證', 5)
      );
    } else if (instruction.includes('頁面') || instruction.includes('page') || instruction.includes('component')) {
      // UI 組件類任務
      subtasks.push(
        this.createSubTask(task.id, '分析需求', 1),
        this.createSubTask(task.id, '建立組件檔案', 2),
        this.createSubTask(task.id, '實作 UI 結構', 3),
        this.createSubTask(task.id, '添加樣式', 4),
        this.createSubTask(task.id, '處理互動邏輯', 5)
      );
    } else if (instruction.includes('api') || instruction.includes('backend') || instruction.includes('後端')) {
      // API 類任務
      subtasks.push(
        this.createSubTask(task.id, '設計 API 端點', 1),
        this.createSubTask(task.id, '建立路由', 2),
        this.createSubTask(task.id, '實作控制器', 3),
        this.createSubTask(task.id, '資料驗證', 4),
        this.createSubTask(task.id, '錯誤處理', 5)
      );
    } else if (instruction.includes('bug') || instruction.includes('fix') || instruction.includes('修復')) {
      // 修復類任務
      subtasks.push(
        this.createSubTask(task.id, '分析問題', 1),
        this.createSubTask(task.id, '定位問題原因', 2),
        this.createSubTask(task.id, '實作修復', 3),
        this.createSubTask(task.id, '驗證修復', 4)
      );
    } else {
      // 通用任務
      subtasks.push(
        this.createSubTask(task.id, '分析指令', 1),
        this.createSubTask(task.id, '執行任務', 2),
        this.createSubTask(task.id, '驗證結果', 3)
      );
    }

    task.subtasks = subtasks;
    this.tasks.set(task.id, task);
  }

  /**
   * 建立子任務
   */
  private createSubTask(parentId: string, description: string, order: number): SubTask {
    return {
      id: `${parentId}-${order}`,
      parentId,
      description,
      status: 'pending',
      order,
    };
  }

  /**
   * 生成任務 ID
   */
  private generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = uuidv4().split('-')[0];
    return `task-${timestamp}-${random}`;
  }

  /**
   * 更新任務狀態
   */
  updateTask(taskId: string, status: TaskStatus, progress?: number): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return;
    }

    task.status = status;
    if (progress !== undefined) {
      task.progress = Math.min(100, Math.max(0, progress));
    }
    task.updatedAt = new Date();

    if (status === 'completed') {
      task.completedAt = new Date();
      task.progress = 100;
    }

    this.tasks.set(taskId, task);
    logger.debug(`Task ${taskId} updated: ${status} (${task.progress}%)`);
    this.emit('task:updated', task);
  }

  /**
   * 更新子任務狀態
   */
  updateSubTask(taskId: string, subTaskId: string, status: TaskStatus, result?: any): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.subtasks) return;

    const subTask = task.subtasks.find(st => st.id === subTaskId);
    if (!subTask) return;

    subTask.status = status;
    if (result) subTask.result = result;

    // 計算總進度
    const completedCount = task.subtasks.filter(st => st.status === 'completed').length;
    task.progress = Math.round((completedCount / task.subtasks.length) * 100);
    task.updatedAt = new Date();

    // 如果所有子任務完成，標記主任務完成
    if (completedCount === task.subtasks.length) {
      task.status = 'completed';
      task.completedAt = new Date();
    }

    this.tasks.set(taskId, task);
    this.emit('task:updated', task);
    this.emit('subtask:updated', { task, subTask });
  }

  /**
   * 取得任務
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 取得所有任務
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 取得用戶的所有任務
   */
  getTasksForUser(userId: string): Task[] {
    const taskIds = this.userTasks.get(userId) || [];
    return taskIds
      .map(id => this.tasks.get(id))
      .filter((task): task is Task => task !== undefined);
  }

  /**
   * 取得正在執行的任務數量
   */
  getRunningTaskCount(): number {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'running').length;
  }

  /**
   * 取得下一個待執行的子任務
   */
  getNextSubTask(taskId: string): SubTask | null {
    const task = this.tasks.get(taskId);
    if (!task || !task.subtasks) return null;

    return task.subtasks.find(st => st.status === 'pending') || null;
  }

  /**
   * 標記任務失敗
   */
  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.error = error;
    task.updatedAt = new Date();

    this.tasks.set(taskId, task);
    logger.error(`Task ${taskId} failed: ${error}`);
    this.emit('task:failed', task);
  }

  /**
   * 取消任務
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'cancelled';
    task.updatedAt = new Date();

    this.tasks.set(taskId, task);
    logger.info(`Task ${taskId} cancelled`);
    this.emit('task:cancelled', task);
  }

  /**
   * 格式化任務狀態為文字
   */
  formatTaskStatus(task: Task): string {
    const statusEmoji: Record<TaskStatus, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫',
    };

    let result = `${statusEmoji[task.status]} 任務: ${task.id}\n`;
    result += `指令: ${task.instruction.slice(0, 50)}${task.instruction.length > 50 ? '...' : ''}\n`;
    result += `進度: ${task.progress}%\n`;

    if (task.subtasks && task.subtasks.length > 0) {
      result += '\n子任務:\n';
      for (const st of task.subtasks) {
        const stEmoji = statusEmoji[st.status];
        result += `  ${stEmoji} [${st.order}] ${st.description}\n`;
      }
    }

    if (task.error) {
      result += `\n錯誤: ${task.error}`;
    }

    return result;
  }

  // 簡單的事件系統
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
}
