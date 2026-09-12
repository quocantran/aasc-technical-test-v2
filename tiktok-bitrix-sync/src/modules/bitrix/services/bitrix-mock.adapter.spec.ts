import { BitrixMockAdapter } from './bitrix-mock.adapter';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BitrixMockAdapter', () => {
  let adapter: BitrixMockAdapter;

  beforeEach(() => {
    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;
    adapter = new BitrixMockAdapter(mockLogger);
  });

  it('should create and retrieve a mock lead', async () => {
    const res = await adapter.createLead({
      TITLE: 'Lead Test',
      NAME: 'John Doe',
      EMAIL: [{ VALUE: 'john@example.com', VALUE_TYPE: 'WORK' }],
    });

    expect(res.id).toBeGreaterThan(0);
    const lead = await adapter.getLead(res.id);
    expect(lead).toBeDefined();
    expect(lead.TITLE).toBe('Lead Test');
  });

  it('should find duplicates by email in mock store', async () => {
    await adapter.createLead({
      TITLE: 'Lead 1',
      EMAIL: [{ VALUE: 'duplicate@test.com', VALUE_TYPE: 'WORK' }],
    });

    const duplicates = await adapter.findDuplicates('EMAIL', ['duplicate@test.com', 'other@test.com']);
    expect(duplicates.length).toBe(1);
  });

  it('should create deal and find by deterministic title', async () => {
    const title = 'Deterministic Title Deal';
    const dealRes = await adapter.createDeal({
      TITLE: title,
      OPPORTUNITY: 5000000,
      STAGE_ID: 'NEW',
    });

    expect(dealRes.id).toBeGreaterThan(0);

    const found = await adapter.findDealByTitle(title);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(dealRes.id);
  });

  it('should update lead and deal in mock adapter', async () => {
    const lead = await adapter.createLead({ TITLE: 'Original Lead' });
    const leadUpdated = await adapter.updateLead(lead.id, { TITLE: 'Modified Lead' });
    expect(leadUpdated).toBe(true);

    const deal = await adapter.createDeal({ TITLE: 'Original Deal' });
    const dealUpdated = await adapter.updateDeal(deal.id, { TITLE: 'Modified Deal' });
    expect(dealUpdated).toBe(true);

    const retrievedDeal = await adapter.getDeal(deal.id);
    expect(retrievedDeal.TITLE).toBe('Modified Deal');
  });

  it('should add timeline comment and record notification in mock store', async () => {
    const commentRes = await adapter.addTimelineComment('lead', 1001, 'Imported from TikTok');
    expect(commentRes).toBe(true);
    expect(adapter.timelineComments.length).toBe(1);

    const notifyRes = await adapter.sendNotification(1, 'New Deal notification');
    expect(notifyRes).toBe(true);
    expect(adapter.notifications.length).toBe(1);
  });

  it('should create leads in batch', async () => {
    const batchItems = [
      { key: 'lead1', data: { TITLE: 'Batch 1' } },
      { key: 'lead2', data: { TITLE: 'Batch 2' } },
    ];
    const res = await adapter.createLeadsBatch(batchItems);
    expect(res.lead1.success).toBe(true);
    expect(res.lead2.success).toBe(true);
    expect(res.lead1.id).toBeDefined();
  });

  it('should return false or null when updating/getting non-existent lead or deal', async () => {
    const updateLeadRes = await adapter.updateLead(999999, { TITLE: 'Ghost' });
    expect(updateLeadRes).toBe(false);

    const lead = await adapter.getLead(999999);
    expect(lead).toBeNull();

    const updateDealRes = await adapter.updateDeal(999999, { TITLE: 'Ghost' });
    expect(updateDealRes).toBe(false);

    const deal = await adapter.getDeal(999999);
    expect(deal).toBeNull();
  });

  it('should find duplicates by phone number', async () => {
    await adapter.createLead({
      TITLE: 'Lead Phone',
      PHONE: [{ VALUE: '+84987654321', VALUE_TYPE: 'WORK' }],
    });

    const matches = await adapter.findDuplicates('PHONE', ['+84987654321', '0912345678']);
    expect(matches.length).toBe(1);

    const noMatches = await adapter.findDuplicates('PHONE', ['0000000000']);
    expect(noMatches.length).toBe(0);
  });

  it('should find deal by origin when present and return null when absent', async () => {
    await adapter.createDeal({
      TITLE: 'Origin Deal',
      ORIGINATOR_ID: 'TIKTOK',
      ORIGIN_ID: 'tt_deal_001',
    });

    const found = await adapter.findDealByOrigin('TIKTOK', 'tt_deal_001');
    expect(found).not.toBeNull();
    expect(found?.raw.TITLE).toBe('Origin Deal');

    const notFound = await adapter.findDealByOrigin('TIKTOK', 'missing_id');
    expect(notFound).toBeNull();
  });

  it('should return null when finding deal by non-existent title', async () => {
    const notFound = await adapter.findDealByTitle('No such title');
    expect(notFound).toBeNull();
  });

  it('should instantiate with default logger and assign default stage NEW', async () => {
    const defaultAdapter = new BitrixMockAdapter();
    const deal = await defaultAdapter.createDeal({ TITLE: 'Default Stage' });
    expect(deal.raw.STAGE_ID).toBe('NEW');
  });
});

