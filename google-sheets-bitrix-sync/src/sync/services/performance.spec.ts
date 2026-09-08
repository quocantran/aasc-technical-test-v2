// Performance test simulating 150+ records synchronization through the pipeline (TC10)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOrchestratorService } from './sync-orchestrator.service.js';
import { HashService } from './hash.service.js';
import { LockService } from './lock.service.js';
import { DeduplicationService } from './deduplication.service.js';
import { ForwardSyncService } from './forward-sync.service.js';
import { ReverseSyncService } from './reverse-sync.service.js';
import { SyncHistoryService } from './sync-history.service.js';
import { MappingService } from '../../mapping/services/mapping.service.js';
import { SheetRow } from '../../google-sheets/interfaces/sheet-row.interface.js';

describe('Performance Test (150+ Records)', () => {
  let orchestrator: SyncOrchestratorService;
  let mockGoogleSheetsService: any;
  let mockBitrixLeadService: any;
  let mappingService: MappingService;
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
      batchUpdateSystemColumns: vi.fn().mockResolvedValue(undefined),
    };
    mockBitrixLeadService = {
      addLead: vi.fn().mockImplementation(async () => Math.floor(Math.random() * 100000)),
      updateLead: vi.fn().mockResolvedValue(true),
      batchAddLeads: vi.fn().mockImplementation(async (items: any[]) => {
        const successes: Record<string, number> = {};
        items.forEach((item, idx) => {
          successes[item.key || `add_${idx}`] = Math.floor(Math.random() * 100000) + 1;
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
      getLead: vi.fn().mockResolvedValue({ ID: 1, TITLE: 'Existing' }),
      findByCommunication: vi.fn().mockResolvedValue([]),
    };
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      printVietnameseSummary: vi.fn(),
    };

    const mockConfigService: any = {
      get: vi.fn().mockReturnValue('./config/mapping.json'),
    };

    mappingService = new MappingService(mockConfigService, mockLogger);
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Họ và tên', bitrixField: 'NAME', type: 'string' },
        { sheetColumn: 'Tiêu đề Lead', bitrixField: 'TITLE', type: 'string', required: true },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield', valueType: 'WORK' },
        { sheetColumn: 'Số điện thoại', bitrixField: 'PHONE', type: 'multifield', valueType: 'WORK' },
        {
          sheetColumn: 'Nguồn',
          bitrixField: 'SOURCE_ID',
          type: 'enum',
          valueMapping: { Website: 'WEB' },
          defaultValue: 'OTHER',
        },
      ],
    });

    hashService = new HashService();
    lockService = new LockService();
    deduplicationService = new DeduplicationService(mockBitrixLeadService, mockLogger);
    forwardSyncService = new ForwardSyncService(
      mockGoogleSheetsService,
      mockBitrixLeadService,
      mappingService,
      hashService,
      deduplicationService,
      mockLogger,
    );
    reverseSyncService = new ReverseSyncService(
      mockGoogleSheetsService,
      mockBitrixLeadService,
      mappingService,
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


  it('should process 150 rows within acceptable time limit without errors', async () => {
    const TOTAL_RECORDS = 150;
    const generatedRows: SheetRow[] = [];

    for (let i = 1; i <= TOTAL_RECORDS; i++) {
      const isUpdated = i <= 30; // 30 rows already have bitrixLeadId
      generatedRows.push({
        rowIndex: i + 1,
        data: {
          'Họ và tên': `Người dùng thử nghiệm ${i}`,
          'Tiêu đề Lead': `Cần tư vấn gói giải pháp số ${i}`,
          Email: `user${i}@performance-test.vn`,
          'Số điện thoại': `090${String(1000000 + i)}`,
          Nguồn: 'Website',
        },
        rawValues: [],
        systemFields: {
          status: isUpdated ? 'ĐÃ ĐỒNG BỘ' : '',
          bitrixLeadId: isUpdated ? String(i) : null,
          lastSyncTime: isUpdated ? '2026-03-01T00:00:00Z' : null,
          errorMessage: null,
          syncHash: isUpdated ? 'outdated_hash' : null,
        },
      });
    }

    mockGoogleSheetsService.readRows.mockResolvedValue({
      rows: generatedRows,
      systemColumnIndices: {
        __sync_status: 5,
        __bitrix_lead_id: 6,
        __last_sync_time: 7,
        __error_message: 8,
        __sync_hash: 9,
      },
    });

    const startTime = Date.now();
    const result = await orchestrator.runSync();
    const elapsed = Date.now() - startTime;

    expect(result.totalRows).toBe(TOTAL_RECORDS);
    expect(result.created).toBe(120);
    expect(result.updated).toBe(30);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    // Assert batch write back was called
    expect(mockGoogleSheetsService.batchUpdateSystemColumns).toHaveBeenCalledTimes(1);
    const updatesArg = mockGoogleSheetsService.batchUpdateSystemColumns.mock.calls[0][0];
    expect(updatesArg).toHaveLength(TOTAL_RECORDS);

    // Performance assertion: 150 in-memory processed rows with mock API under 5000ms
    expect(elapsed).toBeLessThan(5000);
  });
});
