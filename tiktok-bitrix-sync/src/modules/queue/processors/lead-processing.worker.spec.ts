import { LeadProcessingWorker } from './lead-processing.worker';
import { EVENT_TYPES, AUDIT_ACTIONS } from '../../../common/constants/api.constants';

describe('LeadProcessingWorker', () => {
  let worker: LeadProcessingWorker;
  let mockLeadService: any;
  let mockPrisma: any;
  let mockBitrixQueue: any;
  let mockLogger: any;

  beforeEach(() => {
    mockLeadService = {
      processAndStoreLead: jest.fn(),
    };
    mockPrisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      webhookEvent: {
        update: jest.fn().mockResolvedValue({ id: 'wh-1' }),
      },
      dlqRecord: {
        create: jest.fn().mockResolvedValue({ id: 'dlq-1' }),
      },
    };
    mockBitrixQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-bitrix-1' }),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    worker = new LeadProcessingWorker(
      mockLeadService,
      mockPrisma,
      mockBitrixQueue,
      mockLogger,
    );
  });

  it('should record touchpoint and skip CRM creation for user.interaction without contact info', async () => {
    const job: any = {
      id: 'job-1',
      data: {
        webhookEventId: 'wh-event-1',
        eventId: 'evt-interaction-1',
        payload: {
          event: EVENT_TYPES.USER_INTERACTION,
          campaign: { campaign_id: 'camp-1', ad_id: 'ad-1' },
          lead_data: { ttclid: 'tt-123' },
        },
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const result = await worker.process(job);

    expect(result.status).toBe('interaction_recorded');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'USER_INTERACTION' }),
      }),
    );
    expect(mockPrisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'processed' }) }),
    );
    expect(mockLeadService.processAndStoreLead).not.toHaveBeenCalled();
    expect(mockBitrixQueue.add).not.toHaveBeenCalled();
  });

  it('should process form.complete event and create dedicated FORM_COMPLETED audit log', async () => {
    const job: any = {
      id: 'job-2',
      data: {
        webhookEventId: 'wh-event-2',
        eventId: 'evt-form-2',
        payload: {
          event: EVENT_TYPES.FORM_COMPLETE,
          form: { form_id: 'form-123', form_name: 'Summer Form' },
          lead_data: { full_name: 'Nguyen Van Form', email: 'form@example.com', phone: '+84901234567' },
          custom_questions: [{ question: 'Budget', answer: '10M' }],
        },
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    mockLeadService.processAndStoreLead.mockResolvedValueOnce({
      lead: { id: 'lead-uuid-1', syncVersion: 1 },
      isDuplicate: false,
      bitrix24Id: null,
    });

    const result = await worker.process(job);

    expect(result.leadId).toBe('lead-uuid-1');
    expect(mockLeadService.processAndStoreLead).toHaveBeenCalledWith(job.data.payload);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.FORM_COMPLETED,
          leadId: 'lead-uuid-1',
        }),
      }),
    );
    expect(mockBitrixQueue.add).toHaveBeenCalled();
  });

  it('should process standard lead.generate event and enqueue to Bitrix sync queue', async () => {
    const job: any = {
      id: 'job-3',
      data: {
        webhookEventId: 'wh-event-3',
        eventId: 'evt-lead-3',
        payload: {
          event: EVENT_TYPES.LEAD_GENERATE,
          lead_data: { full_name: 'Nguyen Van Lead', email: 'lead@example.com', phone: '+84901234568' },
        },
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    mockLeadService.processAndStoreLead.mockResolvedValueOnce({
      lead: { id: 'lead-uuid-2', syncVersion: 1 },
      isDuplicate: false,
      bitrix24Id: null,
    });

    const result = await worker.process(job);

    expect(result.leadId).toBe('lead-uuid-2');
    expect(mockBitrixQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ leadId: 'lead-uuid-2' }),
      expect.any(Object),
    );
  });

  it('should catch error, update webhookEvent to failed, and write to DLQ when attempts exhausted', async () => {
    const job: any = {
      id: 'job-err',
      name: 'process-lead',
      data: {
        webhookEventId: 'wh-err',
        eventId: 'evt-err',
        payload: { event: EVENT_TYPES.LEAD_GENERATE, lead_data: {} },
      },
      opts: { attempts: 3 },
      attemptsMade: 2, // 2 + 1 = 3 -> exhausted
    };

    mockLeadService.processAndStoreLead.mockRejectedValueOnce(new Error('Database lock timeout'));

    await expect(worker.process(job)).rejects.toThrow('Database lock timeout');

    expect(mockPrisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(mockPrisma.dlqRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: 'Database lock timeout',
          attempts: 3,
        }),
      }),
    );
  });
});
