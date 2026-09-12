import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class RedisThrottlerGuard implements CanActivate {
  private readonly logger: AppLogger;
  private readonly windowSeconds = 60;
  private readonly maxRequestsPerWindow = 120; // 120 req/min default

  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.redisService) return true;

    const req = context.switchToHttp().getRequest();
    // Strictly rely on Express req.ip (validated via 'trust proxy' in main.ts) or socket address to prevent X-Forwarded-For spoofing
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const rawPath = req.path || req.url || '';
    // Normalize dynamic path parameters (:id, UUIDs) so each route template shares rate limits
    const normalizedPath = rawPath
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
      .replace(/\/\d+/g, '/:id');
    const key = `ratelimit:${ip}:${normalizedPath}`;

    const isWebhook = rawPath.includes('/webhooks/');
    const limit = isWebhook ? 1000 : this.maxRequestsPerWindow;

    const currentCount = await this.redisService.incrWithTtl(key, this.windowSeconds);
    if (currentCount > limit) {
      this.logger.warn(`Rate limit exceeded for IP [${ip}] on path [${normalizedPath}] (limit: ${limit})`, 'RedisThrottlerGuard');
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Rate limit exceeded (max ${limit} req/min).`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
