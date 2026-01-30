'use client';

import { useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { useMissionStore, Task, TaskStatus } from '@/lib/store';

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-gray-500' },
  { id: 'planned', title: 'Planned', color: 'bg-purple-500' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-cyan-500' },
  { id: 'review', title: 'Review', color: 'bg-amber-500' },
  { id: 'completed', title: 'Completed', color: 'bg-green-500' },
];

export function KanbanBoard() {
  const { tasks, moveTask } = useMissionStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const tasksByStatus = useMemo(() => {
    return COLUMNS.reduce((acc, column) => {
      acc[column.id] = tasks.filter((task) => task.status === column.id);
      return acc;
    }, {} as Record<TaskStatus, Task[]>);
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const taskId = active.id as string;
      const newStatus = over.id as TaskStatus;
      
      if (COLUMNS.some((col) => col.id === newStatus)) {
        moveTask(taskId, newStatus);
      }
    }
    
    setActiveTask(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            tasks={tasksByStatus[column.id]}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
