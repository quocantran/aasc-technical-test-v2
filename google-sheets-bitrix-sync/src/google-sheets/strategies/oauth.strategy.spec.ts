import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleOAuthStrategy } from './oauth.strategy.js';

// Unit tests for GoogleOAuthStrategy validating persistent token handling and client initialization
describe('GoogleOAuthStrategy', () => {
  let strategy: GoogleOAuthStrategy;
  let mockConfig: any;
  let mockRepo: any;

  beforeEach(() => {
    mockConfig = {
      get: vi.fn((key: string) => {
        const conf: Record<string, string> = {
          'googleSheets.oauth.clientId': 'client-google-123',
          'googleSheets.oauth.clientSecret': 'client-google-secret',
          'googleSheets.oauth.redirectUri': 'https://app.test/google/callback',
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

    strategy = new GoogleOAuthStrategy(mockConfig, mockRepo);
  });

  it('should generate valid Google consent URL with spreadsheet scope', () => {
    const url = strategy.generateAuthUrl();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('client-google-123');
    expect(url).toContain('spreadsheets');
  });

  it('should restore credentials from SQLite database if available', async () => {
    const savedToken = {
      id: 1,
      identifier: 'default',
      accessToken: 'db-google-access',
      refreshToken: 'db-google-refresh',
      expiresAt: Date.now() + 3600 * 1000,
    };
    mockRepo.findOne.mockResolvedValue(savedToken);

    const client = await strategy.getAuthClient();
    expect(client).toBeDefined();
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { identifier: 'default' } });
  });

  it('should exchange code for tokens and persist them to SQLite', async () => {
    const mockTokens = {
      access_token: 'new-google-access',
      refresh_token: 'new-google-refresh',
      expiry_date: Date.now() + 3600 * 1000,
    };
    (strategy as any).oauth2Client.getToken = vi.fn().mockResolvedValue({ tokens: mockTokens });

    const result = await strategy.getTokensFromCode('test-auth-code');

    expect(result).toEqual(mockTokens);
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
