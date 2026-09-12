import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from '../services/analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: any;

  beforeEach(() => {
    mockAnalyticsService = {
      getConversionRates: jest.fn(),
      getCampaignPerformance: jest.fn(),
    };
    controller = new AnalyticsController(mockAnalyticsService as AnalyticsService);
  });

  it('should delegate getConversionRates to analyticsService.getConversionRates', async () => {
    const expected = {
      funnel: { totalLeads: 100, syncedLeads: 95, totalDeals: 40, wonDeals: 15 },
      rates: { syncRate: '95.00%', leadToDealRate: '40.00%', winRate: '37.50%' },
    };
    mockAnalyticsService.getConversionRates.mockResolvedValueOnce(expected);

    const result = await controller.getConversionRates();
    expect(result).toBe(expected);
    expect(mockAnalyticsService.getConversionRates).toHaveBeenCalled();
  });

  it('should delegate getCampaignPerformance to analyticsService.getCampaignPerformance', async () => {
    const expected = [
      {
        campaignId: 'c-1',
        metrics: { totalLeads: 50, cpl: 200000, roiPercentage: '150.00%', qualityScore: 85 },
      },
    ];
    mockAnalyticsService.getCampaignPerformance.mockResolvedValueOnce(expected);

    const result = await controller.getCampaignPerformance();
    expect(result).toBe(expected);
    expect(mockAnalyticsService.getCampaignPerformance).toHaveBeenCalled();
  });
});
