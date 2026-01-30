'use client';

import { useMissionStore } from '@/lib/store';

export function StatsBar() {
  const { tasks, workers } = useMissionStore();
  
  const thisWeek = tasks.filter(t => {
    const created = new Date(t.createdAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return created > weekAgo;
  }).length;
  
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const activeWorkers = workers.filter(w => w.status === 'connected').length;

  return (
    <div className="flex items-center gap-6 py-4 text-sm">
      <StatItem value={thisWeek} label="This week" />
      <StatItem value={inProgress} label="In progress" highlight />
      <StatItem value={total} label="Total" />
      <StatItem 
        value={`${completionRate}%`} 
        label="Completion" 
        valueColor={completionRate > 50 ? 'text-green-400' : 'text-amber-400'}
      />
      <div className="h-6 w-px bg-dark-border" />
      <StatItem 
        value={activeWorkers} 
        label="Workers active" 
        valueColor={activeWorkers > 0 ? 'text-cyan-400' : 'text-gray-500'}
      />
    </div>
  );
}

interface StatItemProps {
  value: string | number;
  label: string;
  highlight?: boolean;
  valueColor?: string;
}

function StatItem({ value, label, highlight, valueColor }: StatItemProps) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-2xl font-bold ${valueColor || (highlight ? 'text-white' : 'text-gray-400')}`}>
        {value}
      </span>
      <span className="text-gray-500">{label}</span>
    </div>
  );
}
