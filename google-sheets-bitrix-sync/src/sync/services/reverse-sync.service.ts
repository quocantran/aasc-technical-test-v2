import { Injectable } from '@nestjs/common';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service.js';
import { BitrixLeadService } from '../../bitrix/services/bitrix-lead.service.js';
import { MappingService } from '../../mapping/services/mapping.service.js';
import { HashService } from './hash.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_STATUS_VI, SYSTEM_COLUMNS } from '../../common/constants/sync.constants.js';
import { RowUpdatePayload } from '../../google-sheets/interfaces/sheet-row.interface.js';
import { formatSyncDateTime, parseSyncDateTime } from '../../common/utils/date.helper.js';
import { SyncExecutionResult, IReverseSyncService } from '../interfaces/sync.interface.js';

// Executes reverse synchronization from Bitrix24 CRM back to Google Sheets (Two-Way Sync) (SRP)
@Injectable()
export class ReverseSyncService implements IReverseSyncService {
  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly bitrixLeadService: BitrixLeadService,
    private readonly mappingService: MappingService,
    private readonly hashService: HashService,
    private readonly logger: AppLogger,
  ) {}

  // Performs reverse synchronization from Bitrix24 back to Google Sheets
  async execute(leadId?: number | string): Promise<SyncExecutionResult> {
    const startTime = Date.now();
    this.logger.log('Starting reverse sync: Bitrix24 -> Google Sheets', 'ReverseSyncService');

    let totalRows = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;

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
          this.logger.warn(`Lead #${leadId} was deleted on Bitrix24. Flagging row ${deletedRow.rowIndex} on Google Sheet`, 'ReverseSyncService');
          systemUpdates.push({
            rowIndex: deletedRow.rowIndex,
            status: SYNC_STATUS_VI.FAILED,
            bitrixLeadId: leadId,
            lastSyncTime: formatSyncDateTime(),
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
        const nowFormatted = formatSyncDateTime();

        if (matchedRow) {
          // Resolves conflict: Last-Write-Wins with cloud clock skew tolerance
          const sheetLastSync = parseSyncDateTime(matchedRow.systemFields.lastSyncTime);
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
              lastSyncTime: nowFormatted,
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
          if (lastSyncCol !== undefined) newRowValues[lastSyncCol] = nowFormatted;

          const errorCol = systemColumnIndices[SYSTEM_COLUMNS.ERROR];
          if (errorCol !== undefined) newRowValues[errorCol] = '';

          const hashCol = systemColumnIndices[SYSTEM_COLUMNS.HASH];
          if (hashCol !== undefined) newRowValues[hashCol] = newHash;

          newRowsToAppend.push(newRowValues);
          created++;
          this.logger.log(`Created new Google Sheet row for Bitrix lead #${lead.ID} (${lead.TITLE || lead.NAME})`, 'ReverseSyncService');
        }
      } catch (err: any) {
        failed++;
        this.logger.error(`Failed to process Bitrix lead #${lead.ID} to Sheet: ${err.message}`, err.stack, 'ReverseSyncService');
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
    return {
      totalRows: totalRows + created,
      created,
      updated,
      skipped: Math.max(0, totalRows - updated - failed),
      failed,
      durationMs,
      timestamp: new Date().toISOString(),
      direction: 'BITRIX_TO_SHEETS',
    };
  }
}
