import { Injectable, Inject, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { AnalyticsService } from './analytics.service';
import { BITRIX_ADAPTER, IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';

@Injectable()
export class ScheduledReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    @Inject(BITRIX_ADAPTER)
    private readonly bitrixAdapter: IBitrixCrmAdapter,
    @Optional() private readonly logger?: AppLogger,
  ) {}

  // Runs daily at midnight to calculate funnel statistics and persist metrics.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'daily-performance-report' })
  async handleDailyPerformanceReport() {
    this.logger?.log('Running scheduled daily performance report generation...', 'ScheduledReportsService');

    try {
      const conversionStats = await this.analyticsService.getConversionRates();
      const campaignPerformance = await this.analyticsService.getCampaignPerformance();

      await this.prisma.auditLog.create({
        data: {
          action: 'DAILY_PERFORMANCE_REPORT',
          entityType: 'ANALYTICS',
          details: {
            funnel: conversionStats.funnel,
            rates: conversionStats.rates,
            topCampaigns: campaignPerformance.slice(0, 5),
            generatedAt: new Date().toISOString(),
          },
        },
      });

      this.logger?.log(
        `Daily report compiled successfully: ${conversionStats.funnel.totalLeads} total leads, ${conversionStats.rates.endToEndConversionRate} end-to-end conversion rate`,
        'ScheduledReportsService',
      );

      return { success: true, timestamp: new Date() };
    } catch (err: any) {
      this.logger?.error(`Failed to generate scheduled report: ${err.message}`, err.stack, 'ScheduledReportsService');
      return { success: false, error: err.message };
    }
  }

  // Periodically evaluates DLQ and failure rates to dispatch alerts.
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'health-and-alert-monitor' })
  async handleAutomatedAlerts() {
    this.logger?.debug('Evaluating automated alert thresholds...', 'ScheduledReportsService');

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // 1. Check recent unresolved DLQ records
      const unresolvedDlqCount = await this.prisma.dlqRecord.count({
        where: {
          resolved: false,
          createdAt: { gte: oneHourAgo },
        },
      });

      // 2. Check failed leads in the last hour
      const recentFailedLeadsCount = await this.prisma.lead.count({
        where: {
          status: 'failed',
          updatedAt: { gte: oneHourAgo },
        },
      });

      // Alert threshold condition
      if (unresolvedDlqCount > 0 || recentFailedLeadsCount >= 3) {
        const alertMessage = `[ALERT] High error rate detected in TikTok-Bitrix24 integration! Unresolved DLQ: ${unresolvedDlqCount}, Failed Leads (past hour): ${recentFailedLeadsCount}. Check DLQ and application logs immediately.`;

        this.logger?.warn(alertMessage, 'ScheduledReportsService');

        // Send alert notification to Bitrix24 Administrator (user ID: 1)
        await this.bitrixAdapter.sendNotification(1, alertMessage);

        // Record alert in Audit Log
        await this.prisma.auditLog.create({
          data: {
            action: 'SYSTEM_ALERT_DISPATCHED',
            entityType: 'ALERT',
            details: {
              unresolvedDlqCount,
              recentFailedLeadsCount,
              alertMessage,
              timestamp: new Date().toISOString(),
            },
          },
        });

        return { alertTriggered: true, unresolvedDlqCount, recentFailedLeadsCount };
      }

      return { alertTriggered: false };
    } catch (err: any) {
      this.logger?.error(`Automated alert check failed: ${err.message}`, err.stack, 'ScheduledReportsService');
      return { alertTriggered: false, error: err.message };
    }
  }
}
