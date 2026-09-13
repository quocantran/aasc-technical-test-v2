import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReverseSyncService } from './reverse-sync.service.js';
import { SYNC_STATUS_VI, SYSTEM_COLUMNS, SYNC_DIRECTIONS } from '../../common/constants/sync.constants.js';

describe('ReverseSyncService', () => {
  let service: ReverseSyncService;
  let mockGoogleSheetsService: any;
  let mockBitrixLeadService: any;
  let mockMappingService: any;
  let mockHashService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockGoogleSheetsService = {
      readRows: vi.fn().mockResolvedValue({
        rows: [],
        headers: ['Họ và tên', 'Email', 'Số điện thoại', 'Công ty', 'Trạng thái', 'Lead ID', 'Thời gian đồng bộ', 'Thông báo lỗi', 'Mã hash'],
        systemColumnIndices: {
          [SYSTEM_COLUMNS.STATUS]: 4,
          [SYSTEM_COLUMNS.BITRIX_ID]: 5,
          [SYSTEM_COLUMNS.LAST_SYNC]: 6,
          [SYSTEM_COLUMNS.ERROR]: 7,
          [SYSTEM_COLUMNS.HASH]: 8,
        },
      }),
      appendRows: vi.fn().mockResolvedValue(true),
      batchUpdateRowsCells: vi.fn().mockResolvedValue(true),
      updateRowCells: vi.fn().mockResolvedValue(true),
      batchUpdateSystemColumns: vi.fn().mockResolvedValue(true),
      deleteRows: vi.fn().mockResolvedValue(true),
    };

    mockBitrixLeadService = {
      getLead: vi.fn(),
      listLeads: vi.fn(),
      listAllLeads: vi.fn(),
    };

    mockMappingService = {
      loadMappingConfig: vi.fn(),
      getMappingConfig: vi.fn().mockReturnValue({
        fields: [
          { sheetColumn: 'Họ và tên', bitrixField: 'NAME', type: 'string', required: true },
          { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'email' },
          { sheetColumn: 'Số điện thoại', bitrixField: 'PHONE', type: 'phone' },
        ],
      }),
      transformBitrixToRow: vi.fn((lead) => ({
        'Họ và tên': lead.NAME || lead.TITLE,
        'Email': lead.EMAIL?.[0]?.VALUE || '',
        'Số điện thoại': lead.PHONE?.[0]?.VALUE || '',
      })),
      transformRow: vi.fn((cells) => ({
        bitrixFields: cells,
        canonicalData: cells,
        errors: [],
      })),
    };

    mockHashService = {
      computeHash: vi.fn().mockReturnValue('hash123'),
    };

    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    service = new ReverseSyncService(
      mockGoogleSheetsService,
      mockBitrixLeadService,
      mockMappingService,
      mockHashService,
      mockLogger,
    );
  });

  it('should append new row to Google Sheets when lead is newly created on Bitrix', async () => {
    mockBitrixLeadService.listAllLeads.mockResolvedValue([
      {
        ID: '1001',
        NAME: 'Nguyễn Văn A',
        EMAIL: [{ VALUE: 'a@example.com' }],
        PHONE: [{ VALUE: '0912345678' }],
      },
    ]);

    const result = await service.execute();

    expect(result.created).toBe(1);
    expect(result.direction).toBe(SYNC_DIRECTIONS.BITRIX_TO_SHEETS);
    expect(mockGoogleSheetsService.appendRows).toHaveBeenCalled();
  });

  it('should fallback to listLeads when listAllLeads is not defined', async () => {
    delete (mockBitrixLeadService as any).listAllLeads;
    mockBitrixLeadService.listLeads.mockResolvedValue([
      {
        ID: '1002',
        NAME: 'Trần B',
      },
    ]);

    const result = await service.execute();
    expect(result.created).toBe(1);
    expect(mockBitrixLeadService.listLeads).toHaveBeenCalledWith({});
  });

  it('should update existing row when Bitrix lead has newer modification date', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Họ và tên': 'Nguyễn Văn Cũ', 'Email': 'test@example.com', 'Số điện thoại': '0901234567' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '2001',
            lastSyncTime: '01/01/2026 10:00:00',
            errorMessage: '',
            syncHash: 'oldhash',
          },
        },
      ],
      headers: ['Họ và tên', 'Email', 'Số điện thoại'],
      systemColumnIndices: {
        [SYSTEM_COLUMNS.STATUS]: 3,
        [SYSTEM_COLUMNS.BITRIX_ID]: 4,
        [SYSTEM_COLUMNS.LAST_SYNC]: 5,
        [SYSTEM_COLUMNS.ERROR]: 6,
        [SYSTEM_COLUMNS.HASH]: 7,
      },
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '2001',
      NAME: 'Nguyễn Văn Mới',
      DATE_MODIFY: '2026-02-01T10:00:00Z',
    });

    const result = await service.execute(2001);

    expect(result.updated).toBe(1);
    expect(mockGoogleSheetsService.batchUpdateRowsCells).toHaveBeenCalled();
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalled();
  });

  it('should fallback to updateRowCells when batchUpdateRowsCells is not available', async () => {
    delete (mockGoogleSheetsService as any).batchUpdateRowsCells;
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Họ và tên': 'Nguyễn Cũ' },
          systemFields: {
            status: SYNC_STATUS_VI.FAILED,
            bitrixLeadId: '3001',
            lastSyncTime: '',
            errorMessage: 'Error',
            syncHash: 'oldhash',
          },
        },
      ],
      headers: ['Họ và tên'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '3001',
      NAME: 'Nguyễn Mới',
      DATE_MODIFY: '2026-03-01T10:00:00Z',
    });

    const result = await service.execute(3001);

    expect(result.updated).toBe(1);
    expect(mockGoogleSheetsService.updateRowCells).toHaveBeenCalled();
  });

  it('should skip update when sheet has newer/same timestamp and hash matches', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Họ và tên': 'Nguyễn Văn A' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '4001',
            lastSyncTime: '01/01/2026 12:00:00',
            errorMessage: '',
            syncHash: 'hash123',
          },
        },
      ],
      headers: ['Họ và tên'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '4001',
      NAME: 'Nguyễn Văn A',
      DATE_MODIFY: '2026-01-01T11:00:00Z', // older than lastSyncTime
    });

    const result = await service.execute(4001);

    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('should match row by Email fallback if bitrixLeadId is empty', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 3,
          data: { 'Họ và tên': 'Bùi D', 'Email': 'match@example.com', 'Số điện thoại': '' },
          systemFields: {
            status: '',
            bitrixLeadId: '',
            lastSyncTime: '',
            errorMessage: '',
            syncHash: '',
          },
        },
      ],
      headers: ['Họ và tên', 'Email', 'Số điện thoại'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '5001',
      NAME: 'Bùi D Updated',
      EMAIL: [{ VALUE: 'MATCH@EXAMPLE.COM' }],
    });

    const result = await service.execute(5001);

    expect(result.updated).toBe(1);
  });

  it('should match row by Phone 9-digit fallback if bitrixLeadId is empty', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 4,
          data: { 'Họ và tên': 'Phạm E', 'Email': '', 'Số điện thoại': '+84 987 654 321' },
          systemFields: {
            status: '',
            bitrixLeadId: '',
            lastSyncTime: '',
            errorMessage: '',
            syncHash: '',
          },
        },
      ],
      headers: ['Họ và tên', 'Email', 'Số điện thoại'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '6001',
      NAME: 'Phạm E',
      PHONE: [{ VALUE: '0987654321' }],
    });

    const result = await service.execute(6001);

    expect(result.updated).toBe(1);
  });

  it('should only mark rows with matching bitrixLeadId for deletion when lead is deleted on Bitrix, sparing unsynced rows', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Họ và tên': 'Lê Văn F', 'Email': 'f@example.com', 'Số điện thoại': '0911223344' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '7001',
            lastSyncTime: '01/01/2026 10:00:00',
            errorMessage: '',
            syncHash: 'h',
          },
        },
        {
          rowIndex: 3,
          data: { 'Họ và tên': 'Lê Văn F Dup', 'Email': 'f@example.com', 'Số điện thoại': '0911223344' },
          systemFields: {
            status: '',
            bitrixLeadId: '',
            lastSyncTime: '',
            errorMessage: '',
            syncHash: '',
          },
        },
      ],
      headers: ['Họ và tên', 'Email', 'Số điện thoại'],
      systemColumnIndices: {},
    });

    // Bitrix returns null (Lead deleted)
    mockBitrixLeadService.getLead.mockResolvedValue(null);

    const result = await service.execute(7001);

    // Only row 2 with matching bitrixLeadId: '7001' is marked for deletion; row 3 without bitrixLeadId is preserved
    expect(result.deleted).toBe(1);
    expect(mockGoogleSheetsService.deleteRows).toHaveBeenCalledWith([2]);
  });

  it('should detect inactive leads on sheet during full sync and delete them', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 5,
          data: { 'Họ và tên': 'Ghost Lead', 'Email': 'ghost@example.com' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '8001',
            lastSyncTime: '01/01/2026 10:00:00',
            errorMessage: '',
            syncHash: 'gh',
          },
        },
      ],
      headers: ['Họ và tên', 'Email'],
      systemColumnIndices: {},
    });

    // Full sync returns active leads that do NOT contain 8001
    mockBitrixLeadService.listAllLeads.mockResolvedValue([
      { ID: '9999', NAME: 'Active Lead' },
    ]);

    // getLead verifies 8001 is indeed null (deleted)
    mockBitrixLeadService.getLead.mockResolvedValue(null);

    const result = await service.execute();

    expect(result.deleted).toBe(1);
    expect(mockGoogleSheetsService.deleteRows).toHaveBeenCalledWith([5]);
  });

  it('should handle error when verifying inactive lead status gracefully', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 6,
          data: { 'Họ và tên': 'Unverified Lead' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '8002',
            lastSyncTime: '',
            errorMessage: '',
            syncHash: '',
          },
        },
      ],
      headers: ['Họ và tên'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.listAllLeads.mockResolvedValue([]);
    mockBitrixLeadService.getLead.mockRejectedValue(new Error('Network error'));

    const result = await service.execute();
    expect(result.deleted).toBe(0);
  });

  it('should skip lead without title and name', async () => {
    mockBitrixLeadService.listAllLeads.mockResolvedValue([
      { ID: '10001', TITLE: '', NAME: '' },
    ]);

    const result = await service.execute();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('should handle exception during getLead in targeted sync', async () => {
    mockBitrixLeadService.getLead.mockRejectedValue(new Error('API failure'));

    const result = await service.execute(9999);
    expect(result.failed).toBe(1);
  });

  it('should handle exception during lead processing to sheet', async () => {
    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '1234',
      NAME: 'Crash Test',
    });

    mockMappingService.transformBitrixToRow.mockImplementation(() => {
      throw new Error('Transformation crash');
    });

    const result = await service.execute(1234);
    expect(result.failed).toBe(1);
  });

  it('should update all duplicate rows on Google Sheets that share the same Bitrix Lead ID', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Họ và tên': 'Đặng Quốc Hưng', 'Ngân sách': '250000000' },
          systemFields: { bitrixLeadId: '765', status: SYNC_STATUS_VI.SYNCED, lastSyncTime: '01/01/2026 00:00:00', syncHash: 'oldhash' },
        },
        {
          rowIndex: 3,
          data: { 'Họ và tên': 'Đặng Quốc Hưng', 'Ngân sách': '250000000' },
          systemFields: { bitrixLeadId: '765', status: SYNC_STATUS_VI.SYNCED, lastSyncTime: '01/01/2026 00:00:00', syncHash: 'oldhash' },
        },
      ],
      headers: ['Họ và tên', 'Ngân sách'],
      systemColumnIndices: {
        [SYSTEM_COLUMNS.BITRIX_ID]: 2,
        [SYSTEM_COLUMNS.STATUS]: 3,
        [SYSTEM_COLUMNS.LAST_SYNC]: 4,
        [SYSTEM_COLUMNS.ERROR]: 5,
        [SYSTEM_COLUMNS.HASH]: 6,
      },
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: '765',
      NAME: 'Đặng Quốc Hưng VIP',
      OPPORTUNITY: '2500000',
      DATE_MODIFY: '2026-09-13T14:00:00Z',
    });

    const result = await service.execute(765);
    expect(result.updated).toBe(1);
    expect(mockGoogleSheetsService.batchUpdateRowsCells).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ rowIndex: 2 }),
        expect.objectContaining({ rowIndex: 3 }),
      ]),
      expect.any(Array),
    );
  });
});
