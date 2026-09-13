// Tests for GoogleSheetsService verifying row reading, system column detection, and batch write-back
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSheetsService } from './google-sheets.service.js';
import { SYSTEM_COLUMNS, SYNC_STATUS_VI } from '../common/constants/sync.constants.js';

describe('GoogleSheetsService', () => {
  let service: GoogleSheetsService;
  let mockConfigService: any;
  let mockAuthStrategy: any;
  let mockLogger: any;
  let mockSheetsClient: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'googleSheets.sheetId') return 'test-sheet-id';
        if (key === 'googleSheets.sheetName') return 'Leads';
        return null;
      }),
    };

    mockSheetsClient = {
      spreadsheets: {
        get: vi.fn().mockResolvedValue({
          data: {
            sheets: [{ properties: { sheetId: 0, title: 'Leads' } }],
          },
        }),
        batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
        values: {
          get: vi.fn(),
          update: vi.fn(),
          batchUpdate: vi.fn(),
        },
      },
    };

    mockAuthStrategy = {
      getSheetsClient: vi.fn().mockResolvedValue(mockSheetsClient),
    };

    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    service = new GoogleSheetsService(mockConfigService, mockAuthStrategy, mockLogger);
  });

  it('should return empty result if sheet is completely empty and no default columns provided', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [] },
    });

    const result = await service.readRows();
    expect(result.rows).toHaveLength(0);
    expect(result.headers).toHaveLength(0);
  });

  it('should initialize empty sheet with business headers and system headers if defaultBusinessColumns provided', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [] },
    });
    mockSheetsClient.spreadsheets.values.update.mockResolvedValue({ data: {} });
    mockSheetsClient.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });

    const result = await service.readRows(['Tên khách hàng', 'Email']);
    expect(mockSheetsClient.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-sheet-id',
        range: 'Leads!A1:G1',
        requestBody: {
          values: [
            ['Tên khách hàng', 'Email', 'Trạng thái đồng bộ', 'Lead ID Bitrix24', 'Thời gian đồng bộ cuối', 'Thông báo lỗi', 'Sync Hash'],
          ],
        },
      }),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.headers).toContain('Tên khách hàng');
    expect(result.headers).toContain('Email');
    expect(result.headers).toContain('Lead ID Bitrix24');
    expect(result.systemColumnIndices[SYSTEM_COLUMNS.BITRIX_ID]).toBe(3);
  });

  it('should read rows and append system columns if missing', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['Họ và tên', 'Email', 'Số điện thoại'],
          ['Nguyễn Văn An', 'an@gmail.com', '0901234567'],
          ['', '', ''], // empty row should be skipped
          ['Trần Thị Bình', 'binh@gmail.com'], // short row with fewer cells than headers
        ],
      },
    });

    mockSheetsClient.spreadsheets.values.update.mockResolvedValue({ data: {} });

    const result = await service.readRows();

    // Check that missing columns were appended to row 1
    expect(mockSheetsClient.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-sheet-id',
        range: 'Leads!D1:H1',
      }),
    );

    // 2 valid rows
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].rowIndex).toBe(2);
    expect(result.rows[0].data['Họ và tên']).toBe('Nguyễn Văn An');
    expect(result.rows[0].systemFields.status).toBe('');
    expect(result.rows[1].rowIndex).toBe(4);
    expect(result.rows[1].data['Họ và tên']).toBe('Trần Thị Bình');
    expect(result.rows[1].data['Số điện thoại']).toBe('');
  });

  it('should read rows when system columns are already present', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          [
            'Họ và tên',
            'Email',
            SYSTEM_COLUMNS.STATUS,
            SYSTEM_COLUMNS.BITRIX_ID,
            SYSTEM_COLUMNS.LAST_SYNC,
            SYSTEM_COLUMNS.ERROR,
            SYSTEM_COLUMNS.HASH,
          ],
          ['Lê Văn C', 'c@gmail.com', SYNC_STATUS_VI.SYNCED, '101', '2026-03-01T10:00:00Z', '', 'hash123'],
        ],
      },
    });

    const result = await service.readRows();

    expect(mockSheetsClient.spreadsheets.values.update).not.toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].systemFields.status).toBe(SYNC_STATUS_VI.SYNCED);
    expect(result.rows[0].systemFields.bitrixLeadId).toBe('101');
    expect(result.rows[0].systemFields.syncHash).toBe('hash123');
  });

  it('should batch update system columns with consecutive range', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    const systemColumnIndices = {
      [SYSTEM_COLUMNS.STATUS]: 2,
      [SYSTEM_COLUMNS.BITRIX_ID]: 3,
      [SYSTEM_COLUMNS.LAST_SYNC]: 4,
      [SYSTEM_COLUMNS.ERROR]: 5,
      [SYSTEM_COLUMNS.HASH]: 6,
    };

    const updates = [
      {
        rowIndex: 2,
        status: SYNC_STATUS_VI.SYNCED,
        bitrixLeadId: '555',
        lastSyncTime: '2026-03-01T12:00:00Z',
        errorMessage: '',
        syncHash: 'abcsha256',
      },
    ];

    await service.batchUpdateSystemColumns(updates, systemColumnIndices);

    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'test-sheet-id',
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Leads!C2:G2',
            values: [[SYNC_STATUS_VI.SYNCED, '555', "'2026-03-01T12:00:00Z", '', 'abcsha256']],
          },
        ],
      },
    });
  });

  it('should batch update system columns with non-consecutive range', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    const systemColumnIndices = {
      [SYSTEM_COLUMNS.STATUS]: 1,
      [SYSTEM_COLUMNS.BITRIX_ID]: 4,
      [SYSTEM_COLUMNS.LAST_SYNC]: 6,
      [SYSTEM_COLUMNS.ERROR]: 8,
      [SYSTEM_COLUMNS.HASH]: 10,
    };

    const updates = [
      {
        rowIndex: 3,
        status: SYNC_STATUS_VI.SYNCED,
        bitrixLeadId: '777',
        lastSyncTime: '2026-03-01T15:00:00Z',
        errorMessage: '',
        syncHash: 'nonconsecHash',
      },
    ];

    await service.batchUpdateSystemColumns(updates, systemColumnIndices);

    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-sheet-id',
        requestBody: expect.objectContaining({
          valueInputOption: 'USER_ENTERED',
          data: expect.arrayContaining([
            { range: 'Leads!B3', values: [[SYNC_STATUS_VI.SYNCED]] },
            { range: 'Leads!E3', values: [['777']] },
          ]),
        }),
      }),
    );
  });

  it('should update row cells in updateRowCells for matched headers', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    const headers = ['Họ và tên', 'Email', 'Ghi chú'];
    await service.updateRowCells(5, { 'Họ và tên': 'Nguyễn Văn Mới', 'Email': 'new@gmail.com', 'NonExistent': 'xyz' }, headers);

    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'test-sheet-id',
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Leads!A5', values: [['Nguyễn Văn Mới']] },
          { range: 'Leads!B5', values: [['new@gmail.com']] },
        ],
      },
    });
  });

  it('should not call batchUpdate in updateRowCells when no headers match', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    const headers = ['Họ và tên'];
    await service.updateRowCells(5, { 'Unmatched': 'val' }, headers);

    expect(mockSheetsClient.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();
  });

  it('should catch and log error gracefully in hideSystemColumns when sheet get fails', async () => {
    mockSheetsClient.spreadsheets.get.mockRejectedValue(new Error('Permission denied'));
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['Họ và tên', 'Email', 'Trạng thái', 'Lead ID', 'Thời gian đồng bộ', 'Chi tiết lỗi', 'Mã kiểm tra'],
          ['Nguyen A', 'a@a.com', '', '', '', '', ''],
        ],
      },
    });

    const result = await service.readRows();
    expect(result.rows).toHaveLength(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Column hiding skipped or non-critical notice: Permission denied'),
      'GoogleSheetsService',
    );
  });

  it('should do nothing if updates list is empty', async () => {
    await service.batchUpdateSystemColumns([], {});
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();
  });

  it('should batch delete rows in single batchUpdate API call with descending order', async () => {
    // Rows 2, 3, 5, 8, 9 merged into ranges [1, 3), [4, 5), [7, 9)
    // Deletes in descending order [7, 9), [4, 5), [1, 3)
    await service.deleteRows([2, 3, 5, 8, 9]);

    expect(mockSheetsClient.spreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'test-sheet-id',
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: 7,
                endIndex: 9,
              },
            },
          },
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: 4,
                endIndex: 5,
              },
            },
          },
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 3,
              },
            },
          },
        ],
      },
    });
  });

  it('should group multiple contiguous rows into a single 2D rectangular range in batchUpdateSystemColumns', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    const systemColumnIndices = {
      [SYSTEM_COLUMNS.STATUS]: 2,
      [SYSTEM_COLUMNS.BITRIX_ID]: 3,
      [SYSTEM_COLUMNS.LAST_SYNC]: 4,
      [SYSTEM_COLUMNS.ERROR]: 5,
      [SYSTEM_COLUMNS.HASH]: 6,
    };

    const updates = [
      { rowIndex: 2, status: SYNC_STATUS_VI.SYNCED, bitrixLeadId: '101', lastSyncTime: '2026-03-01T12:00:00Z', errorMessage: '', syncHash: 'h1' },
      { rowIndex: 3, status: SYNC_STATUS_VI.SYNCED, bitrixLeadId: '102', lastSyncTime: '2026-03-01T12:00:00Z', errorMessage: '', syncHash: 'h2' },
      { rowIndex: 4, status: SYNC_STATUS_VI.SYNCED, bitrixLeadId: '103', lastSyncTime: '2026-03-01T12:00:00Z', errorMessage: '', syncHash: 'h3' },
      { rowIndex: 7, status: SYNC_STATUS_VI.SYNCED, bitrixLeadId: '104', lastSyncTime: '2026-03-01T12:00:00Z', errorMessage: '', syncHash: 'h4' },
    ];

    await service.batchUpdateSystemColumns(updates, systemColumnIndices);

    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'test-sheet-id',
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Leads!C2:G4',
            values: [
              [SYNC_STATUS_VI.SYNCED, '101', "'2026-03-01T12:00:00Z", '', 'h1'],
              [SYNC_STATUS_VI.SYNCED, '102', "'2026-03-01T12:00:00Z", '', 'h2'],
              [SYNC_STATUS_VI.SYNCED, '103', "'2026-03-01T12:00:00Z", '', 'h3'],
            ],
          },
          {
            range: 'Leads!C7:G7',
            values: [
              [SYNC_STATUS_VI.SYNCED, '104', "'2026-03-01T12:00:00Z", '', 'h4'],
            ],
          },
        ],
      },
    });
  });

  it('should cache column hiding so subsequent readRows calls skip redundant batchUpdate', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['Họ và tên', 'Email', SYSTEM_COLUMNS.STATUS, SYSTEM_COLUMNS.BITRIX_ID, SYSTEM_COLUMNS.LAST_SYNC, SYSTEM_COLUMNS.ERROR, SYSTEM_COLUMNS.HASH],
          ['A', 'a@a.com', '', '', '', '', ''],
        ],
      },
    });

    // First call hides columns
    await service.readRows();
    expect(mockSheetsClient.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);

    // Second call should skip hideSystemColumns because columnsHidden is true and no new columns added
    await service.readRows();
    expect(mockSheetsClient.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);
  });

  it('should ignore header row (index <= 1) and empty list in deleteRows', async () => {
    await service.deleteRows([1, 0, -1]);
    expect(mockSheetsClient.spreadsheets.batchUpdate).not.toHaveBeenCalled();

    await service.deleteRows([]);
    expect(mockSheetsClient.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });

  it('should batch update rows cells and handle updateRowCells helper', async () => {
    mockSheetsClient.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} });

    // Empty updates array
    await service.batchUpdateRowsCells([], ['Họ và tên', 'Email']);
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();

    // No matching headers
    await service.batchUpdateRowsCells([{ rowIndex: 2, columnValues: { 'Không có': 'val' } }], ['Họ và tên']);
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).not.toHaveBeenCalled();

    // Valid updates with null/undefined values
    await service.batchUpdateRowsCells(
      [
        {
          rowIndex: 2,
          columnValues: { 'Họ và tên': 'Nguyễn Văn B', 'Email': null },
        },
      ],
      ['Họ và tên', 'Email'],
    );
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-sheet-id',
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: 'Leads!A2', values: [['Nguyễn Văn B']] },
            { range: 'Leads!B2', values: [['']] },
          ],
        },
      }),
    );

    // updateRowCells delegation
    await service.updateRowCells(3, { 'Họ và tên': 'Trần C' }, ['Họ và tên']);
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalled();
  });

  it('should handle appendRows with valid and empty rows', async () => {
    mockSheetsClient.spreadsheets.values.append = vi.fn().mockResolvedValue({ data: {} });

    await service.appendRows([]);
    await service.appendRows(null as any);
    expect(mockSheetsClient.spreadsheets.values.append).not.toHaveBeenCalled();

    await service.appendRows([['Nguyễn D', 'd@test.com']]);
    expect(mockSheetsClient.spreadsheets.values.append).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-sheet-id',
        range: 'Leads!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [['Nguyễn D', 'd@test.com']],
        },
      }),
    );
  });

  it('should cache numeric sheet ID and handle sheet title fallback', async () => {
    // First call fetches sheet info
    const id1 = await service.getNumericSheetId();
    expect(id1).toBe(0);
    expect(mockSheetsClient.spreadsheets.get).toHaveBeenCalledTimes(1);

    // Second call returns cached sheetId without API call
    const id2 = await service.getNumericSheetId();
    expect(id2).toBe(0);
    expect(mockSheetsClient.spreadsheets.get).toHaveBeenCalledTimes(1);
  });

  it('should fallback to first sheet if title does not match in getNumericSheetId', async () => {
    const unMatchedService = new GoogleSheetsService(
      {
        get: vi.fn((k) => (k === 'googleSheets.sheetName' ? 'NonExistentTab' : 'sheet-id')),
      } as any,
      mockAuthStrategy,
      mockLogger,
    );

    mockSheetsClient.spreadsheets.get.mockResolvedValue({
      data: {
        sheets: [{ properties: { sheetId: 999, title: 'DefaultTab' } }],
      },
    });

    const sheetId = await unMatchedService.getNumericSheetId();
    expect(sheetId).toBe(999);
  });

  it('should delete contiguous and non-contiguous rows in descending order', async () => {
    mockSheetsClient.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });

    // Rows 2, 3 (contiguous) and 6 (non-contiguous)
    await service.deleteRows([2, 3, 6]);

    expect(mockSheetsClient.spreadsheets.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          requests: [
            // Row 6 (0-indexed start 5, end 6)
            { deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 5, endIndex: 6 } } },
            // Rows 2, 3 (0-indexed start 1, end 3)
            { deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: 3 } } },
          ],
        },
      }),
    );
  });

  it('should return row count via getRowCount', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['Họ và tên', SYSTEM_COLUMNS.STATUS, SYSTEM_COLUMNS.BITRIX_ID, SYSTEM_COLUMNS.LAST_SYNC, SYSTEM_COLUMNS.ERROR, SYSTEM_COLUMNS.HASH],
          ['Row 1', '', '', '', '', ''],
          ['Row 2', '', '', '', '', ''],
        ],
      },
    });

    const count = await service.getRowCount();
    expect(count).toBe(2);

    // Second call returns cached row count
    const cachedCount = await service.getRowCount();
    expect(cachedCount).toBe(2);
  });
});
