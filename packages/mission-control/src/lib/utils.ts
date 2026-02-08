import type { TaskStatus } from './store';

/** Map Gateway task status to kanban column */
export function mapGatewayStatus(status: string): TaskStatus {
  switch (status) {
    case 'pending': return 'backlog';
    case 'running': return 'in_progress';
    case 'completed':
    case 'delivered':
    case 'approved': return 'completed';
    case 'rejected': return 'review';
    case 'failed':
    case 'cancelled': return 'blocked';
    default: return 'backlog';
  }
}
