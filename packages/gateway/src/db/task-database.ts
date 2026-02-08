/**
 * Task Database
 * JSON 檔案持久化儲存任務資料
 */

import fs from 'fs';
import path from 'path';
import { Task } from '../types';

const DB_PATH = process.env.TASKS_DB_PATH || path.join(process.cwd(), 'data', '.tasks-db.json');

class TaskDatabase {
  private db: Map<string, Task> = new Map();
  private userIndex: Map<string, string[]> = new Map();
  private dbPath: string;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(data) as Task[];
        parsed.forEach(record => {
          const task: Task = {
            ...record,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
            completedAt: record.completedAt ? new Date(record.completedAt) : undefined,
          };
          if (task.delivery) {
            if (task.delivery.deliveredAt) task.delivery.deliveredAt = new Date(task.delivery.deliveredAt);
            if (task.delivery.reviewedAt) task.delivery.reviewedAt = new Date(task.delivery.reviewedAt);
          }
          this.db.set(task.id, task);
          this.addToUserIndex(task.userId, task.id);
        });
        console.log(`✅ 載入 ${parsed.length} 筆任務`);
      }
    } catch (error) {
      console.warn(`⚠️  無法載入任務資料庫: ${error}`);
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.db.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ 無法保存任務資料庫: ${error}`);
    }
  }

  private addToUserIndex(userId: string, taskId: string): void {
    const list = this.userIndex.get(userId) || [];
    if (!list.includes(taskId)) {
      list.push(taskId);
      this.userIndex.set(userId, list);
    }
  }

  insert(task: Task): void {
    this.db.set(task.id, task);
    this.addToUserIndex(task.userId, task.id);
    this.save();
  }

  findOne(id: string): Task | undefined {
    return this.db.get(id);
  }

  findAll(): Task[] {
    return Array.from(this.db.values());
  }

  findByUser(userId: string): Task[] {
    const taskIds = this.userIndex.get(userId) || [];
    return taskIds
      .map(id => this.db.get(id))
      .filter((t): t is Task => t !== undefined);
  }

  findByStatus(status: string): Task[] {
    return Array.from(this.db.values()).filter(t => t.status === status);
  }

  updateOne(id: string, update: Partial<Task>): boolean {
    const task = this.db.get(id);
    if (!task) return false;
    const updated = { ...task, ...update, id };
    this.db.set(id, updated);
    this.save();
    return true;
  }

  deleteOne(id: string): boolean {
    const task = this.db.get(id);
    if (!task) return false;
    this.db.delete(id);
    // Clean user index
    const userTasks = this.userIndex.get(task.userId);
    if (userTasks) {
      const filtered = userTasks.filter(tid => tid !== id);
      if (filtered.length > 0) {
        this.userIndex.set(task.userId, filtered);
      } else {
        this.userIndex.delete(task.userId);
      }
    }
    this.save();
    return true;
  }

  count(): number {
    return this.db.size;
  }
}

let instance: TaskDatabase | null = null;

export function getTaskDatabase(dbPath?: string): TaskDatabase {
  if (!instance) {
    instance = new TaskDatabase(dbPath);
  }
  return instance;
}

export { TaskDatabase };
