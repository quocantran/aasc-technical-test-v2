import { TikTokEventsSyncWorker } from './tiktok-events-sync.worker';

describe('TikTokEventsSyncWorker', () => {
  let worker: TikTokEventsSyncWorker;
  let mockTikTokEventsService: any;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockTikTokEventsService = {
      trackLeadConversion: jest.fn(),
    };
    mockPrisma = {
      lead: {
        findUnique: jest.fn(),
      },
      deal: {
        findUnique: jest.fn(),
      },
      dlqRecord: {
        create: jest.fn().mockResolvedValue({ id: 'dlq-1' }),
      },
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    worker = new TikTokEventsSyncWorker(
      mockTikTokEventsService,
      mockPrisma,
      mockLogger,
    );
  });

  it('should skip if lead not found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);

    const job: any = {
      id: 'job-tt-1',
      data: { leadId: 'lead-missing' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res).toEqual({ skipped: true });
    expect(mockTikTokEventsService.trackLeadConversion).not.toHaveBeenCalled();
  });

  it('should track conversion for found lead and deal', async () => {
    const lead = { id: 'lead-1', email: 'a@example.com' };
    const deal = { id: 'deal-1', amount: 5000000 };
    mockPrisma.lead.findUnique.mockResolvedValueOnce(lead);
    mockPrisma.deal.findUnique.mockResolvedValueOnce(deal);
    mockTikTokEventsService.trackLeadConversion.mockResolvedValueOnce({ success: true, eventId: 'evt-tt' });

    const job: any = {
      id: 'job-tt-2',
      data: { leadId: 'lead-1', dealId: 'deal-1' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res.success).toBe(true);
    expect(mockTikTokEventsService.trackLeadConversion).toHaveBeenCalledWith(lead, deal);
  });

  it('should record to DLQ on exhausted attempts failure', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({ id: 'lead-err' });
    mockTikTokEventsService.trackLeadConversion.mockRejectedValueOnce(new Error('TikTok API 500'));

    const job: any = {
      id: 'job-tt-err',
      name: 'sync-tiktok-event',
      data: { leadId: 'lead-err' },
      opts: { attempts: 3 },
      attemptsMade: 2,
    };

    await expect(worker.process(job)).rejects.toThrow('TikTok API 500');
    expect(mockPrisma.dlqRecord.create).toHaveBeenCalled();
  });
});
