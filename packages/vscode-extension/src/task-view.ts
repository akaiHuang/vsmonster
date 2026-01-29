import * as vscode from 'vscode';

interface Task {
  id: string;
  instruction: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  subtasks?: SubTask[];
  createdAt: string;
}

interface SubTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  order: number;
}

/**
 * 任務視圖
 * 在 VS Code 側邊欄顯示任務列表和狀態
 */
export class TaskView implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private tasks: Task[] = [];

  /**
   * 刷新視圖
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 添加任務
   */
  addTask(task: Task): void {
    this.tasks.unshift(task);
    this.refresh();
  }

  /**
   * 更新任務
   */
  updateTask(taskId: string, updates: Partial<Task>): void {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.tasks[index] = { ...this.tasks[index], ...updates };
      this.refresh();
    }
  }

  /**
   * 移除任務
   */
  removeTask(taskId: string): void {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.refresh();
  }

  /**
   * 清空所有任務
   */
  clearTasks(): void {
    this.tasks = [];
    this.refresh();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskItem): Thenable<TaskItem[]> {
    if (!element) {
      // 根層級：顯示所有任務
      return Promise.resolve(
        this.tasks.map(task => new TaskItem(task))
      );
    } else if (element.task.subtasks && element.task.subtasks.length > 0) {
      // 任務的子任務
      return Promise.resolve(
        element.task.subtasks.map(subtask => new SubTaskItem(subtask, element.task.id))
      );
    }
    
    return Promise.resolve([]);
  }
}

/**
 * 任務項目
 */
class TaskItem extends vscode.TreeItem {
  constructor(public readonly task: Task) {
    super(
      task.instruction.length > 40 
        ? task.instruction.slice(0, 40) + '...' 
        : task.instruction,
      task.subtasks && task.subtasks.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = task.id;
    this.tooltip = this.createTooltip();
    this.description = `${task.progress}%`;
    this.iconPath = this.getIcon();
    this.contextValue = 'task';
  }

  private createTooltip(): string {
    const lines = [
      `任務 ID: ${this.task.id}`,
      `狀態: ${this.getStatusText()}`,
      `進度: ${this.task.progress}%`,
      `建立時間: ${new Date(this.task.createdAt).toLocaleString()}`,
      '',
      this.task.instruction,
    ];
    return lines.join('\n');
  }

  private getStatusText(): string {
    const statusMap: Record<string, string> = {
      pending: '等待中',
      running: '執行中',
      completed: '已完成',
      failed: '失敗',
    };
    return statusMap[this.task.status] || this.task.status;
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.task.status) {
      case 'pending':
        return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
      case 'running':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
      case 'completed':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      case 'failed':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

/**
 * 子任務項目
 */
class SubTaskItem extends vscode.TreeItem {
  constructor(
    public readonly subtask: SubTask,
    public readonly parentTaskId: string
  ) {
    super(subtask.description, vscode.TreeItemCollapsibleState.None);

    this.id = subtask.id;
    this.tooltip = `[${subtask.order}] ${subtask.description}`;
    this.iconPath = this.getIcon();
    this.contextValue = 'subtask';
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.subtask.status) {
      case 'pending':
        return new vscode.ThemeIcon('circle-outline');
      case 'running':
        return new vscode.ThemeIcon('loading~spin');
      case 'completed':
        return new vscode.ThemeIcon('check');
      case 'failed':
        return new vscode.ThemeIcon('x');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}
