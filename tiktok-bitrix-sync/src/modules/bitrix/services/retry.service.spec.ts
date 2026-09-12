import { RetryService } from './retry.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('RetryService', () => {
  const mockLogger = {
    debug: () => {},
    warn: () => {},
    log: () => {},
    error: () => {},
  } as any as AppLogger;

  const retryService = new RetryService(mockLogger);

  it('should succeed on the first attempt if no error', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const res = await retryService.executeWithRetry(fn);
    expect(res).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient network errors and succeed', async () => {
    const networkError: any = new Error('Connection reset');
    networkError.code = 'ECONNRESET';

    const fn = jest
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('recovered');

    const res = await retryService.executeWithRetry(fn, {
      baseDelayMs: 10,
      maxRetries: 3,
    });

    expect(res).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable 400 Bad Request error', async () => {
    const clientError: any = new Error('Bad Request');
    clientError.response = { status: 400 };

    const fn = jest.fn().mockRejectedValue(clientError);

    await expect(
      retryService.executeWithRetry(fn, { baseDelayMs: 10, maxRetries: 3 }),
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
