import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  // Calculates overall funnel conversion rates with Redis caching (30s TTL)
  async getConversionRates() {
    const cacheKey = 'analytics:conversion_rates';
    if (this.redisService) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }
    }

    const [totalLeads, syncedLeads, totalDeals, wonDeals] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: { in: ['synced', 'converted'] } } }),
      this.prisma.deal.count(),
      this.prisma.deal.count({ where: { status: 'won' } }),
    ]);

    const leadToDealRate = totalLeads > 0 ? (totalDeals / totalLeads) * 100 : 0;
    const dealToWonRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;
    const endToEndConversionRate = totalLeads > 0 ? (wonDeals / totalLeads) * 100 : 0;

    const result = {
      funnel: {
        totalLeads,
        syncedLeads,
        totalDeals,
        wonDeals,
      },
      rates: {
        leadSyncRate: totalLeads > 0 ? `${((syncedLeads / totalLeads) * 100).toFixed(2)}%` : '0%',
        leadToDealRate: `${leadToDealRate.toFixed(2)}%`,
        dealToWonRate: `${dealToWonRate.toFixed(2)}%`,
        endToEndConversionRate: `${endToEndConversionRate.toFixed(2)}%`,
      },
      calculatedAt: new Date().toISOString(),
    };

    if (this.redisService) {
      await this.redisService.set(cacheKey, JSON.stringify(result), 30);
    }

    return result;
  }

  // Calculates campaign-level metrics: CPL, Revenue, ROI, and Quality Scoring.
  // Uses pre-aggregated campaign metrics, batch queries, and Redis caching (30s TTL) to prevent database bottlenecks.
  async getCampaignPerformance() {
    const cacheKey = 'analytics:campaign_performance';
    if (this.redisService) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }
    }

    let campaigns = await this.prisma.campaignMetric.findMany({
      orderBy: { totalLeads: 'desc' },
    });

    if (campaigns.length === 0) {
      const distinctCampaigns = await this.prisma.lead.findMany({
        where: { campaignId: { not: null } },
        distinct: ['campaignId'],
        select: { campaignId: true, campaignName: true },
      });

      if (distinctCampaigns.length === 0) {
        return [];
      }

      // Single-pass batch aggregation using groupBy across all campaigns (O(1) database trips instead of O(N))
      const [leadCounts, syncedCounts] = await Promise.all([
        this.prisma.lead.groupBy({
          by: ['campaignId'],
          _count: { id: true },
        }),
        this.prisma.lead.groupBy({
          by: ['campaignId'],
          where: { status: { in: ['synced', 'converted'] } },
          _count: { id: true },
        }),
      ]);

      const leadCountMap = new Map(leadCounts.map((l) => [l.campaignId, l._count.id]));
      const syncedCountMap = new Map(syncedCounts.map((s) => [s.campaignId, s._count.id]));

      campaigns = distinctCampaigns.map((c) => ({
        id: c.campaignId as string,
        campaignId: c.campaignId as string,
        campaignName: c.campaignName || 'Campaign',
        totalLeads: leadCountMap.get(c.campaignId) || 0,
        syncedLeads: syncedCountMap.get(c.campaignId) || 0,
        convertedDeals: 0,
        wonDeals: 0,
        totalRevenue: 0 as any,
        estimatedCost: 10000000 as any,
        updatedAt: new Date(),
      }));
    }

    const results = campaigns.map((item) => {
      const leads = Number(item.totalLeads || 0);
      const synced = Number(item.syncedLeads || 0);
      const converted = Number(item.convertedDeals || 0);
      const won = Number(item.wonDeals || 0);
      const revenue = Number(item.totalRevenue || 0);
      const cost = Number(item.estimatedCost || 10000000);

      const cpl = leads > 0 ? cost / leads : 0;
      const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;

      // Campaign quality scoring formula:
      // 40% deal conversion rate + 40% won rate + 20% sync success
      const convRate = leads > 0 ? converted / leads : 0;
      const wonRate = leads > 0 ? won / leads : 0;
      const syncRate = leads > 0 ? synced / leads : 0;
      const qualityScore = Math.min(
        100,
        Math.round((convRate * 40 + wonRate * 40 + syncRate * 20) * 100),
      );

      return {
        campaignId: item.campaignId,
        campaignName: item.campaignName,
        metrics: {
          totalLeads: leads,
          syncedLeads: synced,
          convertedDeals: converted,
          wonDeals: won,
          totalRevenue: revenue,
          estimatedCost: cost,
          cpl: Math.round(cpl),
          costPerLead: Math.round(cpl),
          roi: `${roi.toFixed(2)}%`,
          roiPercentage: `${roi.toFixed(2)}%`,
          qualityScore,
        },
      };
    });

    if (this.redisService) {
      await this.redisService.set(cacheKey, JSON.stringify(results), 30);
    }

    return results;
  }
}
