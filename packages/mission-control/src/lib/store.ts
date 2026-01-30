import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type TaskStatus = 
  | 'backlog' 
  | 'planned' 
  | 'in_progress' 
  | 'review' 
  | 'completed' 
  | 'blocked';

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
  
  // Worker actions
  addWorker: (worker: Omit<Worker, 'id'>) => void;
  updateWorker: (id: string, updates: Partial<Worker>) => void;
  removeWorker: (id: string) => void;
}

export const useMissionStore = create<MissionState>((set) => ({
  tasks: [
    // Demo task
    {
      id: 'demo-1',
      title: "Create a 'Hello world' page first",
      description: "Create a 'Hello world' page first",
      status: 'backlog',
      category: 'Other',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
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
