import { ScheduledReportsService } from './scheduled-reports.service';
import { PrismaService } from '../../../database/prisma.service';
import { AnalyticsService } from './analytics.service';
import { IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;
  let mockPrisma: any;
  let mockAnalyticsService: any;
  let mockBitrixAdapter: any;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: jest.fn(),
      },
      dlqRecord: {
        count: jest.fn(),
      },
      lead: {
        count: jest.fn(),
      },
    };

    mockAnalyticsService = {
      getConversionRates: jest.fn().mockResolvedValue({
        funnel: { totalLeads: 100, syncedLeads: 80, totalDeals: 40, wonDeals: 20 },
        rates: { leadSyncRate: '80%', leadToDealRate: '40%', dealToWonRate: '50%', endToEndConversionRate: '20%' },
      }),
      getCampaignPerformance: jest.fn().mockResolvedValue([]),
    };

    mockBitrixAdapter = {
      sendNotification: jest.fn().mockResolvedValue(true),
    };

    const mockLogger = {
      log: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as any as AppLogger;

    service = new ScheduledReportsService(
      mockPrisma as PrismaService,
      mockAnalyticsService as AnalyticsService,
      mockBitrixAdapter as IBitrixCrmAdapter,
      mockLogger,
    );
  });

  it('should compile daily performance report successfully', async () => {
    const res = await service.handleDailyPerformanceReport();
    expect(res.success).toBe(true);
    expect(mockAnalyticsService.getConversionRates).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('should not trigger alert when error count is below threshold', async () => {
    mockPrisma.dlqRecord.count.mockResolvedValueOnce(0);
    mockPrisma.lead.count.mockResolvedValueOnce(0);

    const res = await service.handleAutomatedAlerts();
    expect(res.alertTriggered).toBe(false);
    expect(mockBitrixAdapter.sendNotification).not.toHaveBeenCalled();
  });

  it('should trigger alert when dlq records or failed leads exceed threshold', async () => {
    mockPrisma.dlqRecord.count.mockResolvedValueOnce(2);
    mockPrisma.lead.count.mockResolvedValueOnce(5);

    const res = await service.handleAutomatedAlerts();
    expect(res.alertTriggered).toBe(true);
    expect(mockBitrixAdapter.sendNotification).toHaveBeenCalledWith(
      1,
      expect.stringContaining('[ALERT]'),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });
});
