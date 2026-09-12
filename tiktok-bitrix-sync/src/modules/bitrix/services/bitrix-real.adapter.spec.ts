import { BitrixRealAdapter } from './bitrix-real.adapter';
import { BitrixHttpService } from './bitrix-http.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BitrixRealAdapter', () => {
  let adapter: BitrixRealAdapter;
  let mockHttpService: any;

  beforeEach(() => {
    mockHttpService = {
      callMethod: jest.fn(),
      executeBatch: jest.fn(),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    adapter = new BitrixRealAdapter(mockHttpService as BitrixHttpService, mockLogger);
  });

  it('should call crm.lead.add with correct parameters', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce(12345);

    const res = await adapter.createLead({ TITLE: 'Real Lead' });
    expect(res.id).toBe(12345);
    expect(mockHttpService.callMethod).toHaveBeenCalledWith(
      'crm.lead.add',
      expect.objectContaining({ fields: { TITLE: 'Real Lead' } }),
    );
  });

  it('should call crm.deal.add with correct parameters', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce(67890);

    const res = await adapter.createDeal({ TITLE: 'Real Deal', OPPORTUNITY: 5000000 });
    expect(res.id).toBe(67890);
    expect(mockHttpService.callMethod).toHaveBeenCalledWith(
      'crm.deal.add',
      expect.objectContaining({ fields: expect.objectContaining({ TITLE: 'Real Deal' }) }),
    );
  });

  it('should call crm.duplicate.findbycomm and return lead IDs', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce({ LEAD: ['101', '102'] });

    const ids = await adapter.findDuplicates('EMAIL', ['test@example.com']);
    expect(ids).toEqual([101, 102]);
  });

  it('should update lead and get lead', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce(true);
    const updated = await adapter.updateLead(101, { TITLE: 'Updated Lead' });
    expect(updated).toBe(true);

    mockHttpService.callMethod.mockResolvedValueOnce({ ID: '101', TITLE: 'Updated Lead' });
    const lead = await adapter.getLead(101);
    expect(lead.TITLE).toBe('Updated Lead');
  });

  it('should update deal, get deal, and find by title', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce(true);
    const updated = await adapter.updateDeal(202, { STAGE_ID: 'WON' });
    expect(updated).toBe(true);

    mockHttpService.callMethod.mockResolvedValueOnce({ ID: '202', TITLE: 'Deal 202' });
    const deal = await adapter.getDeal(202);
    expect(deal.TITLE).toBe('Deal 202');

    mockHttpService.callMethod.mockResolvedValueOnce([{ ID: '202', TITLE: 'Deal 202' }]);
    const found = await adapter.findDealByTitle('Deal 202');
    expect(found?.id).toBe(202);
  });

  it('should add timeline comment and send notification', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce(1);
    const commentRes = await adapter.addTimelineComment('lead', 101, 'Test comment');
    expect(commentRes).toBe(true);

    mockHttpService.callMethod.mockResolvedValueOnce(true);
    const notifyRes = await adapter.sendNotification(1, 'Test alert notification');
    expect(notifyRes).toBe(true);
  });

  it('should handle timeline comment and notification failure gracefully', async () => {
    mockHttpService.callMethod.mockRejectedValueOnce(new Error('Network error'));
    const commentRes = await adapter.addTimelineComment('lead', 101, 'Test comment');
    expect(commentRes).toBe(false);

    mockHttpService.callMethod.mockRejectedValueOnce(new Error('Network error'));
    const notifyRes = await adapter.sendNotification(1, 'Test alert notification');
    expect(notifyRes).toBe(false);
  });

  it('should return null when getLead receives 404', async () => {
    const error404: any = new Error('Lead not found');
    error404.response = { status: 404 };
    mockHttpService.callMethod.mockRejectedValueOnce(error404);

    const result = await adapter.getLead(999);
    expect(result).toBeNull();
  });

  it('should handle createLeadsBatch with success and errors', async () => {
    mockHttpService.executeBatch.mockResolvedValueOnce({
      result: { cmd_0: 1001 },
      result_error: { cmd_1: 'Duplicate contact' },
    });

    const items = [
      { key: 'cmd_0', data: { TITLE: 'Lead 1' } },
      { key: 'cmd_1', data: { TITLE: 'Lead 2' } },
    ];

    const batchRes = await adapter.createLeadsBatch(items);
    expect(batchRes.cmd_0.success).toBe(true);
    expect(batchRes.cmd_0.id).toBe(1001);
    expect(batchRes.cmd_1.success).toBe(false);
    expect(batchRes.cmd_1.error).toContain('Duplicate contact');
  });

  it('should return empty object when createLeadsBatch is called with empty array', async () => {
    const res = await adapter.createLeadsBatch([]);
    expect(res).toEqual({});
  });

  it('should handle batch item error without bitrixErr fallback to unknown error', async () => {
    mockHttpService.executeBatch.mockResolvedValueOnce({
      result: {},
      result_error: {},
    });

    const res = await adapter.createLeadsBatch([{ key: 'k1', data: { TITLE: 'Lead' } }]);
    expect(res.k1.success).toBe(false);
    expect(res.k1.error).toBe('Unknown Bitrix batch error');
  });

  it('should find deal by origin when found, empty, and on error', async () => {
    // Found
    mockHttpService.callMethod.mockResolvedValueOnce([{ ID: '555', TITLE: 'Origin Deal' }]);
    const found = await adapter.findDealByOrigin('TIKTOK', 'origin_123');
    expect(found?.id).toBe(555);

    // Empty array
    mockHttpService.callMethod.mockResolvedValueOnce([]);
    const notFound = await adapter.findDealByOrigin('TIKTOK', 'missing');
    expect(notFound).toBeNull();

    // Exception
    mockHttpService.callMethod.mockRejectedValueOnce(new Error('Bitrix CRM down'));
    const onErr = await adapter.findDealByOrigin('TIKTOK', 'err');
    expect(onErr).toBeNull();
  });

  it('should return null when findDealByTitle receives empty array', async () => {
    mockHttpService.callMethod.mockResolvedValueOnce([]);
    const res = await adapter.findDealByTitle('Empty');
    expect(res).toBeNull();
  });

  it('should handle getDeal 404 and rethrow other errors', async () => {
    const err404: any = new Error('Deal not found');
    mockHttpService.callMethod.mockRejectedValueOnce(err404);
    const nullDeal = await adapter.getDeal(999);
    expect(nullDeal).toBeNull();

    const err500 = new Error('Database crashed');
    mockHttpService.callMethod.mockRejectedValueOnce(err500);
    await expect(adapter.getDeal(123)).rejects.toThrow('Database crashed');
  });

  it('should rethrow getLead errors when not 404', async () => {
    const err500 = new Error('Network timeout');
    mockHttpService.callMethod.mockRejectedValueOnce(err500);
    await expect(adapter.getLead(101)).rejects.toThrow('Network timeout');
  });

  it('should return empty duplicates when input is empty or response has no LEAD field', async () => {
    const emptyInput = await adapter.findDuplicates('EMAIL', ['', '   ']);
    expect(emptyInput).toEqual([]);

    mockHttpService.callMethod.mockResolvedValueOnce({});
    const noLead = await adapter.findDuplicates('EMAIL', ['valid@email.com']);
    expect(noLead).toEqual([]);
  });
});


