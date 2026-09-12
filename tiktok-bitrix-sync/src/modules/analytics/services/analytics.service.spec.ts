import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      deal: {
        count: jest.fn(),
      },
      campaignMetric: {
        findMany: jest.fn(),
      },
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    analyticsService = new AnalyticsService(mockPrisma as PrismaService, mockRedis as RedisService);
  });

  describe('getConversionRates', () => {
    it('should return cached conversion rates when available in Redis', async () => {
      const cachedData = {
        funnel: { totalLeads: 50, syncedLeads: 40, totalDeals: 20, wonDeals: 10 },
        rates: { leadSyncRate: '80.00%', leadToDealRate: '40.00%', dealToWonRate: '50.00%', endToEndConversionRate: '20.00%' },
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const res = await analyticsService.getConversionRates();
      expect(res).toEqual(cachedData);
      expect(mockPrisma.lead.count).not.toHaveBeenCalled();
    });

    it('should ignore corrupted JSON cache and recompute conversion rates', async () => {
      mockRedis.get.mockResolvedValueOnce('invalid-json{{');
      mockPrisma.lead.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
      mockPrisma.deal.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

      const res = await analyticsService.getConversionRates();
      expect(res.funnel.totalLeads).toBe(10);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle zero leads without divide-by-zero errors', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);
      mockPrisma.deal.count.mockResolvedValue(0);

      const res = await analyticsService.getConversionRates();
      expect(res.funnel.totalLeads).toBe(0);
      expect(res.rates.leadSyncRate).toBe('0%');
      expect(res.rates.leadToDealRate).toBe('0.00%');
      expect(res.rates.dealToWonRate).toBe('0.00%');
      expect(res.rates.endToEndConversionRate).toBe('0.00%');
    });

    it('should work without optional RedisService', async () => {
      const serviceNoRedis = new AnalyticsService(mockPrisma as PrismaService);
      mockPrisma.lead.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      mockPrisma.deal.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

      const res = await serviceNoRedis.getConversionRates();
      expect(res.funnel.totalLeads).toBe(10);
    });
  });

  describe('getCampaignPerformance', () => {
    it('should return cached campaign performance when available in Redis', async () => {
      const cachedCampaigns = [{ campaignId: 'c1', metrics: { costPerLead: 50000 } }];
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedCampaigns));

      const res = await analyticsService.getCampaignPerformance();
      expect(res).toEqual(cachedCampaigns);
      expect(mockPrisma.campaignMetric.findMany).not.toHaveBeenCalled();
    });

    it('should ignore corrupted JSON cache and query database for campaign performance', async () => {
      mockRedis.get.mockResolvedValueOnce('{bad-json');
      mockPrisma.campaignMetric.findMany.mockResolvedValueOnce([
        {
          campaignId: 'c1',
          campaignName: 'Promo',
          totalLeads: 20,
          syncedLeads: 18,
          convertedDeals: 10,
          wonDeals: 5,
          totalRevenue: 30000000,
          estimatedCost: 10000000,
        },
      ]);

      const res = await analyticsService.getCampaignPerformance();
      expect(res).toHaveLength(1);
      expect(res[0].metrics.costPerLead).toBe(500000);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should fallback to distinct leads aggregation when campaignMetric table is empty', async () => {
      mockPrisma.campaignMetric.findMany.mockResolvedValueOnce([]); // empty
      mockPrisma.lead.findMany.mockResolvedValueOnce([
        { campaignId: 'c_lead_1', campaignName: 'Summer Sale' },
      ]);

      mockPrisma.lead.groupBy
        .mockResolvedValueOnce([{ campaignId: 'c_lead_1', _count: { id: 10 } }]) // totalLeads
        .mockResolvedValueOnce([{ campaignId: 'c_lead_1', _count: { id: 8 } }]); // syncedLeads

      const res = await analyticsService.getCampaignPerformance();
      expect(res).toHaveLength(1);
      expect(res[0].campaignId).toBe('c_lead_1');
      expect(res[0].metrics.totalLeads).toBe(10);
      expect(res[0].metrics.syncedLeads).toBe(8);
    });

    it('should return empty array when both campaignMetric and distinct leads are empty', async () => {
      mockPrisma.campaignMetric.findMany.mockResolvedValueOnce([]);
      mockPrisma.lead.findMany.mockResolvedValueOnce([]);

      const res = await analyticsService.getCampaignPerformance();
      expect(res).toEqual([]);
    });

    it('should handle zero leads and zero cost calculations gracefully', async () => {
      mockPrisma.campaignMetric.findMany.mockResolvedValueOnce([
        {
          campaignId: 'c_zero',
          campaignName: null,
          totalLeads: 0,
          syncedLeads: 0,
          convertedDeals: 0,
          wonDeals: 0,
          totalRevenue: 0,
          estimatedCost: 0,
        },
      ]);

      const res = await analyticsService.getCampaignPerformance();
      expect(res[0].metrics.costPerLead).toBe(0);
      expect(res[0].metrics.roiPercentage).toBe('-100.00%');
      expect(res[0].metrics.qualityScore).toBe(0);
    });
  });
});
