import { Injectable } from '@nestjs/common';
import { LockService } from './lock.service.js';
import { ForwardSyncService } from './forward-sync.service.js';
import { ReverseSyncService } from './reverse-sync.service.js';
import { SyncHistoryService } from './sync-history.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SyncOptions, SyncExecutionResult } from '../interfaces/sync.interface.js';
import { SYNC_DEFAULTS, SYNC_DIRECTIONS } from '../../common/constants/sync.constants.js';

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

  private readonly recentSyncedLeadIds = new Map<string, number>();
  private readonly RECENT_SYNC_TTL_MS = SYNC_DEFAULTS.RECENT_SYNC_TTL_MS;

  // Marks a lead ID as recently created or updated by this system to suppress echo webhooks
  markLeadAsRecentlySynced(leadId: string | number): void {
    if (leadId === undefined || leadId === null || leadId === '') return;
    this.cleanExpiredRecentLeads();
    this.recentSyncedLeadIds.set(String(leadId), Date.now());
  }

  // Checks whether a lead ID was recently created or updated by this system
  isLeadRecentlySynced(leadId: string | number): boolean {
    if (leadId === undefined || leadId === null || leadId === '') return false;
    this.cleanExpiredRecentLeads();
    return this.recentSyncedLeadIds.has(String(leadId));
  }

  // Consumes a recently synced lead ID once its self-echo webhook has arrived
  consumeRecentlySyncedLead(leadId: string | number): void {
    if (leadId === undefined || leadId === null || leadId === '') return;
    this.recentSyncedLeadIds.delete(String(leadId));
  }

  private cleanExpiredRecentLeads(): void {
    const now = Date.now();
    for (const [id, time] of this.recentSyncedLeadIds.entries()) {
      if (now - time > this.RECENT_SYNC_TTL_MS) {
        this.recentSyncedLeadIds.delete(id);
      }
    }
  }

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
        direction: SYNC_DIRECTIONS.SHEETS_TO_BITRIX,
      };
    }

    try {
      const result = await this.forwardSyncService.execute(options);
      if (result.syncedLeadIds && result.syncedLeadIds.length > 0) {
        for (const id of result.syncedLeadIds) {
          this.markLeadAsRecentlySynced(id);
        }
      }
      await this.syncHistoryService.record(result);
      this.logger.printVietnameseSummary(result);
      return result;
    } finally {
      this.lockService.release();
    }
  }

  private readonly pendingReverseSyncIds = new Set<string | number>();

  // Performs reverse synchronization from Bitrix24 back to Google Sheets (Two-Way Sync)
  async syncBitrixToSheets(leadId?: number | string | (number | string)[]): Promise<SyncExecutionResult> {
    if (leadId !== undefined && leadId !== null && leadId !== '') {
      if (Array.isArray(leadId)) {
        leadId.forEach((id) => this.pendingReverseSyncIds.add(id));
      } else {
        this.pendingReverseSyncIds.add(leadId);
      }
    }

    // Debounce brief burst of concurrent webhooks in non-test mode (e.g. bulk delete in CRM)
    const debounceMs = process.env.NODE_ENV === 'test' ? 0 : 350;
    if (debounceMs > 0 && leadId !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, debounceMs));
    }

    const lockTimeoutMs = process.env.NODE_ENV === 'test' ? SYNC_DEFAULTS.TEST_LOCK_TIMEOUT_MS : SYNC_DEFAULTS.LOCK_TIMEOUT_MS;
    const lockAcquired = await this.waitForLock(lockTimeoutMs);

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
        direction: SYNC_DIRECTIONS.BITRIX_TO_SHEETS,
      };
    }

    try {
      let idsToProcess: (number | string)[] | undefined = undefined;
      if (this.pendingReverseSyncIds.size > 0) {
        idsToProcess = Array.from(this.pendingReverseSyncIds);
        this.pendingReverseSyncIds.clear();
      } else if (leadId !== undefined) {
        idsToProcess = Array.isArray(leadId) ? leadId : [leadId];
      }

      const result = await this.reverseSyncService.execute(idsToProcess);
      await this.syncHistoryService.record(result);
      this.logger.printVietnameseSummary(result);
      return result;
    } catch (error: any) {
      this.logger.error(`Two-way sync failed: ${error.message}`, error.stack, 'SyncOrchestrator');
      throw error;
    } finally {
      this.lockService.release();
    }
  }

  // Polls until lock is acquired or timeout expires
  private async waitForLock(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (this.lockService.acquire()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  // Returns recent sync execution history for Web Admin UI (defaults to 20)
  getRecentLogs(limit = 20): SyncExecutionResult[] {
    return this.syncHistoryService.getRecentLogs(limit);
  }

  // Returns the most recent sync execution result
  getLastResult(): SyncExecutionResult | null {
    return this.syncHistoryService.getLastResult();
  }
}
