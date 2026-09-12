import { DealConversionService } from './deal-conversion.service';
import { PrismaService } from '../../../database/prisma.service';
import { IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { RuleEvaluatorService } from '../../rule-engine/services/rule-evaluator.service';
import { ConfigService } from '../../config-mgmt/services/config.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { NotFoundException } from '@nestjs/common';
import { DEAL_STATUS } from '../../../common/constants/api.constants';

describe('DealConversionService', () => {
  let service: DealConversionService;
  let mockPrisma: any;
  let mockBitrixAdapter: any;
  let mockRuleEvaluator: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deal: {
        upsert: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      campaignMetric: {
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };

    mockBitrixAdapter = {
      createDeal: jest.fn(),
      findDealByOrigin: jest.fn().mockResolvedValue(null),
      findDealByTitle: jest.fn(),
      addTimelineComment: jest.fn().mockResolvedValue(true),
      sendNotification: jest.fn().mockResolvedValue(true),
    };

    mockRuleEvaluator = {
      evaluateRules: jest.fn(),
    };

    mockConfigService = {
      getDealRules: jest.fn().mockResolvedValue([]),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new DealConversionService(
      mockPrisma as PrismaService,
      mockBitrixAdapter as IBitrixCrmAdapter,
      mockRuleEvaluator as RuleEvaluatorService,
      mockConfigService as ConfigService,
      mockLogger,
    );
  });

  it('should throw NotFoundException if lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    await expect(service.convertLeadToDeal('missing-lead')).rejects.toThrow(NotFoundException);
  });

  it('should return NO_RULE_MATCH if no rules match lead and no manualDto is passed', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-1',
      name: 'Nguyen Van A',
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({ matched: false });

    const res = await service.convertLeadToDeal('lead-1');
    expect(res.converted).toBe(false);
    expect(res.reason).toBe('NO_RULE_MATCH');
  });

  it('should convert lead to deal when rule matches', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-1',
      name: 'Nguyen Van A',
      externalId: 'evt_1',
      utmSource: 'tiktok',
      utmCampaign: 'sale_2026',
      utmMedium: 'cpc',
      bitrix24Id: 555,
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-spring-sale' },
      dealData: {
        title: 'Deal: Nguyen Van A',
        pipeline_id: '1',
        stage_id: 'NEW',
        probability: 30,
        amount: 5000000,
        currency: 'VND',
        assigned_to: '1',
      },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-1',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockResolvedValueOnce({ id: 9999 });

    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-1',
      bitrix24Id: 9999,
      status: 'created',
    });

    const res = await service.convertLeadToDeal('lead-1');
    expect(res.converted).toBe(true);
    expect(res.bitrix24Id).toBe(9999);
    expect(mockBitrixAdapter.createDeal).toHaveBeenCalled();
    expect(mockPrisma.lead.update).toHaveBeenCalled();
  });

  it('should return already created deal without calling Bitrix again', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-1',
      name: 'Nguyen Van A',
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-1' },
      dealData: { title: 'Existing', pipeline_id: '0', stage_id: 'NEW', probability: 20 },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-1',
      bitrix24Id: 8888,
      status: DEAL_STATUS.CREATED,
    });

    const res = await service.convertLeadToDeal('lead-1');
    expect(res.converted).toBe(true);
    expect(res.bitrix24Id).toBe(8888);
    expect(mockBitrixAdapter.createDeal).not.toHaveBeenCalled();
  });

  it('should convert lead to deal with manual override DTO', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-manual',
      name: 'Manual Lead',
      externalId: 'evt_man',
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-manual',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockResolvedValueOnce({ id: 1111 });

    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-manual',
      bitrix24Id: 1111,
      status: 'created',
    });

    const manualDto = {
      title: 'Manual VIP Deal',
      pipeline_id: '2',
      stage_id: 'PREPARATION',
      probability: 80,
      amount: 10000000,
      currency: 'USD',
      assigned_to: '5',
    };

    const res = await service.convertLeadToDeal('lead-manual', manualDto);
    expect(res.converted).toBe(true);
    expect(res.bitrix24Id).toBe(1111);
    expect(mockRuleEvaluator.evaluateRules).not.toHaveBeenCalled();
    expect(mockBitrixAdapter.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        TITLE: 'Manual VIP Deal',
        CATEGORY_ID: 2,
        STAGE_ID: 'PREPARATION',
        OPPORTUNITY: 10000000,
        CURRENCY_ID: 'USD',
        ASSIGNED_BY_ID: 5,
      }),
    );
  });

  it('should reconcile by title search if createDeal throws an error', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-1',
      name: 'Nguyen Van A',
      externalId: 'evt_1',
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-1' },
      dealData: {
        title: 'Reconcile Deal',
        pipeline_id: '1',
        stage_id: 'NEW',
        probability: 30,
      },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-1',
      status: 'pending',
    });

    // Simulated network timeout on Bitrix call
    mockBitrixAdapter.createDeal.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    // Reconcile finds deal created on remote server
    mockBitrixAdapter.findDealByTitle.mockResolvedValueOnce({ id: 7777 });

    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-1',
      bitrix24Id: 7777,
      status: 'created',
    });

    const res = await service.convertLeadToDeal('lead-1');
    expect(res.converted).toBe(true);
    expect(res.bitrix24Id).toBe(7777);
    expect(mockBitrixAdapter.findDealByTitle).toHaveBeenCalledWith('Reconcile Deal');
  });

  it('should rethrow error if createDeal fails and reconcile cannot find existing deal', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-fail',
      name: 'Fail Lead',
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-fail' },
      dealData: { title: 'Fail Deal', pipeline_id: '0', stage_id: 'NEW', probability: 10 },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-fail',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockRejectedValueOnce(new Error('CRM_CRASH'));
    mockBitrixAdapter.findDealByTitle.mockResolvedValueOnce(null);

    await expect(service.convertLeadToDeal('lead-fail')).rejects.toThrow('CRM_CRASH');
  });

  it('should continue deal conversion even if sendNotification throws an error', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-notify-fail',
      name: 'Notify Fail',
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-notify' },
      dealData: { title: 'Notify Deal', pipeline_id: '0', stage_id: 'NEW', probability: 50 },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-notify',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockResolvedValueOnce({ id: 2222 });
    mockBitrixAdapter.sendNotification.mockRejectedValueOnce(new Error('Notification failed'));

    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-notify',
      bitrix24Id: 2222,
      status: 'created',
    });

    const res = await service.convertLeadToDeal('lead-notify-fail');
    expect(res.converted).toBe(true);
    expect(res.bitrix24Id).toBe(2222);
  });

  it('should upsert campaign metric when lead has campaignId and is first time converted', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-camp-1',
      name: 'Campaign Lead',
      campaignId: 'camp-123',
      campaignName: 'Test Camp',
      phone: null,
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-camp' },
      dealData: { title: 'Camp Deal', pipeline_id: '0', stage_id: 'NEW', probability: 50, amount: 200000 },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-camp',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockResolvedValueOnce({ id: 3333 });
    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-camp',
      bitrix24Id: 3333,
      status: 'created',
    });

    const res = await service.convertLeadToDeal('lead-camp-1');
    expect(res.converted).toBe(true);
    expect(mockPrisma.campaignMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: 'camp-123' },
      }),
    );
  });

  it('should handle lead without campaignName or phone, and fallback when $transaction is not a function', async () => {
    const origTx = mockPrisma.$transaction;
    mockPrisma.$transaction = undefined;

    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-no-name',
      name: 'No Name Lead',
      campaignId: 'camp-456',
      campaignName: null,
      phone: null,
      rawData: {},
    });

    mockRuleEvaluator.evaluateRules.mockReturnValueOnce({
      matched: true,
      rule: { id: 'rule-456' },
      dealData: { title: 'Fallback Deal', pipeline_id: '0', stage_id: 'NEW', probability: 30, amount: null, assigned_to: '10' },
    });

    mockPrisma.deal.upsert.mockResolvedValueOnce({
      id: 'deal-intent-fallback',
      status: 'pending',
    });

    mockBitrixAdapter.createDeal.mockResolvedValueOnce({ id: 4444 });
    mockPrisma.deal.update.mockResolvedValueOnce({
      id: 'deal-intent-fallback',
      bitrix24Id: 4444,
      status: 'created',
    });

    // Exhaust retries for timeline comment
    mockBitrixAdapter.addTimelineComment.mockRejectedValue(new Error('Timeline service down'));

    const res = await service.convertLeadToDeal('lead-no-name');
    expect(res.converted).toBe(true);

    mockPrisma.$transaction = origTx;
  });
});

