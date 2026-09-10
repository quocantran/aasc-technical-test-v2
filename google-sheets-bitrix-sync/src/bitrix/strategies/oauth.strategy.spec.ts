import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { BitrixOAuthStrategy } from './oauth.strategy.js';

// Unit tests for BitrixOAuthStrategy verifying persistent SQLite tokens, mutex coalescing, and renewal
describe('BitrixOAuthStrategy', () => {
  let strategy: BitrixOAuthStrategy;
  let mockConfig: any;
  let mockRepo: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockConfig = {
      get: vi.fn((key: string) => {
        const conf: Record<string, string> = {
          'bitrix.oauth.clientId': 'client-123',
          'bitrix.oauth.clientSecret': 'secret-456',
          'bitrix.oauth.portalDomain': 'test.bitrix24.vn',
        };
        return conf[key] || null;
      }),
    };

    mockRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((dto: any) => ({ ...dto })),
      save: vi.fn((dto: any) => Promise.resolve({ id: 1, ...dto })),
    };

    strategy = new BitrixOAuthStrategy(mockConfig, mockRepo);
  });

  it('should construct correct REST endpoint', () => {
    const endpoint = strategy.getEndpoint('crm.lead.add');
    expect(endpoint).toBe('https://test.bitrix24.vn/rest/crm.lead.add.json');
  });

  it('should correctly identify expired tokens using 5-minute safety buffer', () => {
    const now = Date.now();

    // Expired in the past
    expect(strategy.isTokenExpired({ expiresAt: now - 1000 } as any)).toBe(true);

    // Expiring within 4 minutes (less than 5-minute buffer)
    expect(strategy.isTokenExpired({ expiresAt: now + 4 * 60 * 1000 } as any)).toBe(true);

    // Valid for 30 minutes (well outside buffer)
    expect(strategy.isTokenExpired({ expiresAt: now + 30 * 60 * 1000 } as any)).toBe(false);
  });

  it('should coalesce concurrent refresh calls onto a Single-Flight Mutex', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 1,
      domain: 'test.bitrix24.vn',
      accessToken: 'old-token',
      refreshToken: 'existing-refresh',
      expiresAt: Date.now() - 1000,
    });

    const axiosGetSpy = vi.spyOn(axios, 'get').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        data: {
          access_token: 'new-coalesced-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        },
      } as any;
    });

    const [t1, t2, t3] = await Promise.all([
      strategy.refreshToken(),
      strategy.refreshToken(),
      strategy.refreshToken(),
    ]);

    expect(t1.accessToken).toBe('new-coalesced-token');
    expect(t2.accessToken).toBe('new-coalesced-token');
    expect(t3.accessToken).toBe('new-coalesced-token');
    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('should pass double-check and skip external refresh if DB has fresh token', async () => {
    const freshDbToken = {
      id: 1,
      domain: 'test.bitrix24.vn',
      accessToken: 'fresh-db-token',
      refreshToken: 'fresh-db-refresh',
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    mockRepo.findOne.mockResolvedValue(freshDbToken);
    const axiosGetSpy = vi.spyOn(axios, 'get');

    const token = await strategy.refreshToken();

    expect(token.accessToken).toBe('fresh-db-token');
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });
});
