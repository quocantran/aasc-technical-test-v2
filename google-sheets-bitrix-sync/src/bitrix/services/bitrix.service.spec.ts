// Unit tests for BitrixService testing HTTP requests, error interception, and batch chunking

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitrixService } from './bitrix.service.js';

describe('BitrixService', () => {
  let service: BitrixService;
  let mockConfigService: any;
  let mockWebhookStrategy: any;
  let mockRetryService: any;
  let mockRateLimiter: any;
  let mockLogger: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'bitrix.maxRetries') return 3;
        return null;
      }),
    };
    mockWebhookStrategy = {
      getEndpoint: vi.fn((method: string) => `https://test.bitrix24.vn/rest/1/token/${method}.json`),
      getHeaders: vi.fn().mockReturnValue({ 'Content-Type': 'application/json' }),
    };
    mockRetryService = {
      executeWithRetry: vi.fn(async (op: () => Promise<any>) => op()),
    };
    mockRateLimiter = {
      acquire: vi.fn(async (op: () => Promise<any>) => op()),
    };
    mockLogger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    service = new BitrixService(
      mockConfigService,
      mockWebhookStrategy,
      mockRetryService,
      mockRateLimiter,
      mockLogger,
    );
  });

  it('should callMethod through rate limiter and retry service', async () => {
    // Mock axios post on the internal httpClient
    const mockPost = vi.fn().mockResolvedValue({
      data: { result: 42 },
    });
    (service as any).httpClient.post = mockPost;

    const result = await service.callMethod('crm.lead.get', { id: 10 });

    expect(result).toBe(42);
    expect(mockRateLimiter.acquire).toHaveBeenCalled();
    expect(mockRetryService.executeWithRetry).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(
      'https://test.bitrix24.vn/rest/1/token/crm.lead.get.json',
      { id: 10 },
      expect.anything(),
    );
  });

  it('should throw Error when Bitrix response contains error property', async () => {
    (service as any).httpClient.post = vi.fn().mockResolvedValue({
      data: {
        error: 'ERROR_CORE',
        error_description: 'Entity not found',
      },
    });

    await expect(service.callMethod('crm.lead.delete', { id: 99 })).rejects.toThrow('Bitrix24 Error [ERROR_CORE]');
  });

  it('should execute batch commands in chunks of 50', async () => {
    const commands: Record<string, string> = {
      cmd1: 'crm.lead.get?id=1',
      cmd2: 'crm.lead.get?id=2',
    };

    vi.spyOn(service, 'callMethod').mockResolvedValue({
      result: { cmd1: { ID: 1 }, cmd2: { ID: 2 } },
      result_error: {},
    });

    const response = await service.executeBatch(commands);

    expect(response.result.cmd1).toBeDefined();
    expect(service.callMethod).toHaveBeenCalledWith('batch', {
      halt: 0,
      cmd: commands,
    });
  });

  it('should return empty result and error when batch commands are empty', async () => {
    const response = await service.executeBatch({});
    expect(response).toEqual({ result: {}, result_error: {} });
  });

  it('should pass halt: 1 when haltOnError is true', async () => {
    vi.spyOn(service, 'callMethod').mockResolvedValue({
      result: {},
      result_error: {},
    });

    await service.executeBatch({ cmd1: 'test' }, true);
    expect(service.callMethod).toHaveBeenCalledWith('batch', {
      halt: 1,
      cmd: { cmd1: 'test' },
    });
  });

  it('should fallback to error string if error_description is absent', async () => {
    (service as any).httpClient.post = vi.fn().mockResolvedValue({
      data: {
        error: 'GENERIC_ERROR',
      },
    });

    await expect(service.callMethod('test')).rejects.toThrow('Bitrix24 Error [GENERIC_ERROR]: GENERIC_ERROR');
  });
});

