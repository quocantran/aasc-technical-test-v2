import { BitrixWebhookGuard } from './bitrix-webhook.guard';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('BitrixWebhookGuard', () => {
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: (key: string) => {
        if (key === 'bitrix.inboundWebhookSecret') return 'valid-secret-token-123';
        return undefined;
      },
    };
  });

  const createMockContext = (body: any, authHeader?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        body,
        headers: { authorization: authHeader },
      }),
    }),
  } as any);

  it('should allow valid application token in auth object', () => {
    const guard = new BitrixWebhookGuard(mockConfigService as ConfigService);
    const ctx = createMockContext({
      event: 'ONCRMDEALUPDATE',
      auth: { application_token: 'valid-secret-token-123' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow valid token in authorization header', () => {
    const guard = new BitrixWebhookGuard(mockConfigService as ConfigService);
    const ctx = createMockContext({ event: 'ONCRMDEALUPDATE' }, 'Bearer valid-secret-token-123');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject missing token with UnauthorizedException', () => {
    const guard = new BitrixWebhookGuard(mockConfigService as ConfigService);
    const ctx = createMockContext({ event: 'ONCRMDEALUPDATE' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject invalid token with UnauthorizedException', () => {
    const guard = new BitrixWebhookGuard(mockConfigService as ConfigService);
    const ctx = createMockContext({
      event: 'ONCRMDEALUPDATE',
      auth: { application_token: 'wrong-token' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw InternalServerErrorException if secret is not configured (fail-closed)', () => {
    const emptyConfig = { get: () => '' } as any;
    delete process.env.BITRIX_INBOUND_WEBHOOK_SECRET;
    const guard = new BitrixWebhookGuard(emptyConfig);
    const ctx = createMockContext({ auth: { application_token: 'any' } });
    expect(() => guard.canActivate(ctx)).toThrow(InternalServerErrorException);
  });
});
