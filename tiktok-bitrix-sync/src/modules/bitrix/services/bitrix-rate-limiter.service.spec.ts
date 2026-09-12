import { BitrixRateLimiterService } from './bitrix-rate-limiter.service';
import { ConfigService } from '@nestjs/config';

describe('BitrixRateLimiterService', () => {
  it('should execute tasks sequentially respecting rate limit delay', async () => {
    const mockConfig = {
      get: jest.fn().mockReturnValue(10), // 10 rps -> 100ms interval
    } as any as ConfigService;

    const limiter = new BitrixRateLimiterService(mockConfig);

    const start = Date.now();
    const p1 = limiter.acquire(async () => 'task1');
    const p2 = limiter.acquire(async () => 'task2');

    const [r1, r2] = await Promise.all([p1, p2]);
    const duration = Date.now() - start;

    expect(r1).toBe('task1');
    expect(r2).toBe('task2');
    expect(duration).toBeGreaterThanOrEqual(90); // ~100ms interval
  });
});
