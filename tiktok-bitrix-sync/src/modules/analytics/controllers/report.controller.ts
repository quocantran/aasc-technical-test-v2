import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportExportService } from '../services/report-export.service';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';

@ApiTags('Reports')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportExportService: ReportExportService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export lead and deal data to CSV or JSON format' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'excel', 'json'], example: 'csv' })
  @ApiQuery({ name: 'date_range', required: false, enum: ['7d', '30d', '90d', 'all'], example: '30d' })
  @ApiResponse({ status: 200, description: 'Exported file stream or JSON data' })
  async exportReport(
    @Query('format') format = 'csv',
    @Query('date_range') dateRange = '30d',
    @Res() res: Response,
  ) {
    const isExcel = format.toLowerCase() === 'excel';
    const isJson = format.toLowerCase() === 'json';

    if (isJson) {
      const result = await this.reportExportService.exportLeads('json', dateRange);
      return res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    }

    // Stream CSV/Excel rows directly into client socket preventing Heap Out-Of-Memory on large datasets
    return await this.reportExportService.streamCsvExport(res, dateRange, isExcel);
  }
}
