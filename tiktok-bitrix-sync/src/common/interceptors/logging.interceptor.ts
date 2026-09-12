import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '../logger/app-logger.service';
import { MetricsService } from '../../modules/metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly logger?: AppLogger,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest();

    const { method, url, ip } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - now;
          const res = httpCtx.getResponse();
          const statusCode = String(res?.statusCode || 200);
          this.logger?.log(`[${method}] ${url} - ${durationMs}ms (IP: ${ip})`, 'HTTP');

          if (this.metricsService) {
            const route = req.route?.path || url.split('?')[0];
            this.metricsService.httpRequestsTotal.inc({ method, route, status_code: statusCode });
            this.metricsService.httpRequestDurationSeconds.observe(
              { method, route, status_code: statusCode },
              durationMs / 1000,
            );
          }
        },
        error: (err) => {
          const durationMs = Date.now() - now;
          const statusCode = String(err?.status || err?.statusCode || 500);

          if (this.metricsService) {
            const route = req.route?.path || url.split('?')[0];
            this.metricsService.httpRequestsTotal.inc({ method, route, status_code: statusCode });
            this.metricsService.httpRequestDurationSeconds.observe(
              { method, route, status_code: statusCode },
              durationMs / 1000,
            );
          }
        },
      }),
    );
  }
}

