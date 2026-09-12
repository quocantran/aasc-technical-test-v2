import { ConfigService } from './config.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      configuration: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new ConfigService(mockPrisma as PrismaService, mockLogger);
  });

  it('should fetch and cache configuration', async () => {
    mockPrisma.configuration.findUnique.mockResolvedValueOnce({
      key: 'test_key',
      value: { foo: 'bar' },
    });

    const res1 = await service.getConfiguration('test_key');
    expect(res1).toEqual({ foo: 'bar' });

    // Second call should hit in-memory cache without calling prisma again
    const res2 = await service.getConfiguration('test_key');
    expect(res2).toEqual({ foo: 'bar' });
    expect(mockPrisma.configuration.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should update configuration and invalidate cache', async () => {
    mockPrisma.configuration.upsert.mockResolvedValueOnce({
      key: 'test_key',
      value: { updated: true },
    });

    const res = await service.setConfiguration('test_key', { updated: true });
    expect(res).toEqual({ updated: true });

    // Subsequent get should return the updated value from cache
    const cached = await service.getConfiguration('test_key');
    expect(cached).toEqual({ updated: true });
  });

  it('should get and update field mappings', async () => {
    mockPrisma.configuration.findUnique.mockResolvedValueOnce(null);
    const defaults = await service.getFieldMappings();
    expect(defaults.field_mapping).toBeDefined();

    mockPrisma.configuration.upsert.mockResolvedValueOnce({
      key: 'field_mapping',
      value: { custom: 'mapping' },
    });
    const updated = await service.updateFieldMappings({ custom: 'mapping' });
    expect(updated).toEqual({ custom: 'mapping' });
  });

  it('should get and update deal rules', async () => {
    mockPrisma.configuration.findUnique.mockResolvedValueOnce(null);
    const rules = await service.getDealRules();
    expect(Array.isArray(rules)).toBe(true);

    mockPrisma.configuration.upsert.mockResolvedValueOnce({
      key: 'deal_rules',
      value: [{ id: 'rule-1' }],
    });
    const updated = await service.updateDealRules([{ id: 'rule-1' }]);
    expect(updated).toEqual([{ id: 'rule-1' }]);
  });
});
