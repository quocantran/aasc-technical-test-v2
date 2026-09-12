import { Module } from '@nestjs/common';
import { AnalyticsController } from './controllers/analytics.controller';
import { ReportController } from './controllers/report.controller';
import { AnalyticsService } from './services/analytics.service';
import { ReportExportService } from './services/report-export.service';
import { ScheduledReportsService } from './services/scheduled-reports.service';
import { BitrixModule } from '../bitrix/bitrix.module';

@Module({
  imports: [BitrixModule],
  controllers: [AnalyticsController, ReportController],
  providers: [AnalyticsService, ReportExportService, ScheduledReportsService],
  exports: [AnalyticsService, ReportExportService, ScheduledReportsService],
})
export class AnalyticsModule {}

