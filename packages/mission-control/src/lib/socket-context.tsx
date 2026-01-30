'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMissionStore, TaskStatus } from './store';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { addTask, updateTask, moveTask, addWorker, updateWorker, removeWorker } = useMissionStore();

  useEffect(() => {
    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
    
    const newSocket = io(GATEWAY_URL, {
      query: { type: 'mission-control' },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('🎮 Mission Control connected to Gateway');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Mission Control disconnected');
      setIsConnected(false);
    });

    // 監聽任務事件
    newSocket.on('task:created', (task) => {
      addTask({
        title: task.title,
        description: task.description,
        status: 'backlog',
        category: task.category,
        projectId: task.projectId,
      });
    });

    newSocket.on('task:updated', ({ id, updates }) => {
      updateTask(id, updates);
    });

    newSocket.on('task:moved', ({ id, status }) => {
      moveTask(id, status as TaskStatus);
    });

    // 監聽 Worker 事件
    newSocket.on('worker:connected', (worker) => {
      addWorker({
        projectId: worker.projectId,
        projectName: worker.projectName,
        socketId: worker.socketId,
        status: 'connected',
        lastActivity: new Date(),
      });
    });

    newSocket.on('worker:disconnected', ({ id }) => {
      updateWorker(id, { status: 'disconnected' });
    });

    newSocket.on('worker:progress', ({ id, progress, currentTask }) => {
      updateWorker(id, { 
        lastActivity: new Date(),
        currentTask,
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [addTask, updateTask, moveTask, addWorker, updateWorker, removeWorker]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
