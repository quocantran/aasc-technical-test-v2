import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();

    const host = this.configService?.get<string>('redis.host') || 'localhost';
    const port = this.configService?.get<number>('redis.port') || 6379;
    const password = this.configService?.get<string>('redis.password') || undefined;
    const db = this.configService?.get<number>('redis.db') || 0;

    this.client = new Redis({
      host,
      port,
      password,
      db,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis client error: ${err.message}`, 'RedisService');
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Initial Redis connection failed: ${err.message}`, 'RedisService');
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis get error for [${key}]: ${err.message}`, 'RedisService');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logger.warn(`Redis set error for [${key}]: ${err.message}`, 'RedisService');
    }
  }

  // Atomically sets key only if it does not exist (NX) with TTL. Returns true if key was set.
  async setNxWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err: any) {
      this.logger.warn(`Redis setNxWithTtl error for [${key}]: ${err.message}`, 'RedisService');
      return false;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis del error for [${key}]: ${err.message}`, 'RedisService');
    }
  }

  // Increment counter with TTL expiration atomically using Lua script to eliminate non-atomic gap
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const luaScript = `
      local current = redis.call('incr', KEYS[1])
      if current == 1 then
        redis.call('expire', KEYS[1], ARGV[1])
      end
      return current
    `;
    try {
      const current = await this.client.eval(luaScript, 1, key, ttlSeconds);
      return Number(current);
    } catch (err: any) {
      this.logger.warn(`Redis incrWithTtl error for [${key}]: ${err.message}`, 'RedisService');
      return 1;
    }
  }

  // Acquires a distributed lock using atomic SET NX PX with unique owner UUID to prevent race conditions
  async acquireLock(key: string, lockValue: string, ttlMs = 5000): Promise<boolean> {
    try {
      const res = await this.client.set(key, lockValue, 'PX', ttlMs, 'NX');
      return res === 'OK';
    } catch (err: any) {
      this.logger.warn(`Redis acquireLock error for [${key}]: ${err.message}`, 'RedisService');
      return true; // Fallback gracefully to allow operation if Redis is temporarily unreachable
    }
  }

  // Releases a distributed lock atomically using Lua script to verify lock ownership before deletion
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    const luaScript = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    try {
      const result = await this.client.eval(luaScript, 1, key, lockValue);
      return result === 1;
    } catch (err: any) {
      this.logger.warn(`Redis releaseLock error for [${key}]: ${err.message}`, 'RedisService');
      return false;
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
