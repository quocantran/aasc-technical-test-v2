import { LeadService } from './lead.service';
import { PrismaService } from '../../../database/prisma.service';
import { LeadDeduplicationService } from './lead-deduplication.service';
import { ConfigService } from '../../config-mgmt/services/config.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { LeadQualityScoreService } from './lead-quality-score.service';
import { RedisService } from '../../../common/redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('LeadService', () => {
  let service: LeadService;
  let mockPrisma: any;
  let mockDedupService: any;
  let mockConfigService: any;
  let mockQualityScoreService: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      deal: {
        create: jest.fn(),
      },
      campaignMetric: {
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockDedupService = {
      findDuplicate: jest.fn(),
    };

    mockConfigService = {
      getFieldMappings: jest.fn().mockResolvedValue({
        merge_strategy: 'OVERWRITE_EMPTY',
      }),
    };

    mockQualityScoreService = {
      calculateQualityScore: jest.fn().mockReturnValue(85),
    };

    mockRedisService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new LeadService(
      mockPrisma as PrismaService,
      mockDedupService as LeadDeduplicationService,
      mockConfigService as ConfigService,
      mockLogger,
      mockQualityScoreService as LeadQualityScoreService,
      mockRedisService as RedisService,
    );
  });

  it('should process, normalize and create new lead in DB', async () => {
    mockDedupService.findDuplicate.mockResolvedValueOnce({ isDuplicate: false });
    mockPrisma.lead.create.mockResolvedValueOnce({
      id: 'lead-uuid-1',
      name: 'Nguyen Van A',
      email: 'nguyenvana@email.com',
      phone: '+84901234567',
      status: 'new',
    });

    const payload = {
      event_id: 'evt_101',
      campaign: { campaign_id: '123', campaign_name: 'Spring Sale' },
      lead_data: {
        full_name: 'Nguyen Van A',
        email: '  NgUyEnVanA@Email.Com  ',
        phone: '0901234567',
      },
    };

    const res = await service.processAndStoreLead(payload);

    expect(mockDedupService.findDuplicate).toHaveBeenCalledWith(
      'nguyenvana@email.com',
      '+84901234567',
      'evt_101',
    );
    expect(res.isDuplicate).toBe(false);
    expect(res.lead.name).toBe('Nguyen Van A');
    expect(mockPrisma.lead.create).toHaveBeenCalled();
    expect(mockPrisma.campaignMetric.upsert).toHaveBeenCalled();
    expect(mockRedisService.acquireLock).toHaveBeenCalled();
    expect(mockRedisService.releaseLock).toHaveBeenCalled();
  });

  it('should retry acquiring lock if first attempt fails', async () => {
    mockRedisService.acquireLock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    mockDedupService.findDuplicate.mockResolvedValueOnce({ isDuplicate: false });
    mockPrisma.lead.create.mockResolvedValueOnce({ id: 'lead-uuid-retry' });

    const payload = {
      event_id: 'evt_lock_retry',
      lead_data: { email: 'retry@example.com' },
    };

    const res = await service.processAndStoreLead(payload);
    expect(res.lead.id).toBe('lead-uuid-retry');
    expect(mockRedisService.acquireLock).toHaveBeenCalledTimes(2);
  });

  it('should handle payload with only phone or no email/phone for locking key', async () => {
    mockDedupService.findDuplicate.mockResolvedValue({ isDuplicate: false });
    mockPrisma.lead.create.mockResolvedValue({ id: 'lead-phone-only' });

    // Phone only
    await service.processAndStoreLead({
      lead_data: { phone: '0901234567' },
    });
    expect(mockRedisService.acquireLock).toHaveBeenCalledWith(
      expect.stringContaining('lock:dedup:phone:'),
      expect.any(String),
      5000,
    );

    // No email, no phone
    await service.processAndStoreLead({
      event_id: 'evt_no_contact',
      lead_data: { full_name: 'Anonymous' },
    });
    expect(mockRedisService.acquireLock).toHaveBeenCalledWith(
      expect.stringContaining('lock:dedup:event:evt_no_contact'),
      expect.any(String),
      5000,
    );
  });

  it('should merge data into existing lead with OVERWRITE_EMPTY strategy', async () => {
    mockDedupService.findDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      localLeadId: 'existing-id',
      matchedBy: 'email',
    });

    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      name: '',
      email: '',
      phone: '',
      city: '',
    });

    mockPrisma.lead.update.mockResolvedValueOnce({
      id: 'existing-id',
      name: 'Nguyen Van B',
      email: 'b@example.com',
      phone: '+84909999999',
      city: 'Da Nang',
    });

    const payload = {
      lead_data: {
        full_name: 'Nguyen Van B',
        email: 'b@example.com',
        phone: '0909999999',
        city: 'Da Nang',
      },
    };

    const res = await service.processAndStoreLead(payload);
    expect(res.isDuplicate).toBe(true);
    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-id' },
        data: expect.objectContaining({
          name: 'Nguyen Van B',
          email: 'b@example.com',
          phone: '+84909999999',
          city: 'Da Nang',
        }),
      }),
    );
  });

  it('should merge data into existing lead with ALWAYS_OVERWRITE strategy', async () => {
    mockConfigService.getFieldMappings.mockResolvedValueOnce({
      merge_strategy: 'ALWAYS_OVERWRITE',
    });

    mockDedupService.findDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      localLeadId: 'existing-id',
    });

    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      name: 'Old Name',
      email: 'old@example.com',
      phone: '+84901111111',
      city: 'Old City',
    });

    mockPrisma.lead.update.mockResolvedValueOnce({ id: 'existing-id' });

    const payload = {
      lead_data: {
        full_name: 'New Name',
        email: 'new@example.com',
        phone: '0902222222',
        city: 'New City',
      },
    };

    const res = await service.processAndStoreLead(payload);
    expect(res.isDuplicate).toBe(true);
    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Name',
          email: 'new@example.com',
          phone: '+84902222222',
          city: 'New City',
        }),
      }),
    );
  });

  it('should handle PRESERVE_EXISTING strategy without updating empty fields', async () => {
    mockConfigService.getFieldMappings.mockResolvedValueOnce({
      merge_strategy: 'PRESERVE_EXISTING',
    });

    mockDedupService.findDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      localLeadId: 'existing-id',
    });

    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      name: 'Old Name',
    });

    mockPrisma.lead.update.mockResolvedValueOnce({ id: 'existing-id' });

    const payload = { lead_data: { full_name: 'Ignored Name' } };
    await service.processAndStoreLead(payload);

    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ name: 'Ignored Name' }),
      }),
    );
  });

  it('should handle Bitrix duplicate when no local lead is matched', async () => {
    mockDedupService.findDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      bitrix24Id: 9999,
      localLeadId: null,
      matchedBy: 'phone',
    });

    mockPrisma.lead.create.mockResolvedValueOnce({
      id: 'lead-bitrix-duplicate',
      bitrix24Id: 9999,
    });

    const payload = {
      event_id: 'evt_crm_dup',
      lead_data: { phone: '0908888888' },
    };

    const res = await service.processAndStoreLead(payload);
    expect(res.isDuplicate).toBe(true);
    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bitrix24Id: 9999,
          status: 'new',
        }),
      }),
    );
  });

  it('should execute findPaginated with various filter queries', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([{ id: 'lead-1' }]);
    mockPrisma.lead.count.mockResolvedValueOnce(1);

    const query = {
      page: '1',
      limit: '10',
      source: 'tiktok',
      status: 'new',
      campaign_id: 'camp_1',
      email: 'nguyen@example.com',
      phone: '+84901234567',
      external_id: 'evt_1',
    };

    const res = await service.findPaginated(query as any);
    expect(res.data).toHaveLength(1);
    expect(res.meta.total).toBe(1);
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'tiktok',
          status: 'new',
          campaignId: 'camp_1',
          email: 'nguyen@example.com',
          phone: '+84901234567',
          externalId: 'evt_1',
        }),
      }),
    );
  });

  it('should execute findPaginated with email prefix when email does not contain @', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([]);
    mockPrisma.lead.count.mockResolvedValueOnce(0);

    await service.findPaginated({ email: 'prefixonly' } as any);
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { startsWith: 'prefixonly' },
        }),
      }),
    );
  });

  it('should execute findPaginated with default pagination when no params provided', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([]);
    mockPrisma.lead.count.mockResolvedValueOnce(0);

    const res = await service.findPaginated({} as any);
    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(10);
  });

  it('should return lead by ID and throw NotFoundException when lead is missing', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({ id: 'found-lead' });
    const found = await service.findById('found-lead');
    expect(found.id).toBe('found-lead');

    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById('missing-lead')).rejects.toThrow(NotFoundException);
  });

  it('should work without optional qualityScoreService and redisService', async () => {
    const minimalService = new LeadService(
      mockPrisma as PrismaService,
      mockDedupService as LeadDeduplicationService,
      mockConfigService as ConfigService,
      { log: () => {} } as any,
    );

    mockDedupService.findDuplicate.mockResolvedValueOnce({ isDuplicate: false });
    mockPrisma.lead.create.mockResolvedValueOnce({ id: 'minimal-lead' });

    const res = await minimalService.processAndStoreLead({
      lead_data: { full_name: 'No Redis Lead' },
    });

    expect(res.lead.id).toBe('minimal-lead');
  });
});
