import { describe, it, expect } from 'vitest';
import { isValidTaskId } from './manager';

describe('isValidTaskId', () => {
  it('should accept valid alphanumeric IDs', () => {
    expect(isValidTaskId('task-abc-123')).toBe(true);
    expect(isValidTaskId('abc')).toBe(true);
    expect(isValidTaskId('123')).toBe(true);
    expect(isValidTaskId('a')).toBe(true);
    expect(isValidTaskId('task-lz1abc-9f3e2d1a')).toBe(true);
  });

  it('should accept IDs with hyphens', () => {
    expect(isValidTaskId('task-123')).toBe(true);
    expect(isValidTaskId('a-b-c')).toBe(true);
    expect(isValidTaskId('-leading-hyphen')).toBe(true);
    expect(isValidTaskId('trailing-hyphen-')).toBe(true);
  });

  it('should reject empty strings', () => {
    expect(isValidTaskId('')).toBe(false);
  });

  it('should reject IDs longer than 100 characters', () => {
    const longId = 'a'.repeat(100);
    expect(isValidTaskId(longId)).toBe(true); // exactly 100 is OK
    expect(isValidTaskId(longId + 'a')).toBe(false); // 101 is too long
  });

  it('should reject IDs with special characters', () => {
    expect(isValidTaskId('task@123')).toBe(false);
    expect(isValidTaskId('task 123')).toBe(false);
    expect(isValidTaskId('task/123')).toBe(false);
    expect(isValidTaskId('task.123')).toBe(false);
    expect(isValidTaskId('task_123')).toBe(false);
    expect(isValidTaskId('task!123')).toBe(false);
  });

  it('should reject path traversal attempts', () => {
    expect(isValidTaskId('../etc/passwd')).toBe(false);
    expect(isValidTaskId('../../secret')).toBe(false);
    expect(isValidTaskId('task/../hack')).toBe(false);
  });

  it('should reject non-string inputs', () => {
    // TypeScript prevents these, but runtime safety matters
    expect(isValidTaskId(null as any)).toBe(false);
    expect(isValidTaskId(undefined as any)).toBe(false);
    expect(isValidTaskId(123 as any)).toBe(false);
    expect(isValidTaskId({} as any)).toBe(false);
  });
});
