'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import clsx from 'clsx';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-gray-500',
  planned: 'bg-purple-500',
  in_progress: 'bg-cyan-500',
  review: 'bg-amber-500',
  completed: 'bg-green-500',
  blocked: 'bg-red-500',
};

export function TaskCard({ task, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const timeAgo = formatDistanceToNow(new Date(task.createdAt), {
    addSuffix: false,
    locale: zhTW,
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        'task-card',
        isDragging && 'dragging'
      )}
    >
      <div className="flex items-start gap-2">
        <div className={clsx('status-dot mt-2', STATUS_COLORS[task.status])} />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{task.title}</h3>
          <p className="text-sm text-gray-400 mt-1 line-clamp-2">
            {task.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border">
        <span className="badge badge-gray">{task.category || 'Other'}</span>
        <span className="text-xs text-gray-500">{timeAgo}</span>
      </div>
    </div>
  );
}
