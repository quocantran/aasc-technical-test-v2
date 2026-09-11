import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleOAuthStrategy } from './oauth.strategy.js';

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
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((dto: any) => ({ ...dto })),
      save: vi.fn((dto: any) => Promise.resolve({ id: 1, ...dto })),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    strategy = new GoogleOAuthStrategy(mockConfig, mockRepo);
  });

  it('should generate valid Google consent URL with spreadsheet scope', () => {
    const url = strategy.generateAuthUrl();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('client-google-123');
    expect(url).toContain('spreadsheets');
  });

  it('should restore credentials from SQLite database if available on onModuleInit', async () => {
    const savedToken = {
      id: 1,
      identifier: 'default',
      accessToken: 'db-google-access',
      refreshToken: 'db-google-refresh',
      expiresAt: Date.now() + 3600 * 1000,
    };
    mockRepo.findOne.mockResolvedValue(savedToken);

    await strategy.onModuleInit();
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { identifier: 'default' } });
  });

  it('should proactively refresh access token during restoreTokensFromDb if near expiry', async () => {
    const savedToken = {
      id: 1,
      identifier: 'default',
      accessToken: 'old-access',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 1000, // expired
    };
    mockRepo.findOne.mockResolvedValue(savedToken);

    const client = (strategy as any).oauth2Client;
    client.getAccessToken = vi.fn().mockResolvedValue({ token: 'new-proactive-access' });

    await (strategy as any).restoreTokensFromDb();
    expect(client.getAccessToken).toHaveBeenCalled();
  });

  it('should handle proactive refresh error during restoreTokensFromDb gracefully', async () => {
    const savedToken = {
      id: 1,
      identifier: 'default',
      accessToken: 'old-access',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 1000,
    };
    mockRepo.findOne.mockResolvedValue(savedToken);

    const client = (strategy as any).oauth2Client;
    client.getAccessToken = vi.fn().mockRejectedValue(new Error('Refresh failed'));

    const res = await (strategy as any).restoreTokensFromDb();
    expect(res).toBe(true);
  });

  it('should return false if tokenRepo is not provided in restoreTokensFromDb', async () => {
    const noRepoStrategy = new GoogleOAuthStrategy(mockConfig, undefined);
    const restored = await (noRepoStrategy as any).restoreTokensFromDb();
    expect(restored).toBe(false);
  });

  it('should return false and log warning if restoreTokensFromDb throws error', async () => {
    mockRepo.findOne.mockRejectedValue(new Error('DB read error'));
    const restored = await (strategy as any).restoreTokensFromDb();
    expect(restored).toBe(false);
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

  it('should setTokens and trigger persistence', async () => {
    const tokens = {
      access_token: 'manual-access',
      refresh_token: 'manual-refresh',
    };
    strategy.setTokens(tokens);
    await (strategy as any).persistLock;
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('should check hasValidTokens correctly', async () => {
    // Initially empty
    mockRepo.findOne.mockResolvedValue(null);
    expect(await strategy.hasValidTokens()).toBe(false);

    // After credentials set
    (strategy as any).oauth2Client.setCredentials({ access_token: 'test-token' });
    expect(await strategy.hasValidTokens()).toBe(true);
  });

  it('should throw error in getAuthClient if no tokens exist', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    (strategy as any).oauth2Client.setCredentials({});

    await expect(strategy.getAuthClient()).rejects.toThrow('Google OAuth 2.0 chưa được cấp quyền truy cập');
  });

  it('should proactively refresh in getAuthClient if token is near expiry', async () => {
    (strategy as any).oauth2Client.setCredentials({
      access_token: 'expiring-access',
      refresh_token: 'refresh-token',
      expiry_date: Date.now() + 10000, // < 60s
    });

    const client = (strategy as any).oauth2Client;
    client.getAccessToken = vi.fn().mockResolvedValue({ token: 'refreshed-token' });

    const authClient = await strategy.getAuthClient();
    expect(authClient).toBeDefined();
    expect(client.getAccessToken).toHaveBeenCalled();
  });

  it('should handle token refresh failure in getAuthClient gracefully', async () => {
    (strategy as any).oauth2Client.setCredentials({
      access_token: 'expiring-access',
      refresh_token: 'refresh-token',
      expiry_date: Date.now() + 10000,
    });

    const client = (strategy as any).oauth2Client;
    client.getAccessToken = vi.fn().mockRejectedValue(new Error('Network drop'));

    const authClient = await strategy.getAuthClient();
    expect(authClient).toBeDefined();
  });

  it('should getSheetsClient and cache it', async () => {
    (strategy as any).oauth2Client.setCredentials({ access_token: 'valid' });

    const sheets1 = await strategy.getSheetsClient();
    expect(sheets1).toBeDefined();

    const sheets2 = await strategy.getSheetsClient();
    expect(sheets2).toBe(sheets1);
  });

  it('should update existing token in doPersistTokens preserving refresh_token', async () => {
    const existing = {
      id: 1,
      identifier: 'default',
      accessToken: 'old-access',
      refreshToken: 'keep-refresh',
      expiresAt: 1234567,
      scope: 'test-scope',
    };
    mockRepo.findOne.mockResolvedValue(existing);

    await (strategy as any).doPersistTokens({
      access_token: 'updated-access',
      expiry_date: 2345678,
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'updated-access',
        refreshToken: 'keep-refresh',
      }),
    );
  });

  it('should return early in doPersistTokens if no tokens provided', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await (strategy as any).doPersistTokens({});
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('should fallback to update query if save throws in doPersistTokens', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.save.mockRejectedValue(new Error('Collision insert error'));

    await (strategy as any).doPersistTokens({
      access_token: 'fallback-access',
      refresh_token: 'fallback-refresh',
      expiry_date: 999999,
      scope: 'test',
    });

    expect(mockRepo.update).toHaveBeenCalledWith(
      { identifier: 'default' },
      expect.objectContaining({ accessToken: 'fallback-access' }),
    );
  });

  it('should handle error if update fallback also fails in doPersistTokens', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.save.mockRejectedValue(new Error('Collision insert error'));
    mockRepo.update.mockRejectedValue(new Error('Fatal DB crash'));

    await expect(
      (strategy as any).doPersistTokens({
        access_token: 'fallback-access',
      }),
    ).resolves.not.toThrow();
  });

  it('should trigger persistTokens on client tokens event', async () => {
    const client = (strategy as any).oauth2Client;
    client.emit('tokens', { access_token: 'auto-refreshed' });
    await (strategy as any).persistLock;
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
