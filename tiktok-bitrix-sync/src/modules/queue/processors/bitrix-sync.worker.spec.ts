import { BitrixSyncWorker } from './bitrix-sync.worker';
import { LEAD_STATUS } from '../../../common/constants/api.constants';
import { JOB_NAMES } from '../../../common/constants/queue.constants';

describe('BitrixSyncWorker', () => {
  let worker: BitrixSyncWorker;
  let mockPrisma: any;
  let mockLeadMappingService: any;
  let mockBitrixAdapter: any;
  let mockDealQueue: any;
  let mockTikTokEventsQueue: any;
  let mockLogger: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      campaignMetric: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      dlqRecord: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockLeadMappingService = {
      mapTikTokToBitrix: jest.fn().mockResolvedValue({ TITLE: 'Mapped Lead' }),
    };

    mockBitrixAdapter = {
      createLead: jest.fn().mockResolvedValue({ id: 9001 }),
      updateLead: jest.fn().mockResolvedValue(true),
      addTimelineComment: jest.fn().mockResolvedValue(true),
    };

    mockDealQueue = {
      add: jest.fn().mockResolvedValue({ id: 'deal-job-1' }),
    };

    mockTikTokEventsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'tt-job-1' }),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    worker = new BitrixSyncWorker(
      mockPrisma,
      mockLeadMappingService,
      mockBitrixAdapter,
      mockDealQueue,
      mockTikTokEventsQueue,
      mockLogger,
    );
  });

  it('should skip if lead not found in DB', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);

    const job: any = {
      id: 'job-1',
      data: { leadId: 'lead-missing' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res).toEqual({ skipped: true, reason: 'LEAD_NOT_FOUND' });
  });

  it('should create new lead on Bitrix24 when no existingBitrix24Id', async () => {
    const lead = {
      id: 'lead-1',
      name: 'Nguyen Van Sync',
      rawData: { test: true },
      campaignId: 'camp-1',
      campaignName: 'Sale 2026',
      adName: 'Ad 1',
      formName: 'Form 1',
    };
    mockPrisma.lead.findUnique.mockResolvedValueOnce(lead);

    const job: any = {
      id: 'job-sync-1',
      data: { leadId: 'lead-1' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res.bitrix24Id).toBe(9001);
    expect(mockBitrixAdapter.createLead).toHaveBeenCalled();
    expect(mockBitrixAdapter.addTimelineComment).toHaveBeenCalled();
    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({ status: LEAD_STATUS.SYNCED, bitrix24Id: 9001 }),
      }),
    );
    expect(mockDealQueue.add).toHaveBeenCalled();
    expect(mockTikTokEventsQueue.add).toHaveBeenCalled();
  });

  it('should update existing lead on Bitrix24 when bitrix24Id exists', async () => {
    const lead = {
      id: 'lead-2',
      bitrix24Id: 5005,
      rawData: {},
    };
    mockPrisma.lead.findUnique.mockResolvedValueOnce(lead);

    const job: any = {
      id: 'job-sync-2',
      data: { leadId: 'lead-2', existingBitrix24Id: 5005 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res.bitrix24Id).toBe(5005);
    expect(mockBitrixAdapter.updateLead).toHaveBeenCalledWith(5005, expect.any(Object));
  });

  it('should record to DLQ on final attempt failure and rethrow', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-err', rawData: {} });
    mockLeadMappingService.mapTikTokToBitrix.mockRejectedValueOnce(new Error('Mapping error'));

    const job: any = {
      id: 'job-err',
      name: 'sync-lead',
      data: { leadId: 'lead-err' },
      opts: { attempts: 3 },
      attemptsMade: 2,
    };

    await expect(worker.process(job)).rejects.toThrow('Mapping error');
    expect(mockPrisma.dlqRecord.create).toHaveBeenCalled();
  });

  describe('processBatch', () => {
    it('should return skipped if batch is empty', async () => {
      const job: any = {
        name: JOB_NAMES.SYNC_LEADS_BATCH_TO_BITRIX,
        data: { leadIds: [] },
      };

      const res = await worker.process(job);
      expect(res).toEqual({ skipped: true, reason: 'EMPTY_BATCH' });
    });

    it('should process batch items, update lead statuses, and update migration syncJob progress', async () => {
      const leads = [
        { id: 'lead-b1', rawData: {} },
        { id: 'lead-b2', rawData: {} },
      ];

      mockPrisma.lead.findMany = jest.fn().mockResolvedValue(leads);
      mockPrisma.syncJob = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mig-1',
          processedItems: 0,
          failedItems: 0,
          totalItems: 2,
        }),
        update: jest.fn().mockResolvedValue({}),
      };

      mockBitrixAdapter.createLeadsBatch = jest.fn().mockResolvedValue({
        'lead-b1': { success: true, id: 7001 },
        'lead-b2': { success: false, error: 'Duplicate' },
      });

      const job: any = {
        name: JOB_NAMES.SYNC_LEADS_BATCH_TO_BITRIX,
        data: {
          leadIds: ['lead-b1', 'lead-b2'],
          migrationJobId: 'mig-1',
          batchIndex: 0,
        },
      };

      const res = await worker.process(job);
      expect(res.total).toBe(2);
      expect(res.successCount).toBe(1);
      expect(res.failCount).toBe(1);

      expect(mockPrisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-b1' },
          data: expect.objectContaining({ bitrix24Id: 7001, status: LEAD_STATUS.SYNCED }),
        }),
      );

      expect(mockPrisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-b2' },
          data: expect.objectContaining({ status: LEAD_STATUS.FAILED }),
        }),
      );

      expect(mockPrisma.syncJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mig-1' },
          data: expect.objectContaining({ progress: 100, status: 'completed' }),
        }),
      );
    });
  });
});

