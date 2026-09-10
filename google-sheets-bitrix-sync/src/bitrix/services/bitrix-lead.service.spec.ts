// Tests for BitrixLeadService verifying lead CRUD operations and deduplication queries
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitrixLeadService } from './bitrix-lead.service.js';
import { BITRIX_API_METHODS } from '../constants/bitrix-api.constants.js';

describe('BitrixLeadService', () => {
  let leadService: BitrixLeadService;
  let mockBitrixService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockBitrixService = {
      callMethod: vi.fn(),
      executeBatch: vi.fn(),
    };
    mockLogger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    leadService = new BitrixLeadService(mockBitrixService, mockLogger);
  });

  it('should call crm.lead.add with correct parameters and custom params', async () => {
    mockBitrixService.callMethod.mockResolvedValue(12345);

    const leadFields = { TITLE: 'Test Lead', NAME: 'Nguyen Van A' };
    const leadId = await leadService.addLead(leadFields, { REGISTER_SONET_EVENT: 'Y' });

    expect(leadId).toBe(12345);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_ADD, {
      fields: leadFields,
      params: { REGISTER_SONET_EVENT: 'Y' },
    });
  });

  it('should call crm.lead.update with correct ID and parameters', async () => {
    mockBitrixService.callMethod.mockResolvedValue(true);

    const result = await leadService.updateLead(12345, { TITLE: 'Updated Lead' });

    expect(result).toBe(true);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_UPDATE, {
      id: 12345,
      fields: { TITLE: 'Updated Lead' },
      params: { REGISTER_SONET_EVENT: 'N' },
    });
  });

  it('should get lead successfully and return lead data', async () => {
    const mockLead = { ID: '123', TITLE: 'Existing Lead' };
    mockBitrixService.callMethod.mockResolvedValue(mockLead);

    const result = await leadService.getLead(123);
    expect(result).toEqual(mockLead);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_GET, {
      id: 123,
    });
  });

  it('should return null when getLead encounters a Not Found error', async () => {
    mockBitrixService.callMethod.mockRejectedValue(new Error('Bitrix24 Error [NOT_FOUND]: Not found'));

    const result = await leadService.getLead(99999);
    expect(result).toBeNull();
  });

  it('should return null when getLead encounters ERROR_CORE', async () => {
    mockBitrixService.callMethod.mockRejectedValue(new Error('ERROR_CORE: Record does not exist'));

    const result = await leadService.getLead(99999);
    expect(result).toBeNull();
  });

  it('should rethrow unexpected error in getLead', async () => {
    mockBitrixService.callMethod.mockRejectedValue(new Error('QUERY_LIMIT_EXCEEDED'));

    await expect(leadService.getLead(123)).rejects.toThrow('QUERY_LIMIT_EXCEEDED');
  });

  it('should list leads with default and custom select fields', async () => {
    const leadsList = [{ ID: '1', TITLE: 'Lead 1' }];
    mockBitrixService.callMethod.mockResolvedValue(leadsList);

    const defaultResult = await leadService.listLeads({ STATUS_ID: 'NEW' });
    expect(defaultResult).toEqual(leadsList);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_LIST, {
      filter: { STATUS_ID: 'NEW' },
      select: ['*', 'UF_*', 'EMAIL', 'PHONE', 'WEB', 'IM'],
    });

    const customResult = await leadService.listLeads({ STATUS_ID: 'WON' }, ['ID', 'TITLE']);
    expect(customResult).toEqual(leadsList);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_LIST, {
      filter: { STATUS_ID: 'WON' },
      select: ['ID', 'TITLE'],
    });
  });

  it('should list leads and return empty array if response is null', async () => {
    mockBitrixService.callMethod.mockResolvedValue(null);
    const result = await leadService.listLeads({});
    expect(result).toEqual([]);
  });

  it('should delete lead by ID', async () => {
    mockBitrixService.callMethod.mockResolvedValue(true);

    const result = await leadService.deleteLead(456);
    expect(result).toBe(true);
    expect(mockBitrixService.callMethod).toHaveBeenCalledWith(BITRIX_API_METHODS.LEAD_DELETE, {
      id: 456,
    });
  });

  it('should return empty array in findByCommunication when no valid values provided', async () => {
    const result = await leadService.findByCommunication('EMAIL', ['', '  ', undefined as any]);
    expect(result).toEqual([]);
    expect(mockBitrixService.callMethod).not.toHaveBeenCalled();
  });

  it('should chunk values > 20 in findByCommunication and aggregate matched IDs', async () => {
    const emails = Array.from({ length: 25 }, (_, i) => `user${i}@example.com`);
    mockBitrixService.callMethod
      .mockResolvedValueOnce({ LEAD: ['101', '102'] })
      .mockResolvedValueOnce({ LEAD: ['103', '101'] }); // 101 duplicate check

    const leadIds = await leadService.findByCommunication('EMAIL', emails);
    expect(leadIds).toEqual([101, 102, 103]);
    expect(mockBitrixService.callMethod).toHaveBeenCalledTimes(2);
  });

  it('should find duplicates via crm.duplicate.findbycomm and handle null result', async () => {
    mockBitrixService.callMethod.mockResolvedValue(null);

    const leadIds = await leadService.findByCommunication('PHONE', ['0912345678']);
    expect(leadIds).toEqual([]);
  });

  it('should execute batchAddLeads and aggregate successes and errors with string and object error formats', async () => {
    mockBitrixService.executeBatch.mockResolvedValue({
      result: { add_0: 101 },
      result_error: {
        add_1: { error: 'ERROR_CORE', error_description: 'Failed to add' },
        add_2: 'Raw string error',
      },
    });

    const res = await leadService.batchAddLeads([
      { key: 'add_0', fields: { TITLE: 'Lead 1' }, params: { REGISTER_SONET_EVENT: 'Y' } },
      { key: 'add_1', fields: { TITLE: 'Lead 2' } },
      { key: 'add_2', fields: { TITLE: 'Lead 3' } },
    ]);

    expect(res.successes).toEqual({ add_0: 101 });
    expect(res.errors['add_1']).toContain('Failed to add');
    expect(res.errors['add_2']).toBe('Raw string error');
  });

  it('should execute batchUpdateLeads and aggregate successes and errors with custom params', async () => {
    mockBitrixService.executeBatch.mockResolvedValue({
      result: { upd_0: true },
      result_error: { upd_1: 'Update failed' },
    });

    const res = await leadService.batchUpdateLeads([
      { key: 'upd_0', id: 101, fields: { TITLE: 'Lead 1 Updated' }, params: { REGISTER_SONET_EVENT: 'Y' } },
      { key: 'upd_1', id: 102, fields: { TITLE: 'Lead 2 Updated' } },
    ]);

    expect(res.successes).toEqual({ upd_0: true });
    expect(res.errors['upd_1']).toBe('Update failed');
  });

  it('should return empty results when batch items are empty', async () => {
    const addRes = await leadService.batchAddLeads([]);
    const updRes = await leadService.batchUpdateLeads([]);
    expect(addRes).toEqual({ successes: {}, errors: {} });
    expect(updRes).toEqual({ successes: {}, errors: {} });
  });

  it('should retrieve lead fields and discover dynamic custom fields', async () => {
    mockBitrixService.callMethod.mockResolvedValue({
      TITLE: { type: 'string', isReadOnly: false, title: 'Lead Title' },
      ID: { type: 'integer', isReadOnly: true, title: 'Lead ID' },
      UF_CRM_TAX_ID: { type: 'string', isReadOnly: false, title: 'Tax ID' },
    });

    const fields = await leadService.getLeadFields();
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.field === 'TITLE')).toBe(true);
    expect(fields.some((f) => f.field === 'ID')).toBe(false); // ID is read-only
    expect(fields.some((f) => f.field === 'UF_CRM_TAX_ID')).toBe(true);
  });

  it('should fallback to standard lead catalog if api call fails', async () => {
    mockBitrixService.callMethod.mockRejectedValue(new Error('Network error'));

    const fields = await leadService.getLeadFields();
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.field === 'TITLE')).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
