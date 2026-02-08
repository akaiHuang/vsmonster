import { describe, it, expect } from 'vitest';
import { STATUS_EMOJI } from './constants';

describe('STATUS_EMOJI', () => {
  const expectedStatuses = [
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'delivered',
    'approved',
    'rejected',
  ];

  it('should have an emoji for every expected status', () => {
    for (const status of expectedStatuses) {
      expect(STATUS_EMOJI[status]).toBeDefined();
      expect(typeof STATUS_EMOJI[status]).toBe('string');
      expect(STATUS_EMOJI[status].length).toBeGreaterThan(0);
    }
  });

  it('should not have any undefined values', () => {
    for (const [key, value] of Object.entries(STATUS_EMOJI)) {
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('should have exactly the expected number of statuses', () => {
    expect(Object.keys(STATUS_EMOJI)).toHaveLength(expectedStatuses.length);
  });

  it('should map specific statuses to correct emojis', () => {
    expect(STATUS_EMOJI['pending']).toBe('\u23F3');   // hourglass
    expect(STATUS_EMOJI['completed']).toBe('\u2705');  // check mark
    expect(STATUS_EMOJI['failed']).toBe('\u274C');     // cross mark
  });
});
