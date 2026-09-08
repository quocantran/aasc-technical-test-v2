import { SheetRow, RowUpdatePayload } from '../../google-sheets/interfaces/sheet-row.interface.js';

// Execution options for sync trigger
export interface SyncOptions {
  force?: boolean;
}

// Summary result returned after sync pipeline execution
export interface SyncExecutionResult {
  isSkippedDueToLock?: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  timestamp?: string;
  direction?: string;
}

// Internal representation of a partitioned row awaiting sync execution
export interface CandidateRow {
  sheetRow: SheetRow;
  canonicalData: Record<string, any>;
  bitrixFields: Record<string, any>;
  newHash: string;
  email?: string;
  phone?: string;
  title?: string;
  name?: string;
  action: 'CREATE' | 'UPDATE' | 'CONFLICT';
  targetLeadId?: number | string | null;
}

// Segregated interface for sync history management and persistence (ISP)
export interface ISyncHistoryService {
  record(result: SyncExecutionResult): void;
  getRecentLogs(): SyncExecutionResult[];
  getLastResult(): SyncExecutionResult | null;
}

// Segregated interface for candidate deduplication and timeout recovery (ISP)
export interface IDeduplicationService {
  deduplicateCandidates(
    candidates: CandidateRow[],
    updates: RowUpdatePayload[],
    onConflict: () => void,
  ): Promise<void>;
  attemptTimeoutRecovery(candidate: CandidateRow): Promise<number | null>;
}

// Segregated interface for forward sync pipeline execution (ISP)
export interface IForwardSyncService {
  execute(options?: SyncOptions): Promise<SyncExecutionResult>;
}

// Segregated interface for reverse sync pipeline execution (ISP)
export interface IReverseSyncService {
  execute(leadId?: number | string): Promise<SyncExecutionResult>;
}
