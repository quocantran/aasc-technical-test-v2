// Comprehensive unit tests for SyncOrchestratorService verifying all core sync scenarios and edge cases

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOrchestratorService } from './sync-orchestrator.service.js';
import { HashService } from './hash.service.js';
import { LockService } from './lock.service.js';
import { DeduplicationService } from './deduplication.service.js';
import { ForwardSyncService } from './forward-sync.service.js';
import { ReverseSyncService } from './reverse-sync.service.js';
import { SyncHistoryService } from './sync-history.service.js';
import { SYNC_STATUS_VI, SYSTEM_COLUMNS } from '../../common/constants/sync.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

describe('SyncOrchestratorService', () => {
  let orchestrator: SyncOrchestratorService;
  let mockGoogleSheetsService: any;
  let mockBitrixLeadService: any;
  let mockMappingService: any;
  let hashService: HashService;
  let lockService: LockService;
  let deduplicationService: DeduplicationService;
  let forwardSyncService: ForwardSyncService;
  let reverseSyncService: ReverseSyncService;
  let syncHistoryService: SyncHistoryService;
  let mockLogger: any;

  beforeEach(() => {
    mockGoogleSheetsService = {
      readRows: vi.fn(),
      batchUpdateSystemColumns: vi.fn(),
      updateRowCells: vi.fn(),
      appendRows: vi.fn(),
    };
    mockBitrixLeadService = {
      addLead: vi.fn(),
      updateLead: vi.fn(),
      batchAddLeads: vi.fn().mockImplementation(async (items: any[]) => {
        const successes: Record<string, number> = {};
        items.forEach((item, idx) => {
          successes[item.key || `add_${idx}`] = 1000 + idx + 1;
        });
        return { successes, errors: {} };
      }),
      batchUpdateLeads: vi.fn().mockImplementation(async (items: any[]) => {
        const successes: Record<string, boolean> = {};
        items.forEach((item, idx) => {
          successes[item.key || `upd_${idx}`] = true;
        });
        return { successes, errors: {} };
      }),
      getLead: vi.fn(),
      listLeads: vi.fn().mockResolvedValue([]),
      findByCommunication: vi.fn().mockResolvedValue([]),
    };
    mockMappingService = {
      loadMappingConfig: vi.fn(),
      transformRow: vi.fn(),
      transformBitrixToRow: vi.fn().mockReturnValue({}),
    };
    hashService = new HashService();
    lockService = new LockService();
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      printVietnameseSummary: vi.fn(),
    };

    deduplicationService = new DeduplicationService(mockBitrixLeadService, mockLogger);
    forwardSyncService = new ForwardSyncService(
      mockGoogleSheetsService,
      mockBitrixLeadService,
      mockMappingService,
      hashService,
      deduplicationService,
      mockLogger,
    );
    reverseSyncService = new ReverseSyncService(
      mockGoogleSheetsService,
      mockBitrixLeadService,
      mockMappingService,
      hashService,
      mockLogger,
    );
    syncHistoryService = new SyncHistoryService();

    orchestrator = new SyncOrchestratorService(
      lockService,
      forwardSyncService,
      reverseSyncService,
      syncHistoryService,
      mockLogger,
    );
  });

  it('TC1: should create new lead when row is new and has no duplicate', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Lead 1', Email: 'lead1@test.com' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: { [SYNC_STATUS_VI.SYNCED]: 2 },
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Lead 1', EMAIL: [{ VALUE: 'lead1@test.com', VALUE_TYPE: 'WORK' }] },
      canonicalData: { TITLE: 'Lead 1', EMAIL: 'lead1@test.com' },
      errors: [],
      email: 'lead1@test.com',
      title: 'Lead 1',
    });

    mockBitrixLeadService.findByCommunication.mockResolvedValue([]);
    mockBitrixLeadService.addLead.mockResolvedValue(1001);

    const result = await orchestrator.runSync();

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockBitrixLeadService.batchAddLeads).toHaveBeenCalled();
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 2,
          status: SYNC_STATUS_VI.SYNCED,
          bitrixLeadId: 1001,
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC2: should skip unchanged row when SHA-256 hash matches and status is synced', async () => {
    const canonical = { TITLE: 'Lead Unchanged', EMAIL: 'unchanged@test.com' };
    const hash = hashService.computeHash(canonical);

    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Lead Unchanged' },
          rawValues: [],
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '500',
            lastSyncTime: '2026-03-01T00:00:00Z',
            errorMessage: '',
            syncHash: hash,
          },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Lead Unchanged' },
      canonicalData: canonical,
      errors: [],
      email: 'unchanged@test.com',
    });

    const result = await orchestrator.runSync();

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockBitrixLeadService.batchUpdateLeads).not.toHaveBeenCalled();
    expect(mockBitrixLeadService.batchAddLeads).not.toHaveBeenCalled();
  });

  it('TC3: should link to existing lead via deduplication (email match) and update', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Existing Lead', Email: 'existing@test.com' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Existing Lead' },
      canonicalData: { TITLE: 'Existing Lead' },
      errors: [],
      email: 'existing@test.com',
    });

    mockBitrixLeadService.findByCommunication.mockResolvedValue([888]);
    mockBitrixLeadService.batchUpdateLeads.mockResolvedValue({
      successes: { upd_0: true },
      errors: {},
    });

    const result = await orchestrator.runSync();

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockBitrixLeadService.batchUpdateLeads).toHaveBeenCalledWith([
      expect.objectContaining({ id: 888, fields: { TITLE: 'Existing Lead' } }),
    ]);
  });

  it('TC4: should detect deduplication conflict when email and phone match different leads', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Conflict Lead', Email: 'a@test.com', 'Số điện thoại': '0901234567' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: {},
      canonicalData: {},
      errors: [],
      email: 'a@test.com',
      phone: '+84901234567',
    });

    mockBitrixLeadService.findByCommunication.mockImplementation(async (type: string) => {
      if (type === 'EMAIL') return [101];
      if (type === 'PHONE') return [102];
      return [];
    });

    const result = await orchestrator.runSync();

    expect(result.failed).toBe(1);
    expect(mockBitrixLeadService.batchAddLeads).not.toHaveBeenCalled();
    expect(mockBitrixLeadService.batchUpdateLeads).not.toHaveBeenCalled();
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: SYNC_STATUS_VI.FAILED,
          errorMessage: ERROR_MESSAGES_VI.DEDUP_CONFLICT,
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC5: should prevent concurrent sync runs using lock service', async () => {
    lockService.acquire(); // Acquire beforehand to simulate active job

    const result = await orchestrator.runSync();

    expect(result.isSkippedDueToLock).toBe(true);
    expect(mockGoogleSheetsService.readRows).not.toHaveBeenCalled();
  });

  it('TC6: should mark as failed with clear CRM deleted message if lead was deleted in Bitrix without recreating zombie lead', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Deleted Lead', Email: 'deleted@test.com' },
          rawValues: [],
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '777',
            lastSyncTime: '2026-03-01T00:00:00Z',
            errorMessage: '',
            syncHash: 'oldhash',
          },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Deleted Lead' },
      canonicalData: { TITLE: 'Deleted Lead' },
      errors: [],
      email: 'deleted@test.com',
      title: 'Deleted Lead',
    });

    mockBitrixLeadService.batchUpdateLeads.mockResolvedValue({
      successes: {},
      errors: { upd_0: 'Lead is not found' },
    });

    const result = await orchestrator.runSync();

    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    expect(mockBitrixLeadService.batchAddLeads).not.toHaveBeenCalled();
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 2,
          status: SYNC_STATUS_VI.FAILED,
          errorMessage: expect.stringContaining('đã bị xóa trên CRM'),
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC7: should recover from post-create timeout using two-phase verification with phone and name match', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Timeout Lead', Email: 'timeout@test.com', 'Số điện thoại': '0901234567' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Timeout Lead', NAME: 'Nguyen Van B' },
      canonicalData: { TITLE: 'Timeout Lead' },
      errors: [],
      email: 'timeout@test.com',
      phone: '+84901234567',
      title: 'Timeout Lead',
      name: 'Nguyen Van B',
    });

    let addLeadAttempted = false;
    mockBitrixLeadService.findByCommunication.mockImplementation(async (type: string) => {
      if (!addLeadAttempted) return [];
      if (type === 'PHONE') return [1234];
      return [];
    });

    mockBitrixLeadService.batchAddLeads.mockImplementation(async () => {
      addLeadAttempted = true;
      return { successes: {}, errors: { add_0: 'ETIMEDOUT' } };
    });
    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 1234,
      NAME: 'Nguyen Van B', // Matches candidate name!
    });

    const result = await orchestrator.runSync();

    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: SYNC_STATUS_VI.SYNCED,
          bitrixLeadId: 1234,
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC8: should perform reverse sync (Bitrix -> Sheets) in two-way mode', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Old Title' },
          headers: ['Tiêu đề Lead'],
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '555',
            lastSyncTime: '2026-01-01T00:00:00Z',
          },
        },
      ],
      headers: ['Tiêu đề Lead'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 555,
      TITLE: 'Updated Title from Bitrix',
      DATE_MODIFY: '2026-09-08T10:00:00Z',
    });

    mockMappingService.transformBitrixToRow.mockReturnValue({
      'Tiêu đề Lead': 'Updated Title from Bitrix',
    });
    mockMappingService.transformRow.mockReturnValue({
      canonicalData: { TITLE: 'Updated Title from Bitrix' },
    });

    const res = await orchestrator.syncBitrixToSheets(555);

    expect(res.updated).toBe(1);
    expect(mockGoogleSheetsService.updateRowCells).toHaveBeenCalledWith(
      2,
      { 'Tiêu đề Lead': 'Updated Title from Bitrix' },
      ['Tiêu đề Lead'],
    );
  });

  it('TC8b: should append a new row to Google Sheets when a new lead is created in Bitrix24', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Existing Lead' },
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '100',
            lastSyncTime: '2026-01-01T00:00:00Z',
          },
        },
      ],
      headers: ['Tiêu đề Lead', 'Email'],
      systemColumnIndices: {
        [SYSTEM_COLUMNS.STATUS]: 2,
        [SYSTEM_COLUMNS.BITRIX_ID]: 3,
        [SYSTEM_COLUMNS.LAST_SYNC]: 4,
        [SYSTEM_COLUMNS.ERROR]: 5,
        [SYSTEM_COLUMNS.HASH]: 6,
      },
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 999,
      TITLE: 'Brand New Lead from Bitrix',
      EMAIL: [{ VALUE: 'new@bitrix.com' }],
      DATE_CREATE: '2026-09-08T14:00:00Z',
      DATE_MODIFY: '2026-09-08T14:00:00Z',
    });

    mockMappingService.transformBitrixToRow.mockReturnValue({
      'Tiêu đề Lead': 'Brand New Lead from Bitrix',
      Email: 'new@bitrix.com',
    });
    mockMappingService.transformRow.mockReturnValue({
      canonicalData: { TITLE: 'Brand New Lead from Bitrix', EMAIL: 'new@bitrix.com' },
    });

    const res = await orchestrator.syncBitrixToSheets(999);

    expect(res.created).toBe(1);
    expect(mockGoogleSheetsService.appendRows).toHaveBeenCalled();
  });

  it('TC9: should skip reverse sync if lock is currently held', async () => {
    lockService.acquire();

    const res = await orchestrator.syncBitrixToSheets(555);
    expect(res.isSkippedDueToLock).toBe(true);
  });

  it('TC10: should skip reverse sync for row when Bitrix lead is not found or not modified recently', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Title' },
          headers: ['Tiêu đề Lead'],
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '555',
            lastSyncTime: '2026-09-08T12:00:00Z',
          },
        },
      ],
      headers: ['Tiêu đề Lead'],
      systemColumnIndices: {},
    });

    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 555,
      TITLE: 'Title',
      DATE_MODIFY: '2026-01-01T00:00:00Z', // Older than lastSyncTime!
    });

    const res = await orchestrator.syncBitrixToSheets(555);
    expect(res.updated).toBe(0);
    expect(mockGoogleSheetsService.updateRowCells).not.toHaveBeenCalled();
  });

  it('TC11: should handle validation error and update row status to failed', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': '' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: {},
    });

    mockMappingService.transformRow.mockReturnValue({
      success: false,
      bitrixFields: {},
      canonicalData: {},
      errors: ['Bắt buộc phải có Tiêu đề Lead'],
      email: null,
      phone: null,
    });

    const result = await orchestrator.runSync();
    expect(result.failed).toBe(1);
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 2,
          status: SYNC_STATUS_VI.FAILED,
          errorMessage: 'Bắt buộc phải có Tiêu đề Lead',
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC12: should record and retrieve logs via getRecentLogs', async () => {
    const logs = orchestrator.getRecentLogs();
    expect(Array.isArray(logs)).toBe(true);
  });

  it('TC13: should format lastSyncTime as DD/MM/YYYY HH:mm:ss when writing system updates to sheets', async () => {
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Lead Date Test', Email: 'datetest@example.com' },
          rawValues: [],
          systemFields: { status: '', bitrixLeadId: null, lastSyncTime: null, errorMessage: null, syncHash: null },
        },
      ],
      systemColumnIndices: { [SYNC_STATUS_VI.SYNCED]: 2 },
    });

    mockMappingService.transformRow.mockReturnValue({
      success: true,
      bitrixFields: { TITLE: 'Lead Date Test', EMAIL: [{ VALUE: 'datetest@example.com' }] },
      canonicalData: { TITLE: 'Lead Date Test' },
      errors: [],
      email: 'datetest@example.com',
      title: 'Lead Date Test',
    });

    mockBitrixLeadService.findByCommunication.mockResolvedValue([]);

    const result = await orchestrator.runSync();
    expect(result.created).toBe(1);

    const dateRegex = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 2,
          status: SYNC_STATUS_VI.SYNCED,
          bitrixLeadId: 1001,
          lastSyncTime: expect.stringMatching(dateRegex),
        }),
      ]),
      expect.anything(),
    );
  });

  it('TC14: should correctly parse DD/MM/YYYY HH:mm:ss in reverse sync for conflict resolution', async () => {
    const existingHash = hashService.computeHash({ 'Tiêu đề Lead': 'Title Existing' });
    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: [
        {
          rowIndex: 2,
          data: { 'Tiêu đề Lead': 'Title Existing' },
          headers: ['Tiêu đề Lead'],
          systemFields: {
            status: SYNC_STATUS_VI.SYNCED,
            bitrixLeadId: '777',
            lastSyncTime: '08/09/2026 15:30:00', // DD/MM/YYYY HH:mm:ss format
            syncHash: existingHash,
          },
        },
      ],
      headers: ['Tiêu đề Lead'],
      systemColumnIndices: {},
    });

    // Bitrix lead modified at 2026-09-08 14:00:00 (older than 15:30:00)
    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 777,
      TITLE: 'Title Existing',
      DATE_MODIFY: '2026-09-08T07:00:00Z', // 14:00:00 GMT+7 (older than 15:30)
    });

    mockMappingService.transformBitrixToRow.mockReturnValue({ 'Tiêu đề Lead': 'Title Existing' });
    mockMappingService.transformRow.mockReturnValue({ canonicalData: { 'Tiêu đề Lead': 'Title Existing' } });

    const res = await orchestrator.syncBitrixToSheets(777);
    expect(res.updated).toBe(0);
    expect(mockGoogleSheetsService.updateRowCells).not.toHaveBeenCalled();
  });
});


