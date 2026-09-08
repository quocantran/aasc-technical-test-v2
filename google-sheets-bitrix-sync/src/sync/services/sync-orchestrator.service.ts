import { Injectable } from '@nestjs/common';
import { LockService } from './lock.service.js';
import { ForwardSyncService } from './forward-sync.service.js';
import { ReverseSyncService } from './reverse-sync.service.js';
import { SyncHistoryService } from './sync-history.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SyncOptions, SyncExecutionResult } from '../interfaces/sync.interface.js';

// Re-export interface types for backward compatibility across the codebase
export type { SyncOptions, SyncExecutionResult, CandidateRow } from '../interfaces/sync.interface.js';

// Coordinates and facades synchronization workflows between Google Sheets and Bitrix24 (SOLID / DIP / Facade)
@Injectable()
export class SyncOrchestratorService {
  constructor(
    private readonly lockService: LockService,
    private readonly forwardSyncService: ForwardSyncService,
    private readonly reverseSyncService: ReverseSyncService,
    private readonly syncHistoryService: SyncHistoryService,
    private readonly logger: AppLogger,
  ) {}

  // Executes the complete forward synchronization workflow with concurrency protection (Google Sheets -> Bitrix24)
  async runSync(options: SyncOptions = {}): Promise<SyncExecutionResult> {
    const lockAcquired = this.lockService.acquire();

    // Aborts execution if another sync process currently holds the lock
    if (!lockAcquired) {
      this.logger.warn('Sync job skipped: another synchronization is currently running', 'SyncOrchestrator');
      return {
        isSkippedDueToLock: true,
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 0,
        timestamp: new Date().toISOString(),
        direction: 'SHEETS_TO_BITRIX',
      };
    }

    try {
      const result = await this.forwardSyncService.execute(options);
      this.syncHistoryService.record(result);
      this.logger.printVietnameseSummary(result);
      return result;
    } finally {
      this.lockService.release();
    }
  }

  // Performs reverse synchronization from Bitrix24 back to Google Sheets (Two-Way Sync)
  async syncBitrixToSheets(leadId?: number | string): Promise<SyncExecutionResult> {
    const lockAcquired = this.lockService.acquire();

    if (!lockAcquired) {
      this.logger.warn('Reverse sync skipped: another synchronization is currently running', 'SyncOrchestrator');
      return {
        isSkippedDueToLock: true,
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 0,
        timestamp: new Date().toISOString(),
        direction: 'BITRIX_TO_SHEETS',
      };
    }

    try {
      const result = await this.reverseSyncService.execute(leadId);
      this.syncHistoryService.record(result);
      return result;
    } catch (error: any) {
      this.logger.error(`Two-way sync failed: ${error.message}`, error.stack, 'SyncOrchestrator');
      throw error;
    } finally {
      this.lockService.release();
    }
  }

  // Returns recent sync execution history for Web Admin UI
  getRecentLogs(): SyncExecutionResult[] {
    return this.syncHistoryService.getRecentLogs();
  }

  // Returns the most recent sync execution result
  getLastResult(): SyncExecutionResult | null {
    return this.syncHistoryService.getLastResult();
  }
}
