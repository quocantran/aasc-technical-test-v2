import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Optional, HttpException } from '@nestjs/common';
import { SyncOrchestratorService } from '../services/sync-orchestrator.service.js';
import { LockService } from '../services/lock.service.js';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service.js';

// DTO for manually triggering synchronization
export interface TriggerSyncDto {
  force?: boolean;
}

// REST controller exposing manual sync triggers and execution status inspection
@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly lockService: LockService,
    @Optional() private readonly googleSheetsService?: GoogleSheetsService,
  ) {}

  // Triggers synchronization pipeline on-demand; waits briefly if lock held by background webhook
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerSync(
    @Body() body?: TriggerSyncDto,
    @Query('force') forceQuery?: string,
  ) {
    const isForce = body?.force === true || forceQuery === 'true';

    // Waits briefly (up to 3s) if a short background sync or webhook is currently running
    let attempts = 0;
    while (this.lockService.isLocked() && attempts < 6) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (this.lockService.isLocked()) {
      return {
        status: 'warning',
        message: 'Đang có một tiến trình đồng bộ đang chạy, vui lòng thử lại sau',
        isSkippedDueToLock: true,
        data: {
          isSkippedDueToLock: true,
          totalRows: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          durationMs: 0,
          timestamp: new Date().toISOString(),
          direction: 'SHEETS_TO_BITRIX',
        },
      };
    }

    try {
      const result = await this.syncOrchestrator.runSync({ force: isForce });

      return {
        status: 'success',
        message: 'Đồng bộ Google Sheets -> Bitrix24 hoàn tất',
        data: result,
      };
    } catch (err: any) {
      throw new HttpException(err.message || 'Lỗi trong quá trình đồng bộ', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Triggers reverse sync from Bitrix24 to Google Sheets on-demand
  @Post('reverse')
  @HttpCode(HttpStatus.OK)
  async triggerReverseSync(@Query('leadId') leadId?: string) {
    let attempts = 0;
    while (this.lockService.isLocked() && attempts < 6) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (this.lockService.isLocked()) {
      return {
        status: 'warning',
        message: 'Đang có một tiến trình đồng bộ đang chạy, vui lòng thử lại sau',
        isSkippedDueToLock: true,
        data: {
          isSkippedDueToLock: true,
          totalRows: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          durationMs: 0,
          timestamp: new Date().toISOString(),
          direction: 'BITRIX_TO_SHEETS',
        },
      };
    }

    const id = leadId ? Number(leadId) : undefined;
    const result = await this.syncOrchestrator.syncBitrixToSheets(id);
    return {
      status: 'success',
      message: 'Đồng bộ Bitrix24 -> Google Sheets hoàn tất',
      data: result,
    };
  }

  // Returns current lock state and statistics from last sync run (cached from sheet)
  @Get('status')
  async getStatus() {
    const lastResult = this.syncOrchestrator.getLastResult();
    let currentTotalRows = lastResult?.totalRows ?? 0;

    if (this.googleSheetsService) {
      try {
        const count = await this.googleSheetsService.getRowCount();
        if (count > 0 || !lastResult) {
          currentTotalRows = count;
        }
      } catch {
        // Fall back to lastResult count
      }
    }

    return {
      isRunning: this.lockService.isLocked(),
      lastRunTime: lastResult?.timestamp || null,
      lastResult: lastResult || null,
      currentTotalRows: currentTotalRows,
    };
  }
}
