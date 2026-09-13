import { ApiKeyGuard } from './api-key.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockReflector: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('valid-secret-key'),
    };
    guard = new ApiKeyGuard(mockReflector as Reflector, mockConfigService as ConfigService);
  });

  function createMockContext(headers: Record<string, string>) {
    return {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any;
  }

  it('should allow access if endpoint has @Public() metadata', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(true);
    const ctx = createMockContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access if x-api-key header matches configured key', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({ 'x-api-key': 'valid-secret-key' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException if x-api-key is invalid or missing', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({ 'x-api-key': 'wrong-key' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if API key is not configured on server', () => {
    const unconfiguredGuard = new ApiKeyGuard(
      mockReflector as Reflector,
      { get: jest.fn().mockReturnValue('') } as any as ConfigService,
    );
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({ 'x-api-key': 'any-key' });
    expect(() => unconfiguredGuard.canActivate(ctx)).toThrow('API key is not configured on server');
  });

  it('should allow access with uppercase X-API-KEY header', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({ 'X-API-KEY': 'valid-secret-key' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException if header is completely missing', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if key has different length than configured key', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({ 'x-api-key': 'short' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
