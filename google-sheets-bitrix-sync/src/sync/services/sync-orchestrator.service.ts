import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service.js';
import { BitrixLeadService, BatchAddLeadItem, BatchUpdateLeadItem } from '../../bitrix/services/bitrix-lead.service.js';
import { MappingService } from '../../mapping/services/mapping.service.js';
import { HashService } from './hash.service.js';
import { LockService } from './lock.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_STATUS_VI, SYSTEM_COLUMNS } from '../../common/constants/sync.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';
import { RowUpdatePayload, SheetRow } from '../../google-sheets/interfaces/sheet-row.interface.js';

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
interface CandidateRow {
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

// Coordinates end-to-end synchronization between Google Sheets and Bitrix24
@Injectable()
export class SyncOrchestratorService {
  private readonly syncHistory: SyncExecutionResult[] = [];
  private readonly historyFilePath = './config/sync-history.json';

  constructor(
    private readonly configService: ConfigService,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly bitrixLeadService: BitrixLeadService,
    private readonly mappingService: MappingService,
    private readonly hashService: HashService,
    private readonly lockService: LockService,
    private readonly logger: AppLogger,
  ) {
    if (process.env.NODE_ENV !== 'test') {
      this.loadHistory();
    }
  }

  // Restores execution history from disk so dashboard displays stats after server restart (keeps 1 latest record)
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const raw = fs.readFileSync(this.historyFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.syncHistory.push(parsed[0]);
        } else if (parsed && typeof parsed === 'object' && parsed.totalRows !== undefined) {
          this.syncHistory.push(parsed);
        }
      }
    } catch {
      // Ignored if file does not exist or cannot be parsed
    }
  }

  // Persists the single latest execution record to disk
  private saveHistory(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const latest = this.syncHistory[0] ? [this.syncHistory[0]] : [];
      fs.writeFileSync(this.historyFilePath, JSON.stringify(latest, null, 2), 'utf-8');
    } catch {
      // Ignored if writing fails
    }
  }

  // Executes the complete synchronization workflow with concurrency protection and Batch API
  async runSync(options: SyncOptions = {}): Promise<SyncExecutionResult> {
    const startTime = Date.now();
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

    let totalRows = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const updates: RowUpdatePayload[] = [];

    try {
      this.mappingService.loadMappingConfig();
      this.logger.log('Starting Google Sheets -> Bitrix24 synchronization pipeline', 'SyncOrchestrator');
      const { rows, systemColumnIndices } = await this.googleSheetsService.readRows();
      totalRows = rows.length;

      const candidates: CandidateRow[] = [];

      // Validates rows and partitions them into SKIP, UPDATE, or CREATE candidates
      for (const row of rows) {
        const transformResult = this.mappingService.transformRow(row.data);

        // Captures validation failures on individual rows without crashing the batch
        if (!transformResult.success) {
          failed++;
          updates.push({
            rowIndex: row.rowIndex,
            status: SYNC_STATUS_VI.FAILED,
            errorMessage: transformResult.errors.join('; '),
            bitrixLeadId: row.systemFields.bitrixLeadId,
            lastSyncTime: new Date().toISOString(),
          });
          continue;
        }

        const newHash = this.hashService.computeHash(transformResult.canonicalData);

        // Skips rows whose SHA-256 checksum matches previous sync unless force flag is set
        if (
          !options.force &&
          row.systemFields.status === SYNC_STATUS_VI.SYNCED &&
          row.systemFields.syncHash === newHash &&
          row.systemFields.bitrixLeadId
        ) {
          skipped++;
          continue;
        }

        // Directly routes rows with existing Bitrix Lead ID to UPDATE (no redundant sequential getLead calls)
        const targetLeadId: number | string | null | undefined = row.systemFields.bitrixLeadId;
        const action: 'CREATE' | 'UPDATE' = targetLeadId ? 'UPDATE' : 'CREATE';

        candidates.push({
          sheetRow: row,
          canonicalData: transformResult.canonicalData,
          bitrixFields: transformResult.bitrixFields,
          newHash,
          email: transformResult.email,
          phone: transformResult.phone,
          title: transformResult.title,
          name: transformResult.name,
          action,
          targetLeadId,
        });
      }

      // Deduplicates CREATE candidates against Bitrix24 by email and phone
      await this.deduplicateCandidates(candidates, updates, () => failed++);

      // Executes Bitrix24 operations using Batch API
      const updateCandidates = candidates.filter((c) => c.action === 'UPDATE' && c.targetLeadId);
      const createCandidates = candidates.filter((c) => c.action === 'CREATE');

      // Process UPDATE candidates via Batch API
      if (updateCandidates.length > 0) {
        const updateBatchItems: BatchUpdateLeadItem[] = updateCandidates.map((c, idx) => ({
          key: `upd_${idx}`,
          id: c.targetLeadId!,
          fields: c.bitrixFields,
        }));

        const updateResult = await this.bitrixLeadService.batchUpdateLeads(updateBatchItems);
        const nowIso = new Date().toISOString();

        for (let i = 0; i < updateCandidates.length; i++) {
          const candidate = updateCandidates[i];
          const key = `upd_${i}`;

          if (updateResult.successes[key] !== undefined) {
            updated++;
            updates.push({
              rowIndex: candidate.sheetRow.rowIndex,
              status: SYNC_STATUS_VI.SYNCED,
              bitrixLeadId: candidate.targetLeadId,
              lastSyncTime: nowIso,
              errorMessage: '',
              syncHash: candidate.newHash,
            });
          } else {
            failed++;
            const errMsg = updateResult.errors[key] || 'Unknown batch update error';
            const isNotFound = /not found|not_found/i.test(errMsg);
            const detailedError = isNotFound
              ? `LỖI: Lead #${candidate.targetLeadId} đã bị xóa trên CRM (Xóa Lead ID trên Sheet nếu muốn tạo mới)`
              : `${ERROR_MESSAGES_VI.BITRIX_API_ERROR_PREFIX}${errMsg}`;

            updates.push({
              rowIndex: candidate.sheetRow.rowIndex,
              status: SYNC_STATUS_VI.FAILED,
              bitrixLeadId: candidate.targetLeadId,
              lastSyncTime: nowIso,
              errorMessage: detailedError,
            });
          }
        }
      }

      // Process CREATE candidates via Batch API
      if (createCandidates.length > 0) {
        const createBatchItems: BatchAddLeadItem[] = createCandidates.map((c, idx) => ({
          key: `add_${idx}`,
          fields: c.bitrixFields,
        }));

        const createResult = await this.bitrixLeadService.batchAddLeads(createBatchItems);
        const nowIso = new Date().toISOString();

        for (let i = 0; i < createCandidates.length; i++) {
          const candidate = createCandidates[i];
          const key = `add_${i}`;
          const newLeadId = createResult.successes[key];

          if (newLeadId) {
            created++;
            updates.push({
              rowIndex: candidate.sheetRow.rowIndex,
              status: SYNC_STATUS_VI.SYNCED,
              bitrixLeadId: newLeadId,
              lastSyncTime: nowIso,
              errorMessage: '',
              syncHash: candidate.newHash,
            });
          } else {
            // Attempts timeout recovery if batch creation failed or timed out
            const recoveredLeadId = await this.attemptTimeoutRecovery(candidate);
            if (recoveredLeadId) {
              created++;
              updates.push({
                rowIndex: candidate.sheetRow.rowIndex,
                status: SYNC_STATUS_VI.SYNCED,
                bitrixLeadId: recoveredLeadId,
                lastSyncTime: nowIso,
                errorMessage: '',
                syncHash: candidate.newHash,
              });
            } else {
              failed++;
              const errMsg = createResult.errors[key] || 'Unknown batch create error';
              updates.push({
                rowIndex: candidate.sheetRow.rowIndex,
                status: SYNC_STATUS_VI.FAILED,
                lastSyncTime: nowIso,
                errorMessage: `${ERROR_MESSAGES_VI.BITRIX_API_ERROR_PREFIX}${errMsg}`,
              });
            }
          }
        }
      }

      // Writes all system status updates back to Google Sheets in one batch
      if (updates.length > 0) {
        await this.googleSheetsService.batchUpdateSystemColumns(updates, systemColumnIndices);
      }

      const durationMs = Date.now() - startTime;
      const result: SyncExecutionResult = {
        totalRows,
        created,
        updated,
        skipped,
        failed,
        durationMs,
        timestamp: new Date().toISOString(),
        direction: 'SHEETS_TO_BITRIX',
      };

      if (typeof this.googleSheetsService?.setCachedRowCount === 'function') {
        this.googleSheetsService.setCachedRowCount(totalRows);
      }
      this.recordLog(result);
      this.logger.printVietnameseSummary(result);
      return result;
    } finally {
      // Releases mutex lock ensuring future sync executions can proceed
      this.lockService.release();
    }
  }

  // Performs reverse synchronization from Bitrix24 back to Google Sheets (Two-Way Sync)
  async syncBitrixToSheets(leadId?: number | string): Promise<SyncExecutionResult> {
    const startTime = Date.now();
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

    this.logger.log('Starting reverse sync: Bitrix24 -> Google Sheets', 'SyncOrchestrator');

    let totalRows = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      this.mappingService.loadMappingConfig();
      const { rows, headers, systemColumnIndices } = await this.googleSheetsService.readRows();
      totalRows = rows.length;

      const bitrixLeads: any[] = [];
      const systemUpdates: RowUpdatePayload[] = [];
      const pendingCellUpdates: Array<{ rowIndex: number; columnValues: Record<string, any> }> = [];
      const newRowsToAppend: any[][] = [];

      if (leadId) {
        const lead = await this.bitrixLeadService.getLead(leadId);
        if (lead) {
          bitrixLeads.push(lead);
        } else {
          // Lead was deleted on Bitrix24
          const deletedRow = rows.find((r) => String(r.systemFields.bitrixLeadId) === String(leadId));
          if (deletedRow) {
            this.logger.warn(`Lead #${leadId} was deleted on Bitrix24. Flagging row ${deletedRow.rowIndex} on Google Sheet`, 'SyncOrchestrator');
            systemUpdates.push({
              rowIndex: deletedRow.rowIndex,
              status: SYNC_STATUS_VI.FAILED,
              bitrixLeadId: leadId,
              lastSyncTime: new Date().toISOString(),
              errorMessage: `LỖI: Lead #${leadId} đã bị xóa trên CRM (Xóa Lead ID trên Sheet nếu muốn tạo mới)`,
              syncHash: deletedRow.systemFields.syncHash || '',
            });
            updated++;
          }
        }
      } else {
        const leads = await this.bitrixLeadService.listLeads({});
        bitrixLeads.push(...leads);
      }

      for (const lead of bitrixLeads) {
        // Finds matching row by Bitrix Lead ID
        let matchedRow = rows.find(
          (r) => String(r.systemFields.bitrixLeadId) === String(lead.ID),
        );

        // Deduplication fallback: if not matched by Lead ID, match by Email or Phone
        if (!matchedRow) {
          const leadEmail = Array.isArray(lead.EMAIL) ? lead.EMAIL[0]?.VALUE : undefined;
          const leadPhone = Array.isArray(lead.PHONE) ? lead.PHONE[0]?.VALUE : undefined;
          if (leadEmail || leadPhone) {
            matchedRow = rows.find((r) => {
              const rEmail = r.data['Email'] || r.data['email'];
              const rPhone = r.data['Số điện thoại'] || r.data['số điện thoại'] || r.data['phone'];
              if (leadEmail && rEmail && String(leadEmail).trim().toLowerCase() === String(rEmail).trim().toLowerCase()) {
                return true;
              }
              if (leadPhone && rPhone) {
                const cleanLead = String(leadPhone).replace(/\D/g, '');
                const cleanRow = String(rPhone).replace(/\D/g, '');
                if (cleanLead && cleanRow && cleanLead === cleanRow) return true;
              }
              return false;
            });
          }
        }

        try {
          const updatedCells = this.mappingService.transformBitrixToRow(lead);
          const transformed = this.mappingService.transformRow(updatedCells);
          const newHash = this.hashService.computeHash(transformed.canonicalData);
          const nowIso = new Date().toISOString();

          if (matchedRow) {
            // Resolves conflict: Last-Write-Wins with cloud clock skew tolerance
            const sheetLastSync = matchedRow.systemFields.lastSyncTime ? new Date(matchedRow.systemFields.lastSyncTime).getTime() : 0;
            const bitrixModified = lead.DATE_MODIFY ? new Date(lead.DATE_MODIFY).getTime() : Date.now();
            const CLOCK_SKEW_TOLERANCE_MS = 30000;
            const isBitrixNewer = bitrixModified + CLOCK_SKEW_TOLERANCE_MS >= sheetLastSync;
            const hasDataChanged = newHash !== matchedRow.systemFields.syncHash;

            if (isBitrixNewer || hasDataChanged) {
              pendingCellUpdates.push({ rowIndex: matchedRow.rowIndex, columnValues: updatedCells });

              systemUpdates.push({
                rowIndex: matchedRow.rowIndex,
                status: SYNC_STATUS_VI.SYNCED,
                bitrixLeadId: lead.ID,
                lastSyncTime: nowIso,
                errorMessage: '',
                syncHash: newHash,
              });
              updated++;
            }
          } else {
            // Brand new lead created directly on Bitrix24 -> Append to Google Sheet!
            const newRowValues = Array.from<string>({ length: headers.length }).fill('');
            headers.forEach((header, colIdx) => {
              if (updatedCells[header] !== undefined) {
                newRowValues[colIdx] = String(updatedCells[header]);
              }
            });

            const statusCol = systemColumnIndices[SYSTEM_COLUMNS.STATUS];
            if (statusCol !== undefined) newRowValues[statusCol] = SYNC_STATUS_VI.SYNCED;

            const bitrixIdCol = systemColumnIndices[SYSTEM_COLUMNS.BITRIX_ID];
            if (bitrixIdCol !== undefined) newRowValues[bitrixIdCol] = String(lead.ID);

            const lastSyncCol = systemColumnIndices[SYSTEM_COLUMNS.LAST_SYNC];
            if (lastSyncCol !== undefined) newRowValues[lastSyncCol] = nowIso;

            const errorCol = systemColumnIndices[SYSTEM_COLUMNS.ERROR];
            if (errorCol !== undefined) newRowValues[errorCol] = '';

            const hashCol = systemColumnIndices[SYSTEM_COLUMNS.HASH];
            if (hashCol !== undefined) newRowValues[hashCol] = newHash;

            newRowsToAppend.push(newRowValues);
            created++;
            this.logger.log(`Created new Google Sheet row for Bitrix lead #${lead.ID} (${lead.TITLE || lead.NAME})`, 'SyncOrchestrator');
          }
        } catch (err: any) {
          failed++;
          this.logger.error(`Failed to process Bitrix lead #${lead.ID} to Sheet: ${err.message}`, err.stack, 'SyncOrchestrator');
        }
      }

      // Appends brand new rows to Google Sheets
      if (newRowsToAppend.length > 0) {
        if (typeof this.googleSheetsService.appendRows === 'function') {
          await this.googleSheetsService.appendRows(newRowsToAppend);
        }
      }

      // Batch writes all updated business cells across all rows in a single API call
      if (pendingCellUpdates.length > 0) {
        if (typeof this.googleSheetsService.batchUpdateRowsCells === 'function') {
          await this.googleSheetsService.batchUpdateRowsCells(pendingCellUpdates, headers);
        } else {
          for (const item of pendingCellUpdates) {
            await this.googleSheetsService.updateRowCells(item.rowIndex, item.columnValues, headers);
          }
        }
      }

      if (systemUpdates.length > 0) {
        await this.googleSheetsService.batchUpdateSystemColumns(systemUpdates, systemColumnIndices);
      }

      const durationMs = Date.now() - startTime;
      const result: SyncExecutionResult = {
        totalRows: totalRows + created,
        created,
        updated,
        skipped: Math.max(0, totalRows - updated - failed),
        failed,
        durationMs,
        timestamp: new Date().toISOString(),
        direction: 'BITRIX_TO_SHEETS',
      };

      this.recordLog(result);
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
    return [...this.syncHistory];
  }

  // Returns the most recent sync execution result
  getLastResult(): SyncExecutionResult | null {
    return this.syncHistory[0] || null;
  }

  private recordLog(res: SyncExecutionResult): void {
    this.syncHistory.length = 0;
    this.syncHistory.push(res);
    this.saveHistory();
  }

  // Deduplicates candidates against Bitrix communications using batch query and handles conflicts
  private async deduplicateCandidates(
    candidates: CandidateRow[],
    updates: RowUpdatePayload[],
    onConflict: () => void,
  ): Promise<void> {
    const createCandidates = candidates.filter((c) => c.action === 'CREATE');
    if (createCandidates.length === 0) return;

    const emails = createCandidates.map((c) => c.email).filter(Boolean) as string[];
    const phones = createCandidates.map((c) => c.phone).filter(Boolean) as string[];

    let emailMap: Record<string, number> = {};
    let phoneMap: Record<string, number> = {};

    if (typeof this.bitrixLeadService.findDuplicatesMap === 'function') {
      const dupRes = await this.bitrixLeadService.findDuplicatesMap(emails, phones);
      emailMap = dupRes.emailMap;
      phoneMap = dupRes.phoneMap;
    } else {
      const emailMatches = await this.bitrixLeadService.findByCommunication('EMAIL', emails);
      const phoneMatches = await this.bitrixLeadService.findByCommunication('PHONE', phones);
      for (const candidate of createCandidates) {
        if (candidate.email && emailMatches.length > 0) {
          const found = await this.bitrixLeadService.findByCommunication('EMAIL', [candidate.email]);
          if (found && found[0]) emailMap[candidate.email.toLowerCase()] = found[0];
        }
        if (candidate.phone && phoneMatches.length > 0) {
          const found = await this.bitrixLeadService.findByCommunication('PHONE', [candidate.phone]);
          if (found && found[0]) phoneMap[candidate.phone] = found[0];
        }
      }
    }

    for (const candidate of createCandidates) {
      const matchedByEmail = candidate.email ? emailMap[candidate.email.toLowerCase()] : undefined;
      const matchedByPhone = candidate.phone ? phoneMap[candidate.phone] : undefined;

      // Flags conflict when email matches lead A while phone matches lead B
      if (matchedByEmail && matchedByPhone && matchedByEmail !== matchedByPhone) {
        onConflict();
        candidate.action = 'CONFLICT';
        updates.push({
          rowIndex: candidate.sheetRow.rowIndex,
          status: SYNC_STATUS_VI.FAILED,
          errorMessage: ERROR_MESSAGES_VI.DEDUP_CONFLICT,
          lastSyncTime: new Date().toISOString(),
        });
        continue;
      }

      const existingLeadId = matchedByEmail || matchedByPhone;
      if (existingLeadId) {
        this.logger.log(
          `Deduplication match found: Row ${candidate.sheetRow.rowIndex} linked to Lead #${existingLeadId}`,
          'SyncOrchestrator',
        );
        candidate.action = 'UPDATE';
        candidate.targetLeadId = existingLeadId;
      }
    }
  }

  // Verifies lead ownership using title/name match after a post-create timeout
  private async attemptTimeoutRecovery(candidate: CandidateRow): Promise<number | null> {
    try {
      this.logger.warn(
        `Attempting two-phase post-create timeout recovery for row ${candidate.sheetRow.rowIndex}`,
        'SyncOrchestrator',
      );

      const matchedIds: number[] = [];
      if (candidate.email) {
        const res = await this.bitrixLeadService.findByCommunication('EMAIL', [candidate.email]);
        matchedIds.push(...res);
      }
      if (candidate.phone) {
        const res = await this.bitrixLeadService.findByCommunication('PHONE', [candidate.phone]);
        matchedIds.push(...res);
      }

      // Verifies title or name matches before adopting newly created lead
      for (const id of matchedIds) {
        const lead = await this.bitrixLeadService.getLead(id);
        if (lead) {
          const titleMatch = candidate.title && lead.TITLE === candidate.title;
          const nameMatch = candidate.name && lead.NAME === candidate.name;
          if (titleMatch || nameMatch) {
            this.logger.log(`Verified ownership of recovered Lead #${id}`, 'SyncOrchestrator');
            return id;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

