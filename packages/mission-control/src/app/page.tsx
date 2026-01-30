'use client';

import { Header } from '@/components/layout/Header';
import { StatsBar } from '@/components/dashboard/StatsBar';
import { ActionBar } from '@/components/dashboard/ActionBar';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { NewTaskModal } from '@/components/modals/NewTaskModal';
import { useState } from 'react';

export default function HomePage() {
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Stats Overview */}
        <StatsBar />
        
        {/* Action Buttons */}
        <ActionBar onNewTask={() => setIsNewTaskModalOpen(true)} />
        
        {/* Kanban Board */}
        <KanbanBoard />
      </main>

      {/* Modals */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
      />
    </div>
  );
}
