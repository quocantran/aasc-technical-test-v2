import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BITRIX_CONSTANTS } from '../constants/bitrix-api.constants.js';

// Throttles outbound calls to enforce Bitrix24 rate limits
@Injectable()
export class BitrixRateLimiterService {
  private lastRequestTime = 0;
  private queue: Promise<any> = Promise.resolve();
  private readonly minIntervalMs: number;

  constructor(private readonly configService: ConfigService) {
    const rps = this.configService.get<number>('bitrix.rateLimitRps') || BITRIX_CONSTANTS.MAX_REQUESTS_PER_SECOND;
    this.minIntervalMs = Math.ceil(1000 / Math.max(1, rps));
  }

  // Queues an operation and delays execution until rate limit interval has elapsed
  async acquire<T>(operation: () => Promise<T>): Promise<T> {
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

    // Continues queue execution even if current task rejects
    this.queue = resultPromise.catch(() => {});
    return resultPromise;
  }
}
