import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';

@ApiTags('Analytics')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('conversion-rates')
  @ApiOperation({ summary: 'Get overall conversion rates from TikTok leads to Deal won' })
  @ApiResponse({ status: 200, description: 'Funnel metrics and percentage conversion rates' })
  async getConversionRates() {
    return this.analyticsService.getConversionRates();
  }

  @Get('campaign-performance')
  @ApiOperation({ summary: 'Get campaign-level metrics: CPL, Revenue, ROI and Quality Score' })
  @ApiResponse({ status: 200, description: 'Campaign performance list' })
  async getCampaignPerformance() {
    return this.analyticsService.getCampaignPerformance();
  }
}
