// Unit tests for LockService verifying mutex concurrency locking and auto-release TTL

import { describe, it, expect, vi } from 'vitest';
import { LockService } from './lock.service.js';

describe('LockService', () => {
  it('should allow acquiring lock once and reject concurrent acquire', () => {
    const lockService = new LockService();
    expect(lockService.acquire('test_key', 5000)).toBe(true);
    expect(lockService.isLocked('test_key')).toBe(true);
    expect(lockService.acquire('test_key', 5000)).toBe(false);

    lockService.release('test_key');
    expect(lockService.isLocked('test_key')).toBe(false);
    expect(lockService.acquire('test_key', 5000)).toBe(true);
  });

  it('should auto-expire lock when TTL has passed', () => {
    vi.useFakeTimers();
    const lockService = new LockService();

    expect(lockService.acquire('ttl_key', 1000)).toBe(true);
    expect(lockService.isLocked('ttl_key')).toBe(true);

    vi.advanceTimersByTime(1500);

    expect(lockService.isLocked('ttl_key')).toBe(false);
    expect(lockService.acquire('ttl_key', 1000)).toBe(true);

    vi.useRealTimers();
  });
});
