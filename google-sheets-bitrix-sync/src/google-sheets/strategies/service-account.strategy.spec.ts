import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceAccountStrategy } from './service-account.strategy.js';
import fs from 'fs';

const mockGoogleAuthConstructor = vi.fn();
const mockJWTConstructor = vi.fn();

vi.mock('fs');
vi.mock('googleapis', () => {
  class MockGoogleAuth {
    getClient = vi.fn();
    constructor(opts: any) {
      mockGoogleAuthConstructor(opts);
    }
  }
  class MockJWT {
    authorize = vi.fn();
    constructor(opts: any) {
      mockJWTConstructor(opts);
    }
  }
  const mockSheets = vi.fn().mockReturnValue({
    spreadsheets: {
      values: {
        get: vi.fn(),
        batchUpdate: vi.fn(),
      },
    },
  });

  return {
    google: {
      auth: {
        GoogleAuth: MockGoogleAuth,
        JWT: MockJWT,
      },
      sheets: mockSheets,
    },
  };
});

describe('ServiceAccountStrategy', () => {
  let strategy: ServiceAccountStrategy;
  let mockConfigService: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize GoogleAuth with credentials keyFile when file exists', async () => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'googleSheets.credentialsPath') return './config/credentials.json';
        return null;
      }),
    };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    strategy = new ServiceAccountStrategy(mockConfigService);
    const auth = await strategy.getAuthClient();
    expect(auth).toBeDefined();
    expect(mockGoogleAuthConstructor).toHaveBeenCalledWith({
      keyFile: './config/credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  });

  it('should initialize JWT with serviceAccountEmail and privateKey when no keyfile', async () => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'googleSheets.credentialsPath') return null;
        if (key === 'googleSheets.serviceAccountEmail') return 'sync-bot@iam.gserviceaccount.com';
        if (key === 'googleSheets.privateKey') return '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
        return null;
      }),
    };
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    strategy = new ServiceAccountStrategy(mockConfigService);
    const auth = await strategy.getAuthClient();
    expect(auth).toBeDefined();
    expect(mockJWTConstructor).toHaveBeenCalledWith({
      email: 'sync-bot@iam.gserviceaccount.com',
      key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  });

  it('should fallback to default GoogleAuth when neither keyfile nor inline key exists', async () => {
    mockConfigService = {
      get: vi.fn(() => null),
    };
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    strategy = new ServiceAccountStrategy(mockConfigService);
    const auth = await strategy.getAuthClient();
    expect(auth).toBeDefined();
    expect(mockGoogleAuthConstructor).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  });

  it('should return cached authClient and sheetsClient on subsequent calls', async () => {
    mockConfigService = {
      get: vi.fn(() => null),
    };
    strategy = new ServiceAccountStrategy(mockConfigService);

    const sheets1 = await strategy.getSheetsClient();
    const sheets2 = await strategy.getSheetsClient();
    expect(sheets1).toBe(sheets2);
  });
});
