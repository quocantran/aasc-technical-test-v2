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

  it('should return true if redisService is not provided', async () => {
    const unconfiguredGuard = new RedisThrottlerGuard();
    const ctx = createMockContext();
    const result = await unconfiguredGuard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should fallback to socket.remoteAddress or 127.0.0.1 and req.url when ip/path missing', async () => {
    mockRedis.incrWithTtl.mockResolvedValueOnce(1);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          socket: { remoteAddress: '192.168.1.5' },
          url: '/api/v1/leads/3fa85f64-5717-4562-b3fc-2c963f66afa6',
        }),
      }),
    } as any;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(mockRedis.incrWithTtl).toHaveBeenCalledWith(
      'ratelimit:192.168.1.5:/api/v1/leads/:id',
      60,
    );
  });

  it('should use 1000 limit for webhook endpoints', async () => {
    mockRedis.incrWithTtl.mockResolvedValueOnce(500); // 500 > 120, but < 1000
    const ctx = createMockContext('10.0.0.1', '/webhooks/tiktok/leads');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should normalize numeric route params like /leads/123 to /leads/:id', async () => {
    mockRedis.incrWithTtl.mockResolvedValueOnce(1);
    const ctx = createMockContext('127.0.0.1', '/api/v1/leads/123');
    await guard.canActivate(ctx);
    expect(mockRedis.incrWithTtl).toHaveBeenCalledWith(
      'ratelimit:127.0.0.1:/api/v1/leads/:id',
      60,
    );
  });
});
