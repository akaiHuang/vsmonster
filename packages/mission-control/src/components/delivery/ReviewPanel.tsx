'use client';

import { useState } from 'react';

interface ReviewPanelProps {
  taskId: string;
  reviewStatus?: 'approved' | 'rejected';
  reviewComment?: string;
  reviewedAt?: string;
  onReviewed?: () => void;
}

export function ReviewPanel({
  taskId,
  reviewStatus,
  reviewComment,
  reviewedAt,
  onReviewed,
}: ReviewPanelProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReview = async (approved: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comment: comment || undefined }),
      });
      if (res.ok) {
        onReviewed?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Already reviewed — show read-only summary
  if (reviewStatus) {
    return (
      <div className="rounded-lg border border-dark-border p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{reviewStatus === 'approved' ? '👍' : '↩️'}</span>
          <span className="font-medium text-white">
            {reviewStatus === 'approved' ? '已核准' : '需要修改'}
          </span>
          {reviewedAt && (
            <span className="text-xs text-gray-500 ml-auto">
              {new Date(reviewedAt).toLocaleString('zh-TW')}
            </span>
          )}
        </div>
        {reviewComment && (
          <p className="text-sm text-gray-400">{reviewComment}</p>
        )}
      </div>
    );
  }

  // Pending review — show form
  return (
    <div className="rounded-lg border border-dark-border p-4 space-y-3">
      <h3 className="font-medium text-white">審核任務</h3>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="備註 (選填)"
        className="textarea w-full"
        rows={3}
      />
      <div className="flex gap-3">
        <button
          onClick={() => handleReview(true)}
          disabled={submitting}
          className="flex-1 min-h-[48px] bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          核准
        </button>
        <button
          onClick={() => handleReview(false)}
          disabled={submitting}
          className="flex-1 min-h-[48px] border border-red-500 text-red-400 hover:bg-red-500/10 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          退回
        </button>
      </div>
    </div>
  );
}
