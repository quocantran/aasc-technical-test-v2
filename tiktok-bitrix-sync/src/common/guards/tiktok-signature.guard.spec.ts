import * as crypto from 'crypto';
import { TikTokSignatureGuard } from './tiktok-signature.guard';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/app-logger.service';
import { UnauthorizedException } from '@nestjs/common';

describe('TikTokSignatureGuard', () => {
  let guard: TikTokSignatureGuard;
  const secretToken = 'secret-test-token-123';

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn().mockReturnValue(secretToken),
    } as any as ConfigService;

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    guard = new TikTokSignatureGuard(mockConfig, mockLogger);
  });

  function createMockContext(headers: Record<string, string>, body: any, rawBody?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          rawBody: rawBody || JSON.stringify(body),
        }),
      }),
    } as any;
  }

  it('should accept valid HMAC-SHA256 signature', () => {
    const body = { event: 'lead.generate', event_id: 'evt_1' };
    const raw = JSON.stringify(body);
    const validSignature = crypto.createHmac('sha256', secretToken).update(raw).digest('hex');

    const ctx = createMockContext({ 'tiktok-signature': validSignature }, body, raw);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject invalid HMAC-SHA256 signature', () => {
    const body = { event: 'lead.generate' };
    const ctx = createMockContext({ 'tiktok-signature': 'invalid-sig' }, body);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject missing signature header', () => {
    const body = { event: 'lead.generate' };
    const ctx = createMockContext({}, body);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw InternalServerErrorException if secretToken is not configured on server', () => {
    const unconfiguredGuard = new TikTokSignatureGuard(
      { get: jest.fn().mockReturnValue('') } as any as ConfigService,
      { error: () => {} } as any as AppLogger,
    );
    const ctx = createMockContext({ 'tiktok-signature': 'sig' }, { a: 1 });
    expect(() => unconfiguredGuard.canActivate(ctx)).toThrow('Server misconfiguration');
  });

  it('should accept valid signature via x-tiktok-signature header and Buffer rawBody', () => {
    const body = { event: 'lead.generate' };
    const rawBuffer = Buffer.from(JSON.stringify(body));
    const validSignature = crypto.createHmac('sha256', secretToken).update(rawBuffer).digest('hex');

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-tiktok-signature': validSignature },
          rawBody: rawBuffer,
          body,
        }),
      }),
    } as any;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should handle typeof request.body === "string" when rawBody is undefined', () => {
    const rawString = JSON.stringify({ event: 'lead.generate' });
    const validSignature = crypto.createHmac('sha256', secretToken).update(Buffer.from(rawString)).digest('hex');

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'tiktok-signature': validSignature },
          rawBody: undefined,
          body: rawString,
        }),
      }),
    } as any;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw InternalServerErrorException if rawBody and string body are both missing', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'tiktok-signature': 'sig' },
          rawBody: undefined,
          body: { object: 'not-string' },
        }),
      }),
    } as any;

    expect(() => guard.canActivate(ctx)).toThrow('Raw body buffer is required');
  });
});
