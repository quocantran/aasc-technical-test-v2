import { Injectable } from '@nestjs/common';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service.js';
import { BitrixLeadService } from '../../bitrix/services/bitrix-lead.service.js';
import { MappingService } from '../../mapping/services/mapping.service.js';
import { HashService } from './hash.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_STATUS_VI, SYSTEM_COLUMNS, SYNC_DIRECTIONS } from '../../common/constants/sync.constants.js';
import { SheetRow, RowUpdatePayload } from '../../google-sheets/interfaces/sheet-row.interface.js';
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
  async execute(leadId?: number | string | (number | string)[]): Promise<SyncExecutionResult> {
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
    const rowIndicesToDelete = new Set<number>();

    const mappingConfig = this.mappingService.getMappingConfig?.() || { fields: [] };
    const emailColumns = (mappingConfig.fields || [])
      .filter((f) => f.bitrixField === 'EMAIL')
      .map((f) => f.sheetColumn);
    const phoneColumns = (mappingConfig.fields || [])
      .filter((f) => f.bitrixField === 'PHONE')
      .map((f) => f.sheetColumn);

    // Extracts normalized email strictly using columns mapped to EMAIL in mapping.json
    const getRowEmail = (r: SheetRow): string => {
      for (const col of emailColumns) {
        const val = r.data[col];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim().toLowerCase();
        }
      }
      return '';
    };

    // Extracts normalized phone digits strictly using columns mapped to PHONE in mapping.json
    const getRowPhoneDigits = (r: SheetRow): string => {
      for (const col of phoneColumns) {
        const val = r.data[col];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).replace(/\D/g, '');
        }
      }
      return '';
    };

    // Helper to collect all rows belonging to a deleted customer, including duplicates
    const collectCustomerRowsToDelete = (deletedBitrixId: number | string) => {
      const idStr = String(deletedBitrixId);
      const directMatches = rows.filter(
        (r) => String(r.systemFields.bitrixLeadId) === idStr,
      );

      if (directMatches.length === 0) return;

      const customerEmails = new Set<string>();
      const customerPhones = new Set<string>();

      for (const r of directMatches) {
        rowIndicesToDelete.add(r.rowIndex);
        const email = getRowEmail(r);
        if (email) customerEmails.add(email);
        const phone = getRowPhoneDigits(r);
        if (phone.length >= 9) customerPhones.add(phone.slice(-9));
      }

      // Find any duplicate rows for this customer on Google Sheet (e.g. duplicates waiting for sync or without ID)
      for (const r of rows) {
        if (rowIndicesToDelete.has(r.rowIndex)) continue;

        const rowLeadId = r.systemFields.bitrixLeadId;
        // Do NOT delete if row has a DIFFERENT active Bitrix lead ID
        if (rowLeadId && String(rowLeadId) !== idStr) continue;

        const rEmail = getRowEmail(r);
        const rPhone = getRowPhoneDigits(r);

        const emailMatch = rEmail && customerEmails.has(rEmail);
        const phoneMatch = rPhone.length >= 9 && customerPhones.has(rPhone.slice(-9));

        if (emailMatch || phoneMatch) {
          this.logger.warn(
            `Found duplicate row ${r.rowIndex} for customer of deleted Lead #${deletedBitrixId}. Marking row for deletion.`,
            'ReverseSyncService',
          );
          rowIndicesToDelete.add(r.rowIndex);
        }
      }
    };

    const targetLeadIds: (number | string)[] | null = leadId !== undefined
      ? (Array.isArray(leadId) ? leadId : [leadId])
      : null;

    if (targetLeadIds !== null) {
      for (const id of targetLeadIds) {
        try {
          const lead = await this.bitrixLeadService.getLead(id);
          if (lead) {
            bitrixLeads.push(lead);
          } else {
            // Lead was deleted on Bitrix24
            this.logger.warn(`Lead #${id} was deleted on Bitrix24. Marking row(s) for deletion on Google Sheet`, 'ReverseSyncService');
            collectCustomerRowsToDelete(id);
          }
        } catch (err: any) {
          this.logger.error(`Error checking lead #${id} during reverse sync: ${err.message}`, err.stack, 'ReverseSyncService');
          failed++;
        }
      }
    } else {
      const leads = await this.bitrixLeadService.listLeads({});
      bitrixLeads.push(...leads);

      // Check for any rows on Google Sheets that have a bitrixLeadId but are no longer active in Bitrix24
      const activeBitrixIdSet = new Set(bitrixLeads.map((l) => String(l.ID)));
      for (const row of rows) {
        const rowLeadId = row.systemFields.bitrixLeadId;
        if (
          rowLeadId &&
          !activeBitrixIdSet.has(String(rowLeadId)) &&
          !rowIndicesToDelete.has(row.rowIndex)
        ) {
          try {
            const checkLead = await this.bitrixLeadService.getLead(rowLeadId);
            if (!checkLead) {
              this.logger.warn(`Lead #${rowLeadId} was deleted on Bitrix24. Marking row ${row.rowIndex} and duplicates for deletion`, 'ReverseSyncService');
              collectCustomerRowsToDelete(rowLeadId);
            }
          } catch (err: any) {
            this.logger.warn(`Could not verify status of Lead #${rowLeadId}: ${err.message}`, 'ReverseSyncService');
          }
        }
      }
    }

    const nonDeletedRows = rows.filter((r) => !rowIndicesToDelete.has(r.rowIndex));

    for (const lead of bitrixLeads) {
      // Finds matching row by Bitrix Lead ID
      let matchedRow = nonDeletedRows.find(
        (r) => String(r.systemFields.bitrixLeadId) === String(lead.ID),
      );

      // Deduplication fallback: if not matched by Lead ID, match by Email or Phone using mapped columns
      if (!matchedRow) {
        const leadEmail = Array.isArray(lead.EMAIL) ? lead.EMAIL[0]?.VALUE : undefined;
        const leadPhone = Array.isArray(lead.PHONE) ? lead.PHONE[0]?.VALUE : undefined;
        const cleanLeadEmail = leadEmail ? String(leadEmail).trim().toLowerCase() : '';
        const cleanLeadPhone = leadPhone ? String(leadPhone).replace(/\D/g, '') : '';

        if (cleanLeadEmail || cleanLeadPhone) {
          matchedRow = nonDeletedRows.find((r) => {
            const rEmail = getRowEmail(r);
            const rPhone = getRowPhoneDigits(r);
            if (cleanLeadEmail && rEmail && cleanLeadEmail === rEmail) {
              return true;
            }
            if (cleanLeadPhone && rPhone && cleanLeadPhone.length >= 9 && rPhone.length >= 9) {
              return cleanLeadPhone.slice(-9) === rPhone.slice(-9);
            }
            return false;
          });
        }
      }

      if (!lead.TITLE && !lead.NAME) {
        continue;
      }

      try {
        const updatedCells = this.mappingService.transformBitrixToRow(lead);
        const transformResult = this.mappingService.transformRow(updatedCells);
        const newHash = this.hashService.computeHash(transformResult.canonicalData);

        const nowFormatted = formatSyncDateTime();

        if (matchedRow) {
          const bitrixModifyTime = lead.DATE_MODIFY ? new Date(lead.DATE_MODIFY).getTime() : 0;
          const sheetLastSyncTime = parseSyncDateTime(matchedRow.systemFields.lastSyncTime);

          // Conflict resolution: Last-Write-Wins based on modification timestamp
          if (bitrixModifyTime <= sheetLastSyncTime && matchedRow.systemFields.syncHash === newHash) {
            continue;
          }

          const cellDiffs: Record<string, any> = {};
          for (const [colName, val] of Object.entries(updatedCells)) {
            if (val !== undefined && val !== null && String(val) !== String(matchedRow.data[colName] || '')) {
              cellDiffs[colName] = val;
            }
          }

          if (Object.keys(cellDiffs).length > 0 || matchedRow.systemFields.status !== SYNC_STATUS_VI.SYNCED) {
            if (Object.keys(cellDiffs).length > 0) {
              pendingCellUpdates.push({
                rowIndex: matchedRow.rowIndex,
                columnValues: cellDiffs,
              });
            }

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

    // Batch writes all updated business cells across all active rows in a single API call
    if (pendingCellUpdates.length > 0) {
      if (typeof this.googleSheetsService.batchUpdateRowsCells === 'function') {
        await this.googleSheetsService.batchUpdateRowsCells(pendingCellUpdates, headers);
      } else {
        for (const item of pendingCellUpdates) {
          await this.googleSheetsService.updateRowCells(item.rowIndex, item.columnValues, headers);
        }
      }
    }

    // Batch writes metadata across system columns in a single API call
    if (systemUpdates.length > 0) {
      await this.googleSheetsService.batchUpdateSystemColumns(systemUpdates, systemColumnIndices);
    }

    // Batch deletes all rows of deleted Bitrix leads in a single API call (bottom-to-top)
    let deleted = 0;
    if (rowIndicesToDelete.size > 0) {
      const indices = Array.from(rowIndicesToDelete);
      if (typeof this.googleSheetsService.deleteRows === 'function') {
        await this.googleSheetsService.deleteRows(indices);
      }
      deleted = indices.length;
      this.logger.log(`Successfully batch deleted ${deleted} row(s) from Google Sheet for deleted Bitrix lead(s)`, 'ReverseSyncService');
    }

    const durationMs = Date.now() - startTime;
    return {
      totalRows: totalRows + created,
      created,
      updated,
      deleted,
      skipped: Math.max(0, totalRows - updated - failed - deleted),
      failed,
      durationMs,
      timestamp: new Date().toISOString(),
      direction: SYNC_DIRECTIONS.BITRIX_TO_SHEETS,
    };
  }
}
