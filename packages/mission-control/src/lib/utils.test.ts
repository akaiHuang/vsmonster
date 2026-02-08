import { describe, it, expect } from 'vitest';
import { mapGatewayStatus } from './utils';

describe('mapGatewayStatus', () => {
  it('should map "pending" to "backlog"', () => {
    expect(mapGatewayStatus('pending')).toBe('backlog');
  });

  it('should map "running" to "in_progress"', () => {
    expect(mapGatewayStatus('running')).toBe('in_progress');
  });

  it('should map "completed" to "completed"', () => {
    expect(mapGatewayStatus('completed')).toBe('completed');
  });

  it('should map "delivered" to "completed"', () => {
    expect(mapGatewayStatus('delivered')).toBe('completed');
  });

  it('should map "approved" to "completed"', () => {
    expect(mapGatewayStatus('approved')).toBe('completed');
  });

  it('should map "rejected" to "review"', () => {
    expect(mapGatewayStatus('rejected')).toBe('review');
  });

  it('should map "failed" to "blocked"', () => {
    expect(mapGatewayStatus('failed')).toBe('blocked');
  });

  it('should map "cancelled" to "blocked"', () => {
    expect(mapGatewayStatus('cancelled')).toBe('blocked');
  });

  it('should map unknown statuses to "backlog" (default)', () => {
    expect(mapGatewayStatus('unknown')).toBe('backlog');
    expect(mapGatewayStatus('')).toBe('backlog');
    expect(mapGatewayStatus('some_random_status')).toBe('backlog');
  });
});
