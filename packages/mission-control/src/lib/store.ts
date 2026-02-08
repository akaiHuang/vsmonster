import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type TaskStatus =
  | 'backlog'
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'blocked';

export interface SubTask {
  id: string;
  parentId: string;
  description: string;
  status: string;
  order: number;
  result?: any;
}

export interface TaskDelivery {
  mediaIds?: string[];
  summary?: string;
  deliveredAt?: string;
  reviewedAt?: string;
  reviewStatus?: 'approved' | 'rejected';
  reviewComment?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  category?: string;
  projectId?: string;
  socketId?: string;
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
  /** Gateway task ID (for linking to delivery page) */
  gatewayTaskId?: string;
  /** Raw status from Gateway (pending/running/completed/delivered/approved/rejected) */
  gatewayStatus?: string;
  channel?: string;
  instruction?: string;
  subtasks?: SubTask[];
  delivery?: TaskDelivery;
}

export interface Worker {
  id: string;
  projectId: string;
  projectName: string;
  socketId: string;
  status: 'connecting' | 'connected' | 'disconnected';
  lastActivity: Date;
  currentTask?: string;
}

interface MissionState {
  tasks: Task[];
  workers: Worker[];

  // Task actions
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  deleteTask: (id: string) => void;

  /** Bulk-set tasks from Gateway (initial fetch) */
  setTasks: (gatewayTasks: any[]) => void;
  /** Insert or update a task by gatewayTaskId */
  upsertTask: (gatewayTaskId: string, updates: Partial<Task>) => void;

  // Worker actions
  addWorker: (worker: Omit<Worker, 'id'>) => void;
  updateWorker: (id: string, updates: Partial<Worker>) => void;
  removeWorker: (id: string) => void;
}

/** Map Gateway status → kanban column */
function mapGatewayStatus(status: string): TaskStatus {
  switch (status) {
    case 'pending': return 'backlog';
    case 'running': return 'in_progress';
    case 'completed':
    case 'delivered':
    case 'approved': return 'completed';
    case 'rejected': return 'review';
    case 'failed':
    case 'cancelled': return 'blocked';
    default: return 'backlog';
  }
}

export const useMissionStore = create<MissionState>((set) => ({
  tasks: [],
  workers: [],

  addTask: (task) =>
    set((state) => ({
      tasks: [
        ...state.tasks,
        {
          ...task,
          id: `task-${nanoid(8)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? { ...task, ...updates, updatedAt: new Date() }
          : task
      ),
    })),

  moveTask: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? { ...task, status, updatedAt: new Date() }
          : task
      ),
    })),

  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    })),

  setTasks: (gatewayTasks) =>
    set(() => ({
      tasks: gatewayTasks.map((t: any) => ({
        id: t.id,
        title: t.instruction || t.id,
        description: t.instruction || '',
        status: mapGatewayStatus(t.status),
        progress: t.progress,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
        gatewayTaskId: t.id,
        gatewayStatus: t.status,
        channel: t.channel,
        instruction: t.instruction,
        subtasks: t.subtasks,
        delivery: t.delivery,
      })),
    })),

  upsertTask: (gatewayTaskId, updates) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.gatewayTaskId === gatewayTaskId);
      if (idx >= 0) {
        const tasks = [...state.tasks];
        tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date() };
        return { tasks };
      }
      // New task
      return {
        tasks: [
          ...state.tasks,
          {
            id: gatewayTaskId,
            title: updates.title || gatewayTaskId,
            description: updates.description || '',
            status: updates.status || 'backlog',
            createdAt: new Date(),
            updatedAt: new Date(),
            gatewayTaskId,
            ...updates,
          } as Task,
        ],
      };
    }),

  addWorker: (worker) =>
    set((state) => ({
      workers: [
        ...state.workers,
        {
          ...worker,
          id: `worker-${nanoid(8)}`,
        },
      ],
    })),

  updateWorker: (id, updates) =>
    set((state) => ({
      workers: state.workers.map((worker) =>
        worker.id === id ? { ...worker, ...updates } : worker
      ),
    })),

  removeWorker: (id) =>
    set((state) => ({
      workers: state.workers.filter((worker) => worker.id !== id),
    })),
}));
