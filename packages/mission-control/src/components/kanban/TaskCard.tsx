'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';

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

const VIEWABLE_STATUSES = new Set(['completed', 'delivered', 'approved', 'rejected']);

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

  const showView = task.gatewayTaskId && VIEWABLE_STATUSES.has(task.gatewayStatus || '');

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

      {task.progress != null && task.progress > 0 && task.progress < 100 && (
        <div className="mt-2 h-1 rounded-full bg-dark-border overflow-hidden">
          <div
            className="h-full rounded-full bg-cyan-500 transition-all"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border">
        <span className="badge badge-gray">{task.category || task.channel || 'Other'}</span>
        <div className="flex items-center gap-2">
          {showView && (
            <Link
              href={`/task/${task.gatewayTaskId}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-monster-400 hover:text-monster-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              查看
            </Link>
          )}
          <span className="text-xs text-gray-500">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}
