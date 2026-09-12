import { HttpException } from '@nestjs/common';
import { RedisThrottlerGuard } from './redis-throttler.guard';

describe('RedisThrottlerGuard', () => {
  let guard: RedisThrottlerGuard;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      incrWithTtl: jest.fn(),
    };
    guard = new RedisThrottlerGuard(mockRedis);
  });

  function createMockContext(ip = '127.0.0.1', path = '/api/v1/leads') {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ ip, path, headers: {} }),
      }),
    } as any;
  }

  it('should allow request when under rate limit', async () => {
    mockRedis.incrWithTtl.mockResolvedValueOnce(5);
    const ctx = createMockContext();
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should throw 429 Too Many Requests when limit exceeded', async () => {
    mockRedis.incrWithTtl.mockResolvedValueOnce(121);
    const ctx = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });
});
