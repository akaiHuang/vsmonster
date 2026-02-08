'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { useMissionStore } from './store';

interface SocketContextType {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

/** Map Gateway task status to kanban column */
function mapStatus(gatewayStatus: string) {
  switch (gatewayStatus) {
    case 'pending': return 'backlog' as const;
    case 'running': return 'in_progress' as const;
    case 'completed':
    case 'delivered':
    case 'approved': return 'completed' as const;
    case 'rejected': return 'review' as const;
    case 'failed':
    case 'cancelled': return 'blocked' as const;
    default: return 'backlog' as const;
  }
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setTasks, upsertTask } = useMissionStore();

  const fetchInitialTasks = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/tasks`);
      if (!res.ok) return;
      const tasks = await res.json();
      setTasks(tasks);
    } catch {
      // Gateway not reachable — will retry on reconnect
    }
  }, [setTasks]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = GATEWAY_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Mission Control connected to Gateway');
      setIsConnected(true);
      fetchInitialTasks();
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type as string;

        if (type?.startsWith('task:') && data.task) {
          const t = data.task;
          upsertTask(t.id, {
            title: t.instruction || t.id,
            description: t.instruction || '',
            status: mapStatus(t.status),
            progress: t.progress,
            gatewayTaskId: t.id,
            gatewayStatus: t.status,
            channel: t.channel,
            instruction: t.instruction,
            subtasks: t.subtasks,
            delivery: t.delivery,
          });
        }
      } catch {
        // ignore non-JSON or irrelevant messages
      }
    };

    wsRef.current = ws;
  }, [fetchInitialTasks, upsertTask]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <SocketContext.Provider value={{ isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
