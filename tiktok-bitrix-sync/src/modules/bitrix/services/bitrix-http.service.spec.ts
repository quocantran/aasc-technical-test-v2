import { BitrixHttpService } from './bitrix-http.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BitrixHttpService', () => {
  let service: BitrixHttpService;
  let mockRetryService: any;
  let mockRateLimiter: any;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'bitrix.webhookUrl') return 'https://test.bitrix24.com/rest/1/secret';
        if (key === 'bitrix.maxRetries') return 3;
        return undefined;
      }),
    } as any as ConfigService;

    mockRetryService = {
      executeWithRetry: jest.fn().mockImplementation(async (fn) => fn()),
    };

    mockRateLimiter = {
      acquire: jest.fn().mockImplementation(async (fn) => fn()),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new BitrixHttpService(mockConfig, mockRetryService, mockRateLimiter, mockLogger);
  });

  it('should clean and build correct endpoint URL', () => {
    const endpoint = service.getEndpoint('crm.lead.add');
    expect(endpoint).toBe('https://test.bitrix24.com/rest/1/secret/crm.lead.add.json');
  });

  it('should return empty batch if commands are empty', async () => {
    const res = await service.executeBatch({});
    expect(res.result).toEqual({});
    expect(res.result_error).toEqual({});
  });

  describe('callMethod', () => {
    it('should call httpClient.post and return result', async () => {
      (service as any).httpClient = {
        post: jest.fn().mockResolvedValue({
          data: { result: 12345 },
        }),
      };

      const result = await service.callMethod('crm.lead.add', { fields: { TITLE: 'Test' } });
      expect(result).toBe(12345);
      expect((service as any).httpClient.post).toHaveBeenCalledWith(
        'https://test.bitrix24.com/rest/1/secret/crm.lead.add.json',
        { fields: { TITLE: 'Test' } },
      );
    });

    it('should throw Error when Bitrix response contains error', async () => {
      (service as any).httpClient = {
        post: jest.fn().mockResolvedValue({
          data: { error: 'ERROR_CORE', error_description: 'Access denied' },
        }),
      };

      await expect(service.callMethod('crm.lead.get')).rejects.toThrow(
        'Bitrix24 Error [ERROR_CORE]: Access denied',
      );
    });
  });

  describe('executeBatch', () => {
    it('should chunk commands and aggregate results', async () => {
      const callMethodSpy = jest.spyOn(service, 'callMethod').mockImplementation(async (method, params: any) => {
        return {
          result: { [Object.keys(params.cmd)[0]]: 'success_1' },
          result_error: {},
        } as any;
      });

      const res = await service.executeBatch({
        cmd1: 'crm.lead.get?id=1',
        cmd2: 'crm.lead.get?id=2',
      });

      expect(callMethodSpy).toHaveBeenCalledWith('batch', expect.objectContaining({ halt: 0 }));
      expect(res.result).toHaveProperty('cmd1');
    });

    it('should pass halt: 1 when haltOnError is true and aggregate result_error', async () => {
      const callMethodSpy = jest.spyOn(service, 'callMethod').mockImplementation(async (_method, _params: any) => {
        return {
          result: {},
          result_error: { cmdErr: { error: 'ERROR_BATCH', error_description: 'Batch item failed' } },
        } as any;
      });

      const res = await service.executeBatch(
        {
          cmdErr: 'crm.lead.add?wrong=1',
        },
        true, // haltOnError = true
      );

      expect(callMethodSpy).toHaveBeenCalledWith('batch', expect.objectContaining({ halt: 1 }));
      expect(res.result_error).toHaveProperty('cmdErr');
    });

    it('should fallback to error string when error_description is absent in response', async () => {
      (service as any).httpClient = {
        post: jest.fn().mockResolvedValue({
          data: { error: 'QUERY_LIMIT_EXCEEDED' }, // no error_description
        }),
      };

      await expect(service.callMethod('crm.deal.list')).rejects.toThrow(
        'Bitrix24 Error [QUERY_LIMIT_EXCEEDED]: QUERY_LIMIT_EXCEEDED',
      );
    });

    it('should initialize correctly with empty configService', () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) } as any;
      const minimalService = new BitrixHttpService(
        emptyConfig,
        mockRetryService,
        mockRateLimiter,
        { debug: () => {} } as any,
      );
      expect(minimalService.getEndpoint('lead.get')).toBe('/lead.get.json');
    });
  });
});

