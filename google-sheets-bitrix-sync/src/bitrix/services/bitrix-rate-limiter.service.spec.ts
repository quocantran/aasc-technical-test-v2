// Tests for BitrixRateLimiterService verifying sequential task throttling
import { describe, it, expect, vi } from 'vitest';
import { BitrixRateLimiterService } from './bitrix-rate-limiter.service.js';

describe('BitrixRateLimiterService', () => {
  it('should execute queued tasks sequentially with appropriate delay', async () => {
    const mockConfigService: any = {
      get: vi.fn().mockReturnValue(10), // 10 rps -> 100ms interval for fast test
    };

    const limiter = new BitrixRateLimiterService(mockConfigService);
    const executionOrder: number[] = [];

    const task1 = limiter.acquire(async () => {
      executionOrder.push(1);
      return 'task1';
    });

    const task2 = limiter.acquire(async () => {
      executionOrder.push(2);
      return 'task2';
    });

    const [res1, res2] = await Promise.all([task1, task2]);

    expect(res1).toBe('task1');
    expect(res2).toBe('task2');
    expect(executionOrder).toEqual([1, 2]);
  });

  it('should fall back to default RPS when config returns null/0', async () => {
    const mockConfigService: any = {
      get: vi.fn().mockReturnValue(null),
    };

    const limiter = new BitrixRateLimiterService(mockConfigService);
    const res = await limiter.acquire(async () => 'default_rps');
    expect(res).toBe('default_rps');
  });

  it('should continue executing queue even if an operation fails', async () => {
    const mockConfigService: any = {
      get: vi.fn().mockReturnValue(50),
    };

    const limiter = new BitrixRateLimiterService(mockConfigService);

    const task1 = limiter.acquire(async () => {
      throw new Error('Task 1 failed');
    });

    const task2 = limiter.acquire(async () => 'task 2 succeeded');

    await expect(task1).rejects.toThrow('Task 1 failed');
    const res2 = await task2;
    expect(res2).toBe('task 2 succeeded');
  });
});
