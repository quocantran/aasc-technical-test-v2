import { Injectable, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sheets_v4 } from 'googleapis';
import { AppLogger } from '../common/logger/app-logger.service.js';
import { GOOGLE_SHEETS_AUTH_STRATEGY } from './interfaces/google-sheets-auth.interface.js';
import type { IGoogleSheetsAuthStrategy } from './interfaces/google-sheets-auth.interface.js';
import { RetryService } from '../bitrix/services/retry.service.js';
import { GOOGLE_SHEETS_CONSTANTS } from '../common/constants/google-sheets.constants.js';
import {
  SYSTEM_COLUMNS,
  SYSTEM_COLUMNS_VI,
  SYSTEM_COLUMN_ALIASES,
  isSystemHeader,
} from '../common/constants/sync.constants.js';
import { SheetRow, RowUpdatePayload } from './interfaces/sheet-row.interface.js';
import { indexToA1Column } from './utils/column-helper.js';

// Result wrapper containing parsed sheet rows, column headers, and system column indices
export interface ReadSheetResult {
  rows: SheetRow[];
  headers: string[];
  systemColumnIndices: Record<string, number>;
}

// Manages Google Sheets API operations including row reading, column initialization, hidden columns, and batch updates
@Injectable()
export class GoogleSheetsService {
  private readonly sheetId: string;
  private readonly sheetName: string;
  private cachedRowCount: number | null = null;
  private cachedNumericSheetId: number | null = null;
  private lastRowCountFetch: number = 0;
  private columnsHidden: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    @Inject(GOOGLE_SHEETS_AUTH_STRATEGY)
    private readonly authStrategy: IGoogleSheetsAuthStrategy,
    private readonly logger: AppLogger,
    @Optional() private readonly retryService?: RetryService,
  ) {
    this.sheetId = this.configService.get<string>('googleSheets.sheetId') || '';
    this.sheetName = this.configService.get<string>('googleSheets.sheetName') || GOOGLE_SHEETS_CONSTANTS.DEFAULT_SHEET_NAME;
  }

  // Executes an async operation with exponential retry if RetryService is available
  private async callWithRetry<T>(op: () => Promise<T>, opName: string): Promise<T> {
    if (this.retryService) {
      return this.retryService.executeWithRetry(op, { operationName: opName });
    }
    return op();
  }

  // Lightweight row count with in-memory caching (TTL: 15s) for dashboard without console log spam
  async getRowCount(): Promise<number> {
    const now = Date.now();
    if (this.cachedRowCount !== null && now - this.lastRowCountFetch < GOOGLE_SHEETS_CONSTANTS.ROW_COUNT_CACHE_TTL_MS) {
      return this.cachedRowCount;
    }

    try {
      const sheets = await this.authStrategy.getSheetsClient();
      const range = `${this.sheetName}!${GOOGLE_SHEETS_CONSTANTS.DEFAULT_RANGE}`;
      const response = await this.callWithRetry(
        () =>
          sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
          }),
        'GoogleSheets:getRowCount',
      );

      const rawRows = response.data.values || [];
      if (rawRows.length <= 1) {
        this.cachedRowCount = 0;
        this.lastRowCountFetch = now;
        return 0;
      }

      let count = 0;
      for (let i = 1; i < rawRows.length; i++) {
        const rowValues = rawRows[i] || [];
        const isBlank = rowValues.every((val) => val === undefined || val === null || String(val).trim() === '');
        if (!isBlank) count++;
      }

      this.cachedRowCount = count;
      this.lastRowCountFetch = now;
      return count;
    } catch {
      return this.cachedRowCount ?? 0;
    }
  }

  // Updates the cached row count immediately
  setCachedRowCount(count: number): void {
    this.cachedRowCount = count;
    this.lastRowCountFetch = Date.now();
  }

  // Reads all rows from sheet, ensures system columns exist, and returns structured row objects
  async readRows(): Promise<ReadSheetResult> {
    const sheets = await this.authStrategy.getSheetsClient();
    const range = `${this.sheetName}!${GOOGLE_SHEETS_CONSTANTS.DEFAULT_RANGE}`;

    this.logger.log(`Fetching rows from Google Sheet: ${this.sheetId} [${range}]`, 'GoogleSheetsService');
    const response = await this.callWithRetry(
      () =>
        sheets.spreadsheets.values.get({
          spreadsheetId: this.sheetId,
          range,
        }),
      'GoogleSheets:readRows',
    );

    const rawRows = response.data.values || [];
    if (rawRows.length === 0) {
      return { rows: [], headers: [], systemColumnIndices: {} };
    }

    const headers: string[] = (rawRows[0] || []).map((h) => String(h || '').trim());
    const { indices: systemColumnIndices, addedNewColumns } = await this.ensureSystemColumns(sheets, headers);

    // Attempts to hide system columns (e.g. Lead ID, Hash) once or if new system columns were added
    if (!this.columnsHidden || addedNewColumns) {
      await this.hideSystemColumns(sheets, systemColumnIndices);
      this.columnsHidden = true;
    }

    const rows: SheetRow[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const rowValues = rawRows[i] || [];
      const isBlank = rowValues.every((val) => val === undefined || val === null || String(val).trim() === '');
      if (isBlank) continue;

      const data: Record<string, any> = {};
      headers.forEach((header, index) => {
        const cleanHeader = header.trim();
        if (!isSystemHeader(cleanHeader)) {
          data[cleanHeader] = rowValues[index] !== undefined ? String(rowValues[index]).trim() : '';
        }
      });

      const getVal = (colKey: string): string => {
        const colIdx = systemColumnIndices[colKey];
        return colIdx !== undefined && rowValues[colIdx] !== undefined ? String(rowValues[colIdx]).trim() : '';
      };

      const systemFields = {
        status: getVal(SYSTEM_COLUMNS.STATUS),
        bitrixLeadId: getVal(SYSTEM_COLUMNS.BITRIX_ID) || null,
        lastSyncTime: getVal(SYSTEM_COLUMNS.LAST_SYNC) || null,
        errorMessage: getVal(SYSTEM_COLUMNS.ERROR) || null,
        syncHash: getVal(SYSTEM_COLUMNS.HASH) || null,
      };

      rows.push({
        rowIndex: i + 1,
        data,
        rawValues: rowValues,
        systemFields,
      });
    }

    this.logger.log(`Parsed ${rows.length} non-empty rows from Google Sheet`, 'GoogleSheetsService');
    this.setCachedRowCount(rows.length);
    return { rows, headers, systemColumnIndices };
  }

  // Updates metadata across system columns using a single batchUpdate API call
  async batchUpdateSystemColumns(
    updates: RowUpdatePayload[],
    systemColumnIndices: Record<string, number>,
  ): Promise<void> {
    if (!updates || updates.length === 0) {
      return;
    }

    const sheets = await this.authStrategy.getSheetsClient();
    const data: sheets_v4.Schema$ValueRange[] = [];

    const statusCol = systemColumnIndices[SYSTEM_COLUMNS.STATUS];
    const bitrixIdCol = systemColumnIndices[SYSTEM_COLUMNS.BITRIX_ID];
    const lastSyncCol = systemColumnIndices[SYSTEM_COLUMNS.LAST_SYNC];
    const errorCol = systemColumnIndices[SYSTEM_COLUMNS.ERROR];
    const hashCol = systemColumnIndices[SYSTEM_COLUMNS.HASH];

    // Detects whether system columns are contiguous to optimize range updates
    const areConsecutive =
      statusCol !== undefined &&
      bitrixIdCol === statusCol + 1 &&
      lastSyncCol === statusCol + 2 &&
      errorCol === statusCol + 3 &&
      hashCol === statusCol + 4;

    if (areConsecutive) {
      const startLetter = indexToA1Column(statusCol);
      const endLetter = indexToA1Column(hashCol);

      // Sort updates by rowIndex ascending to group contiguous rows into single 2D rectangular blocks
      const sortedUpdates = [...updates].sort((a, b) => a.rowIndex - b.rowIndex);

      let chunkStartIdx = 0;
      while (chunkStartIdx < sortedUpdates.length) {
        let chunkEndIdx = chunkStartIdx;
        while (
          chunkEndIdx + 1 < sortedUpdates.length &&
          sortedUpdates[chunkEndIdx + 1].rowIndex === sortedUpdates[chunkEndIdx].rowIndex + 1
        ) {
          chunkEndIdx++;
        }

        const startRow = sortedUpdates[chunkStartIdx].rowIndex;
        const endRow = sortedUpdates[chunkEndIdx].rowIndex;
        const blockValues: any[][] = [];

        for (let i = chunkStartIdx; i <= chunkEndIdx; i++) {
          const u = sortedUpdates[i];
          blockValues.push([
            u.status ?? '',
            u.bitrixLeadId ?? '',
            u.lastSyncTime ?? '',
            u.errorMessage ?? '',
            u.syncHash ?? '',
          ]);
        }

        data.push({
          range: `${this.sheetName}!${startLetter}${startRow}:${endLetter}${endRow}`,
          values: blockValues,
        });

        chunkStartIdx = chunkEndIdx + 1;
      }
    } else {
      for (const update of updates) {
        const addCell = (colIdx: number | undefined, val: any) => {
          if (colIdx !== undefined) {
            const letter = indexToA1Column(colIdx);
            data.push({
              range: `${this.sheetName}!${letter}${update.rowIndex}`,
              values: [[val ?? '']],
            });
          }
        };
        addCell(statusCol, update.status);
        addCell(bitrixIdCol, update.bitrixLeadId);
        addCell(lastSyncCol, update.lastSyncTime);
        addCell(errorCol, update.errorMessage);
        addCell(hashCol, update.syncHash);
      }
    }

    this.logger.log(`Batch writing ${updates.length} row metadata updates to Google Sheet`, 'GoogleSheetsService');
    await this.callWithRetry(
      () =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.sheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data,
          },
        }),
      'GoogleSheets:batchUpdateSystemColumns',
    );
  }

  // Batch updates business cells across multiple rows in a single API call (used for 2-way sync)
  async batchUpdateRowsCells(
    updates: Array<{ rowIndex: number; columnValues: Record<string, any> }>,
    headers: string[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const sheets = await this.authStrategy.getSheetsClient();
    const data: sheets_v4.Schema$ValueRange[] = [];

    for (const update of updates) {
      for (const [colName, val] of Object.entries(update.columnValues)) {
        const colIdx = headers.indexOf(colName);
        if (colIdx !== -1) {
          const letter = indexToA1Column(colIdx);
          data.push({
            range: `${this.sheetName}!${letter}${update.rowIndex}`,
            values: [[val !== undefined && val !== null ? String(val) : '']],
          });
        }
      }
    }

    if (data.length > 0) {
      this.logger.log(`Batch writing ${data.length} cell updates across ${updates.length} rows to Google Sheet`, 'GoogleSheetsService');
      await this.callWithRetry(
        () =>
          sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.sheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data,
            },
          }),
        'GoogleSheets:batchUpdateRowsCells',
      );
    }
  }

  // Updates specific business cells of a single row (delegates to batchUpdateRowsCells)
  async updateRowCells(
    rowIndex: number,
    columnValues: Record<string, any>,
    headers: string[],
  ): Promise<void> {
    await this.batchUpdateRowsCells([{ rowIndex, columnValues }], headers);
  }

  // Appends new rows to Google Sheet using spreadsheets.values.append
  async appendRows(rows: any[][]): Promise<void> {
    if (!rows || rows.length === 0) return;
    const sheets = await this.authStrategy.getSheetsClient();
    const range = `${this.sheetName}!A1`;
    this.logger.log(`Appending ${rows.length} new rows to Google Sheet: ${range}`, 'GoogleSheetsService');
    await this.callWithRetry(
      () =>
        sheets.spreadsheets.values.append({
          spreadsheetId: this.sheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: rows,
          },
        }),
      'GoogleSheets:appendRows',
    );
  }

  // Retrieves and caches numeric sheet ID (tab GID)
  async getNumericSheetId(): Promise<number> {
    if (this.cachedNumericSheetId !== null) {
      return this.cachedNumericSheetId;
    }
    const sheets = await this.authStrategy.getSheetsClient();
    const spreadsheetInfo = await this.callWithRetry(
      () =>
        sheets.spreadsheets.get({
          spreadsheetId: this.sheetId,
          fields: 'sheets.properties',
        }),
      'GoogleSheets:getSpreadsheetInfo',
    );

    const targetSheet = spreadsheetInfo.data.sheets?.find(
      (s) => s.properties?.title === this.sheetName,
    ) || spreadsheetInfo.data.sheets?.[0];

    this.cachedNumericSheetId = targetSheet?.properties?.sheetId ?? 0;
    return this.cachedNumericSheetId;
  }

  // Deletes multiple rows in a single batchUpdate API call from bottom to top to prevent index shifting
  async deleteRows(rowIndices: number[]): Promise<void> {
    const validIndices = Array.from(new Set(rowIndices))
      .filter((idx) => typeof idx === 'number' && idx > 1)
      .sort((a, b) => a - b);

    if (validIndices.length === 0) return;

    const numericSheetId = await this.getNumericSheetId();
    const sheets = await this.authStrategy.getSheetsClient();

    // Group contiguous 0-indexed rows into ranges [startIndex, endIndex)
    const ranges: Array<{ startIndex: number; endIndex: number }> = [];
    let currentStart = validIndices[0] - 1;
    let currentEnd = validIndices[0];

    for (let i = 1; i < validIndices.length; i++) {
      const next0Idx = validIndices[i] - 1;
      if (next0Idx === currentEnd) {
        currentEnd = next0Idx + 1;
      } else {
        ranges.push({ startIndex: currentStart, endIndex: currentEnd });
        currentStart = next0Idx;
        currentEnd = next0Idx + 1;
      }
    }
    ranges.push({ startIndex: currentStart, endIndex: currentEnd });

    // CRITICAL: Sort descending by startIndex so that deleting rows near the bottom does not shift indices of rows above
    ranges.sort((a, b) => b.startIndex - a.startIndex);

    const requests: sheets_v4.Schema$Request[] = ranges.map((range) => ({
      deleteDimension: {
        range: {
          sheetId: numericSheetId,
          dimension: 'ROWS',
          startIndex: range.startIndex,
          endIndex: range.endIndex,
        },
      },
    }));

    this.logger.log(
      `Batch deleting ${validIndices.length} row(s) across ${ranges.length} range(s) from Google Sheet: ${this.sheetName}`,
      'GoogleSheetsService',
    );

    await this.callWithRetry(
      () =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetId,
          requestBody: { requests },
        }),
      'GoogleSheets:deleteRows',
    );

    // Invalidate cached row count
    this.cachedRowCount = null;
  }

  // Appends missing system columns using Vietnamese header names and records their column index
  private async ensureSystemColumns(
    sheets: sheets_v4.Sheets,
    headers: string[],
  ): Promise<{ indices: Record<string, number>; addedNewColumns: boolean }> {
    const indices: Record<string, number> = {};
    const missingKeys: Array<keyof typeof SYSTEM_COLUMNS> = [];
    const missingHeaderNames: string[] = [];

    const systemKeys = Object.keys(SYSTEM_COLUMNS) as Array<keyof typeof SYSTEM_COLUMNS>;

    for (const key of systemKeys) {
      const internalColName = SYSTEM_COLUMNS[key];
      const aliases = SYSTEM_COLUMN_ALIASES[internalColName] || [internalColName];

      // Looks for any alias in existing headers (case-insensitive)
      let foundIndex = -1;
      for (let i = 0; i < headers.length; i++) {
        const hNorm = headers[i].toLowerCase();
        if (aliases.includes(hNorm)) {
          foundIndex = i;
          break;
        }
      }

      if (foundIndex !== -1) {
        indices[internalColName] = foundIndex;
      } else {
        missingKeys.push(key);
        missingHeaderNames.push(SYSTEM_COLUMNS_VI[key]);
      }
    }

    // Appends any missing system column headers at the end of row 1 using Vietnamese names
    if (missingHeaderNames.length > 0) {
      const startColIndex = headers.length;
      const startLetter = indexToA1Column(startColIndex);
      const endLetter = indexToA1Column(startColIndex + missingHeaderNames.length - 1);
      const range = `${this.sheetName}!${startLetter}1:${endLetter}1`;

      this.logger.log(`Appending ${missingHeaderNames.length} missing system columns to range ${range}`, 'GoogleSheetsService');
      await this.callWithRetry(
        () =>
          sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [missingHeaderNames],
            },
          }),
        'GoogleSheets:ensureSystemColumns',
      );

      missingKeys.forEach((key, offset) => {
        const internalColName = SYSTEM_COLUMNS[key];
        const newIndex = startColIndex + offset;
        headers.push(missingHeaderNames[offset]);
        indices[internalColName] = newIndex;
      });
    }

    return { indices, addedNewColumns: missingHeaderNames.length > 0 };
  }

  // Hides Lead ID and Hash columns in Google Sheets UI, and sets text wrap for Error Message
  private async hideSystemColumns(
    sheets: sheets_v4.Sheets,
    systemColumnIndices: Record<string, number>,
  ): Promise<void> {
    try {
      const numericSheetId = await this.getNumericSheetId();
      const requests: sheets_v4.Schema$Request[] = [];

      const leadIdCol = systemColumnIndices[SYSTEM_COLUMNS.BITRIX_ID];
      const hashCol = systemColumnIndices[SYSTEM_COLUMNS.HASH];
      const errorCol = systemColumnIndices[SYSTEM_COLUMNS.ERROR];

      const colsToHide = [leadIdCol, hashCol].filter((c) => c !== undefined) as number[];

      for (const colIdx of colsToHide) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: numericSheetId,
              dimension: 'COLUMNS',
              startIndex: colIdx,
              endIndex: colIdx + 1,
            },
            properties: {
              hiddenByUser: true,
            },
            fields: 'hiddenByUser',
          },
        });
      }

      // Automatically wraps text in Error Message column so long details fit cleanly
      if (errorCol !== undefined) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: numericSheetId,
              startColumnIndex: errorCol,
              endColumnIndex: errorCol + 1,
            },
            cell: {
              userEnteredFormat: {
                wrapStrategy: 'WRAP',
              },
            },
            fields: 'userEnteredFormat.wrapStrategy',
          },
        });
      }

      if (requests.length > 0) {
        await this.callWithRetry(
          () =>
            sheets.spreadsheets.batchUpdate({
              spreadsheetId: this.sheetId,
              requestBody: { requests },
            }),
          'GoogleSheets:hideSystemColumns',
        );
      }
    } catch (error: any) {
      this.logger.debug(`Column hiding skipped or non-critical notice: ${error.message}`, 'GoogleSheetsService');
    }
  }
}

