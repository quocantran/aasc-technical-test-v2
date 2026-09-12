import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { AppLogger } from '../logger/app-logger.service';

describe('LoggingInterceptor', () => {
  it('should log request duration on completion without metricsService', (done) => {
    const mockLogger = { log: jest.fn() } as any as AppLogger;
    const interceptor = new LoggingInterceptor(mockLogger);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/api/v1/leads', ip: '127.0.0.1' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as any;

    const next = { handle: () => of('done') };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('[POST] /api/v1/leads'),
          'HTTP',
        );
        done();
      },
    });
  });

  it('should record metrics on success when metricsService is provided', (done) => {
    const mockMetricsService = {
      httpRequestsTotal: { inc: jest.fn() },
      httpRequestDurationSeconds: { observe: jest.fn() },
    } as any;

    const interceptor = new LoggingInterceptor(undefined, mockMetricsService);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/api/v1/health', route: { path: '/api/v1/health' }, ip: '127.0.0.1' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as any;

    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith({
          method: 'GET',
          route: '/api/v1/health',
          status_code: '200',
        });
        expect(mockMetricsService.httpRequestDurationSeconds.observe).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record metrics on error when metricsService is provided', (done) => {
    const mockMetricsService = {
      httpRequestsTotal: { inc: jest.fn() },
      httpRequestDurationSeconds: { observe: jest.fn() },
    } as any;

    const interceptor = new LoggingInterceptor(undefined, mockMetricsService);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/webhooks/tiktok/leads', ip: '127.0.0.1' }),
        getResponse: () => ({ statusCode: 500 }),
      }),
    } as any;

    const errorObj = { status: 401 };
    const next = { handle: () => throwError(() => errorObj) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith({
          method: 'POST',
          route: '/webhooks/tiktok/leads',
          status_code: '401',
        });
        expect(mockMetricsService.httpRequestDurationSeconds.observe).toHaveBeenCalled();
        done();
      },
    });
  });
});
