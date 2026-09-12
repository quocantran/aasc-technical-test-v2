import { DealConversionWorker } from './deal-conversion.worker';

describe('DealConversionWorker', () => {
  let worker: DealConversionWorker;
  let mockDealConversionService: any;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockDealConversionService = {
      convertLeadToDeal: jest.fn(),
    };
    mockPrisma = {
      dlqRecord: {
        create: jest.fn().mockResolvedValue({ id: 'dlq-1' }),
      },
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    worker = new DealConversionWorker(
      mockDealConversionService,
      mockPrisma,
      mockLogger,
    );
  });

  it('should process deal conversion and return result', async () => {
    mockDealConversionService.convertLeadToDeal.mockResolvedValueOnce({
      converted: true,
      dealId: 'deal-123',
    });

    const job: any = {
      id: 'deal-job-1',
      data: { leadId: 'lead-1' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    const res = await worker.process(job);
    expect(res.converted).toBe(true);
    expect(mockDealConversionService.convertLeadToDeal).toHaveBeenCalledWith('lead-1');
  });

  it('should record to DLQ on final attempt failure and rethrow', async () => {
    mockDealConversionService.convertLeadToDeal.mockRejectedValueOnce(new Error('Bitrix API failure'));

    const job: any = {
      id: 'deal-job-err',
      name: 'evaluate-deal-rules',
      data: { leadId: 'lead-err' },
      opts: { attempts: 3 },
      attemptsMade: 2,
    };

    await expect(worker.process(job)).rejects.toThrow('Bitrix API failure');

    expect(mockPrisma.dlqRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: 'Bitrix API failure',
          attempts: 3,
        }),
      }),
    );
  });
});
