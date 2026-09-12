import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BITRIX_CONSTANTS } from '../constants/bitrix-api.constants';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class BitrixRateLimiterService {
  private lastRequestTime = 0;
  private queue: Promise<any> = Promise.resolve();
  private readonly minIntervalMs: number;
  private readonly maxRps: number;

  constructor(
    private readonly configService?: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.maxRps =
      this.configService?.get<number>('bitrix.rateLimitRps') ||
      BITRIX_CONSTANTS.MAX_REQUESTS_PER_SECOND;
    this.minIntervalMs = Math.ceil(1000 / Math.max(1, this.maxRps));
  }

  async acquire<T>(operation: () => Promise<T>): Promise<T> {
    // Distributed cluster-wide rate limiter via Redis sliding window
    if (this.redisService) {
      let acquired = false;
      while (!acquired) {
        const currentSec = Math.floor(Date.now() / 1000);
        const key = `bitrix:ratelimit:${currentSec}`;
        const count = await this.redisService.incrWithTtl(key, 2);
        if (count <= this.maxRps) {
          acquired = true;
          break;
        }
        // Jittered wait until the next second starts
        const delay = 1000 - (Date.now() % 1000) + Math.floor(Math.random() * 20);
        await new Promise((r) => setTimeout(r, delay));
      }
      return operation();
    }

    // Local in-memory queue fallback for isolated unit testing
    const resultPromise = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minIntervalMs) {
        const waitMs = this.minIntervalMs - timeSinceLast;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastRequestTime = Date.now();
      return operation();
    });

    this.queue = resultPromise.catch(() => {});
    return resultPromise;
  }
}
