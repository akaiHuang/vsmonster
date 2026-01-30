'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useMissionStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewTaskModal({ isOpen, onClose }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const { addTask } = useMissionStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;

    addTask({
      title: title.trim(),
      description: title.trim(),
      status: 'backlog',
      category: 'Other',
    });

    setTitle('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-border">
              <h2 className="text-lg font-semibold">New Task</h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-dark-hover rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    描述你的需求或任務，Clawdbot 會自動分析並派發給工作者
                  </label>
                  <textarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Create a 'Hello world' page first"
                    className="textarea w-full h-32"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Task
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
