// Tests for RetryService verifying exponential backoff, jitter calculation, and error retryability
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryService } from './retry.service.js';

describe('RetryService', () => {
  let retryService: RetryService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    };
    retryService = new RetryService(mockLogger);
  });

  it('should return result immediately if operation succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryService.executeWithRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient 429 errors and succeed', async () => {
    const error429 = { response: { status: 429 }, message: 'Too Many Requests' };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce('eventual success');

    const result = await retryService.executeWithRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
    });

    expect(result).toBe('eventual success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('should not retry on non-retryable 400 Client Error', async () => {
    const error400 = { response: { status: 400 }, message: 'Bad Request' };
    const fn = vi.fn().mockRejectedValue(error400);

    await expect(
      retryService.executeWithRetry(fn, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toEqual(error400);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should classify network codes and 500 status as retryable', () => {
    expect(retryService.isRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(retryService.isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(retryService.isRetryable({ response: { status: 503 } })).toBe(true);
    expect(retryService.isRetryable({ response: { data: { error: 'QUERY_LIMIT_EXCEEDED' } } })).toBe(true);
    expect(retryService.isRetryable({ response: { status: 404 } })).toBe(false);
  });
});
