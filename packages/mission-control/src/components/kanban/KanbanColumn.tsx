'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';
import { Task, TaskStatus } from '@/lib/store';
import clsx from 'clsx';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  color: string;
  tasks: Task[];
}

export function KanbanColumn({ id, title, color, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="kanban-column">
      <div className="kanban-column-header">
        <div className={clsx('w-2 h-2 rounded-full', color)} />
        <span className="font-medium text-white">{title}</span>
        <span className="text-gray-500 text-sm">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={clsx(
          'kanban-column-content',
          isOver && 'bg-monster-500/5 rounded-lg border-2 border-dashed border-monster-500/30'
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-8">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
