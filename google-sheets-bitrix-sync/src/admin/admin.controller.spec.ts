import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from './admin.controller.js';
import fs from 'fs';

describe('AdminController', () => {
  let controller: AdminController;
  let mockSyncOrchestrator: any;
  let mockMappingService: any;
  let mockLockService: any;
  let mockBitrixLeadService: any;

  beforeEach(() => {
    mockSyncOrchestrator = {
      getRecentLogs: vi.fn().mockReturnValue([{ direction: 'SHEETS_TO_BITRIX', created: 1 }]),
      syncBitrixToSheets: vi.fn().mockResolvedValue({ totalRows: 5, updated: 1 }),
    };
    mockMappingService = {
      getMappingConfig: vi.fn().mockReturnValue({ fields: [{ sheetColumn: 'Họ và tên', bitrixField: 'NAME' }] }),
      saveMappingConfig: vi.fn(),
    };
    mockLockService = {
      isLocked: vi.fn().mockReturnValue(false),
    };
    mockBitrixLeadService = {
      getLeadFields: vi.fn().mockResolvedValue([
        { field: 'TITLE', label: 'Tên Lead', group: 'Thông tin chính', type: 'string', isRequired: true },
        { field: 'PHONE', label: 'Số điện thoại', group: 'Thông tin liên hệ', type: 'multifield' },
      ]),
    };

    controller = new AdminController(
      mockSyncOrchestrator,
      mockMappingService,
      mockLockService,
      mockBitrixLeadService,
    );
  });

  it('should return bitrix lead fields on GET /api/bitrix/lead-fields', async () => {
    const res = await controller.getBitrixLeadFields();
    expect(res.status).toBe('success');
    expect(res.data).toHaveLength(2);
    expect(mockBitrixLeadService.getLeadFields).toHaveBeenCalled();
  });

  it('should return mapping configuration on GET /api/mapping', () => {
    const res = controller.getMapping();
    expect(res.status).toBe('success');
    expect(res.data.fields).toHaveLength(1);
  });

  it('should update mapping configuration on POST /api/mapping', () => {
    const newConfig = { fields: [{ sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' as const }] };
    mockMappingService.getMappingConfig.mockReturnValue(newConfig);

    const res = controller.updateMapping(newConfig);
    expect(mockMappingService.saveMappingConfig).toHaveBeenCalledWith(newConfig);
    expect(res.status).toBe('success');
  });

  it('should return recent logs on GET /api/sync/logs', () => {
    const res = controller.getLogs();
    expect(res.status).toBe('success');
    expect(res.data).toHaveLength(1);
  });

  it('should trigger two-way sync on POST /api/sync/two-way', async () => {
    const res = await controller.triggerTwoWaySync();
    expect(res.status).toBe('success');
    expect(mockSyncOrchestrator.syncBitrixToSheets).toHaveBeenCalled();
  });

  it('should return warning on two-way sync if lock is active', async () => {
    mockLockService.isLocked.mockReturnValue(true);
    const res = await controller.triggerTwoWaySync();
    expect(res.status).toBe('warning');
    expect(res.isSkippedDueToLock).toBe(true);
  });

  it('should render HTML dashboard on GET /admin when file exists', () => {
    const html = controller.getAdminDashboard();
    expect(html).toContain('Quản Trị');
  });

  it('should render fallback HTML dashboard on GET /admin when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const html = controller.getAdminDashboard();
    expect(html).toContain('Vui lòng kiểm tra thư mục public/index.html');
  });
});
