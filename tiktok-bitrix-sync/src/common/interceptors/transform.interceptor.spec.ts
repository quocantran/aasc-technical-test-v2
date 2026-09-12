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
});
