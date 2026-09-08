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

  it('should return empty result if sheet is completely empty', async () => {
    mockSheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [] },
    });

    const result = await service.readRows();
    expect(result.rows).toHaveLength(0);
    expect(result.headers).toHaveLength(0);
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
            values: [[SYNC_STATUS_VI.SYNCED, '555', '2026-03-01T12:00:00Z', '', 'abcsha256']],
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
});
