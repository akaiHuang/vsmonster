'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MediaGallery } from '@/components/delivery/MediaGallery';
import { ReviewPanel } from '@/components/delivery/ReviewPanel';

interface SubTask {
  id: string;
  description: string;
  status: string;
  order: number;
}

interface TaskDetail {
  task: {
    id: string;
    instruction: string;
    status: string;
    priority: string;
    progress: number;
    channel: string;
    userId: string;
    subtasks?: SubTask[];
    delivery?: {
      mediaIds?: string[];
      summary?: string;
      deliveredAt?: string;
      reviewedAt?: string;
      reviewStatus?: 'approved' | 'rejected';
      reviewComment?: string;
    };
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
  media: any[];
}

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  pending: { label: '等待中', emoji: '⏳', color: 'bg-gray-500/20 text-gray-400' },
  running: { label: '執行中', emoji: '🔄', color: 'bg-cyan-500/20 text-cyan-400' },
  completed: { label: '已完成', emoji: '✅', color: 'bg-green-500/20 text-green-400' },
  delivered: { label: '已送達', emoji: '📦', color: 'bg-purple-500/20 text-purple-400' },
  approved: { label: '已核准', emoji: '👍', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: '需修改', emoji: '↩️', color: 'bg-amber-500/20 text-amber-400' },
  failed: { label: '失敗', emoji: '❌', color: 'bg-red-500/20 text-red-400' },
  cancelled: { label: '已取消', emoji: '🚫', color: 'bg-gray-500/20 text-gray-400' },
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [data, setData] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/detail`);
      if (!res.ok) {
        setError(res.status === 404 ? '找不到此任務' : '載入失敗');
        return;
      }
      setData(await res.json());
    } catch {
      setError('無法連線到伺服器');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">載入中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-400">{error || '載入失敗'}</p>
        <button onClick={() => router.back()} className="btn-secondary">
          返回
        </button>
      </div>
    );
  }

  const { task, media } = data;
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-dark-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <span className={`badge ${statusCfg.color}`}>
            {statusCfg.emoji} {statusCfg.label}
          </span>
        </div>

        {/* Task title */}
        <h1 className="text-xl font-semibold text-white">
          {task.instruction}
        </h1>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-dark-card border border-dark-border p-3">
            <span className="text-gray-500 block text-xs mb-1">建立時間</span>
            <span className="text-gray-300">
              {new Date(task.createdAt).toLocaleString('zh-TW')}
            </span>
          </div>
          {task.completedAt && (
            <div className="rounded-lg bg-dark-card border border-dark-border p-3">
              <span className="text-gray-500 block text-xs mb-1">完成時間</span>
              <span className="text-gray-300">
                {new Date(task.completedAt).toLocaleString('zh-TW')}
              </span>
            </div>
          )}
          <div className="rounded-lg bg-dark-card border border-dark-border p-3">
            <span className="text-gray-500 block text-xs mb-1">優先級</span>
            <span className="text-gray-300">{task.priority}</span>
          </div>
          <div className="rounded-lg bg-dark-card border border-dark-border p-3">
            <span className="text-gray-500 block text-xs mb-1">頻道</span>
            <span className="text-gray-300">{task.channel}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">進度</span>
            <span className="text-white">{task.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-dark-card overflow-hidden">
            <div
              className="h-full rounded-full bg-monster-500 transition-all duration-500"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        {/* Delivery summary */}
        {task.delivery?.summary && (
          <div className="rounded-lg bg-dark-card border border-dark-border p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-2">交付摘要</h2>
            <p className="text-gray-200 whitespace-pre-wrap">{task.delivery.summary}</p>
          </div>
        )}

        {/* Media gallery */}
        {media.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3">附件</h2>
            <MediaGallery media={media} />
          </div>
        )}

        {/* Subtask checklist */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3">子任務</h2>
            <div className="space-y-2">
              {task.subtasks
                .sort((a, b) => a.order - b.order)
                .map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-3 rounded-lg bg-dark-card border border-dark-border p-3"
                  >
                    <span className="text-lg">
                      {st.status === 'completed' ? '✅' : st.status === 'running' ? '🔄' : '⬜'}
                    </span>
                    <span className={st.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-200'}>
                      {st.description}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Review panel */}
        {['completed', 'delivered', 'approved', 'rejected'].includes(task.status) && (
          <ReviewPanel
            taskId={task.id}
            reviewStatus={task.delivery?.reviewStatus}
            reviewComment={task.delivery?.reviewComment}
            reviewedAt={task.delivery?.reviewedAt}
            onReviewed={fetchTask}
          />
        )}
      </div>
    </div>
  );
}
