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

  it('should cover markDealRecentlyModified and isRecentlyModified', async () => {
    await service.markDealRecentlyModified(999);
    expect(mockRedis.set).toHaveBeenCalledWith('bitrix:echo:999', '1', 15);

    mockRedis.get.mockResolvedValueOnce('1');
    const isLocked = await service.isRecentlyModified(999);
    expect(isLocked).toBe(true);

    mockRedis.get.mockResolvedValueOnce(null);
    const isUnlocked = await service.isRecentlyModified(888);
    expect(isUnlocked).toBe(false);
  });

  it('should handle payload with alternative ID keys (FIELDS_ID, data.ID, payload.ID) and STAGE_ID with colon', async () => {
    mockPrisma.deal.findFirst.mockResolvedValueOnce(null); // deal not in local DB

    const res1 = await service.processDealWebhook({ data: { FIELDS_ID: '201', STAGE_ID: 'C2:WON' } });
    expect(res1.dealId).toBe(201);
    expect(res1.isWon).toBe(true);

    const res2 = await service.processDealWebhook({ data: { ID: 202 } });
    expect(res2.dealId).toBe(202);

    const res3 = await service.processDealWebhook({ ID: 203 });
    expect(res3.dealId).toBe(203);
  });

  it('should gracefully handle adapter getDeal rejection and fallback stageId to empty', async () => {
    mockAdapter.getDeal.mockRejectedValueOnce(new Error('Bitrix API offline'));
    mockPrisma.deal.findFirst.mockResolvedValueOnce(null);

    const res = await service.processDealWebhook({ ID: 301 });
    expect(res.status).toBe('accepted');
    expect(res.stageId).toBe('');
    expect(res.isWon).toBe(false);
  });

  it('should skip duplicate sync if deal is already marked as WON (idempotent)', async () => {
    mockPrisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-uuid-already-won',
      bitrix24Id: 401,
      status: 'won',
      stage: 'WON',
      leadId: 'lead-uuid-won',
      lead: { id: 'lead-uuid-won', ttclid: 'ttclid-already-won' },
    });

    const res = await service.processDealWebhook({
      data: { FIELDS: { ID: 401, STAGE_ID: 'WON' } },
    });

    expect(res.status).toBe('accepted');
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.campaignMetric.upsert).not.toHaveBeenCalled();
  });

  it('should update stage but not change status or trigger queue when stage is NOT WON', async () => {
    mockPrisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-uuid-progress',
      bitrix24Id: 501,
      status: 'created',
      stage: 'NEW',
      leadId: 'lead-uuid-501',
      lead: { id: 'lead-uuid-501' },
    });

    const res = await service.processDealWebhook({
      data: { FIELDS: { ID: 501, STAGE_ID: 'IN_PROGRESS' } },
    });

    expect(res.status).toBe('accepted');
    expect(res.isWon).toBe(false);
    expect(mockPrisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stage: 'IN_PROGRESS', status: 'created' },
      }),
    );
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should handle transition to WON when lead has no ttclid or queue is not provided', async () => {
    mockPrisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-uuid-nottclid',
      bitrix24Id: 601,
      status: 'created',
      leadId: 'lead-uuid-601',
      lead: { id: 'lead-uuid-601', ttclid: undefined, campaignId: undefined },
    });

    const res = await service.processDealWebhook({
      data: { FIELDS: { ID: 601, STAGE_ID: 'WON' } },
    });

    expect(res.status).toBe('accepted');
    expect(mockQueue.add).not.toHaveBeenCalled();

    // Also test service instantiated without queue and without logger
    const minimalService = new BitrixWebhookService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
      mockAdapter as IBitrixCrmAdapter,
    );
    expect(minimalService).toBeDefined();
  });
});
