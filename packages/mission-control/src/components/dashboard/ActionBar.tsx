'use client';

import { Plus, Bot, FolderOpen } from 'lucide-react';

interface ActionBarProps {
  onNewTask: () => void;
}

export function ActionBar({ onNewTask }: ActionBarProps) {
  return (
    <div className="flex items-center gap-3 py-4">
      <button
        onClick={onNewTask}
        className="btn-primary flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        <span>New task</span>
      </button>
      
      <button className="btn-secondary flex items-center gap-2">
        <Bot className="w-4 h-4" />
        <span>Workers</span>
      </button>
      
      <button className="btn-secondary flex items-center gap-2">
        <FolderOpen className="w-4 h-4" />
        <span>Activity</span>
      </button>
    </div>
  );
}
