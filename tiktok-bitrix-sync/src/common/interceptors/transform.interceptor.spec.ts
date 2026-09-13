import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  it('should wrap response in standard API envelope', async () => {
    const interceptor = new TransformInterceptor();

    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ getHeader: () => undefined }),
      }),
    } as any;

    const callHandler = {
      handle: () => of({ test: 'data' }),
    };

    const result$ = interceptor.intercept(context, callHandler);

    result$.subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ test: 'data' });
      expect(res.timestamp).toBeDefined();
    });
  });

  it('should pass through raw data for text/csv response', (done) => {
    const interceptor = new TransformInterceptor();

    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ getHeader: () => 'text/csv; charset=utf-8' }),
      }),
    } as any;

    const callHandler = {
      handle: () => of('ID,Name\n1,Test'),
    };

    const result$ = interceptor.intercept(context, callHandler);
    result$.subscribe((res) => {
      expect(res).toBe('ID,Name\n1,Test');
      done();
    });
  });

  it('should wrap response when res does not have getHeader function', (done) => {
    const interceptor = new TransformInterceptor();

    const context = {
      switchToHttp: () => ({
        getResponse: () => null,
      }),
    } as any;

    const callHandler = {
      handle: () => of({ fallback: true }),
    };

    const result$ = interceptor.intercept(context, callHandler);
    result$.subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ fallback: true });
      done();
    });
  });
});
