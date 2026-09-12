import { BitrixWebhookService } from './bitrix-webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IBitrixCrmAdapter } from '../interfaces/bitrix-adapter.interface';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BitrixWebhookService', () => {
  let service: BitrixWebhookService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockAdapter: any;
  let mockQueue: any;

  beforeEach(() => {
    mockPrisma = {
      deal: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      campaignMetric: {
        upsert: jest.fn(),
      },
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockAdapter = {
      getDeal: jest.fn().mockResolvedValue({ ID: 100, STAGE_ID: 'WON' }),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new BitrixWebhookService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
      mockAdapter as IBitrixCrmAdapter,
      mockQueue,
      mockLogger,
    );
  });

  it('should ignore payload without deal ID', async () => {
    const res = await service.processDealWebhook({});
    expect(res.status).toBe('ignored');
  });

  it('should ignore self-echo webhooks locked in Redis', async () => {
    mockRedis.get.mockResolvedValueOnce('1');
    const res = await service.processDealWebhook({ data: { FIELDS: { ID: 100 } } });
    expect(res.status).toBe('ignored');
    expect(res.reason).toBe('self_echo');
  });

  it('should process deal update and trigger conversion when transitioning to WON', async () => {
    mockPrisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-uuid-1',
      bitrix24Id: 100,
      status: 'created',
      leadId: 'lead-uuid-1',
      lead: { id: 'lead-uuid-1', ttclid: 'ttclid-123', campaignId: 'camp-1' },
    });

    const res = await service.processDealWebhook({
      event: 'ONCRMDEALUPDATE',
      data: { FIELDS: { ID: 100, STAGE_ID: 'WON' } },
    });

    expect(res.status).toBe('accepted');
    expect(res.isWon).toBe(true);
    expect(mockPrisma.deal.update).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });
});
