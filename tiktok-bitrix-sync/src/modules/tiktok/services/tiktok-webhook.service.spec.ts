import { TikTokWebhookService } from './tiktok-webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('TikTokWebhookService', () => {
  let service: TikTokWebhookService;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(() => {
    mockPrisma = {
      webhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn(),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new TikTokWebhookService(
      mockPrisma as PrismaService,
      mockQueue as any,
      mockLogger,
    );
  });

  it('should accept new webhook and enqueue job with deterministic jobId', async () => {
    mockPrisma.webhookEvent.findUnique.mockResolvedValueOnce(null);
    mockPrisma.webhookEvent.create.mockResolvedValueOnce({
      id: 'webhook-evt-uuid',
      eventId: 'evt_123',
    });

    const dto = {
      event: 'lead.generate',
      event_id: 'evt_123',
      lead_data: { full_name: 'Test Lead' },
    } as any;

    const res = await service.ingestWebhook(dto, dto);

    expect(res.status).toBe('accepted');
    expect(res.event_id).toBe('evt_123');
    expect(res.job_id).toBe('lead-processing-evt_123');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'process-lead',
      expect.objectContaining({ eventId: 'evt_123' }),
      expect.objectContaining({ jobId: 'lead-processing-evt_123' }),
    );
  });

  it('should return ignored if event already exists in DB', async () => {
    mockPrisma.webhookEvent.findUnique.mockResolvedValueOnce({
      id: 'existing-id',
      eventId: 'evt_duplicate',
      status: 'processed',
    });

    const dto = {
      event: 'lead.generate',
      event_id: 'evt_duplicate',
      lead_data: { full_name: 'Duplicate' },
    } as any;

    const res = await service.ingestWebhook(dto, dto);

    expect(res.status).toBe('ignored');
    expect(res.reason).toBe('already_exists');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
