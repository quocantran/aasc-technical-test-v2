import { Injectable } from '@nestjs/common';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service.js';
import { BitrixLeadService, BatchAddLeadItem, BatchUpdateLeadItem } from '../../bitrix/services/bitrix-lead.service.js';
import { MappingService } from '../../mapping/services/mapping.service.js';
import { HashService } from './hash.service.js';
import { DeduplicationService } from './deduplication.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_STATUS_VI } from '../../common/constants/sync.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';
import { RowUpdatePayload } from '../../google-sheets/interfaces/sheet-row.interface.js';
import { formatSyncDateTime } from '../../common/utils/date.helper.js';
import {
  SyncOptions,
  SyncExecutionResult,
  CandidateRow,
  IForwardSyncService,
} from '../interfaces/sync.interface.js';

// Executes the forward sync pipeline from Google Sheets to Bitrix24 CRM (SRP)
@Injectable()
export class ForwardSyncService implements IForwardSyncService {
  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly bitrixLeadService: BitrixLeadService,
    private readonly mappingService: MappingService,
    private readonly hashService: HashService,
    private readonly deduplicationService: DeduplicationService,
    private readonly logger: AppLogger,
  ) {}

  // Executes the complete forward synchronization workflow
  async execute(options: SyncOptions = {}): Promise<SyncExecutionResult> {
    const startTime = Date.now();
    let totalRows = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const updates: RowUpdatePayload[] = [];

    this.mappingService.loadMappingConfig();
    this.logger.log('Starting Google Sheets -> Bitrix24 synchronization pipeline', 'ForwardSyncService');
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
          lastSyncTime: formatSyncDateTime(),
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

      // Directly routes rows with existing Bitrix Lead ID to UPDATE
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
    await this.deduplicationService.deduplicateCandidates(candidates, updates, () => failed++);

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
      const nowFormatted = formatSyncDateTime();

      for (let i = 0; i < updateCandidates.length; i++) {
        const candidate = updateCandidates[i];
        const key = `upd_${i}`;

        if (updateResult.successes[key] !== undefined) {
          updated++;
          updates.push({
            rowIndex: candidate.sheetRow.rowIndex,
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: candidate.targetLeadId,
            lastSyncTime: nowFormatted,
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
            lastSyncTime: nowFormatted,
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
      const nowFormatted = formatSyncDateTime();

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
            lastSyncTime: nowFormatted,
            errorMessage: '',
            syncHash: candidate.newHash,
          });
        } else {
          // Attempts timeout recovery if batch creation failed or timed out
          const recoveredLeadId = await this.deduplicationService.attemptTimeoutRecovery(candidate);
          if (recoveredLeadId) {
            created++;
            updates.push({
              rowIndex: candidate.sheetRow.rowIndex,
              status: SYNC_STATUS_VI.SYNCED,
              bitrixLeadId: recoveredLeadId,
              lastSyncTime: nowFormatted,
              errorMessage: '',
              syncHash: candidate.newHash,
            });
          } else {
            failed++;
            const errMsg = createResult.errors[key] || 'Unknown batch create error';
            updates.push({
              rowIndex: candidate.sheetRow.rowIndex,
              status: SYNC_STATUS_VI.FAILED,
              lastSyncTime: nowFormatted,
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
    if (typeof this.googleSheetsService?.setCachedRowCount === 'function') {
      this.googleSheetsService.setCachedRowCount(totalRows);
    }

    return {
      totalRows,
      created,
      updated,
      skipped,
      failed,
      durationMs,
      timestamp: new Date().toISOString(),
      direction: 'SHEETS_TO_BITRIX',
    };
  }
}
