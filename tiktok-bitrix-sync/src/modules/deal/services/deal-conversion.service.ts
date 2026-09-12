import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { BITRIX_ADAPTER, IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { RuleEvaluatorService } from '../../rule-engine/services/rule-evaluator.service';
import { ConfigService } from '../../config-mgmt/services/config.service';
import { ConvertLeadDto } from '../dto/convert-lead.dto';
import { AUDIT_ACTIONS, DEAL_STATUS, LEAD_STATUS } from '../../../common/constants/api.constants';

@Injectable()
export class DealConversionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BITRIX_ADAPTER)
    private readonly bitrixAdapter: IBitrixCrmAdapter,
    private readonly ruleEvaluator: RuleEvaluatorService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  // Converts a lead into a deal using the intent-first pattern.
  // Evaluates rules, persists deal intent in DB, calls Bitrix24, and updates status.
  async convertLeadToDeal(leadId: string, manualDto?: ConvertLeadDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead #${leadId} not found`);
    }

    let ruleId = 'manual';
    let dealTitle = manualDto?.title || `Deal: ${lead.name}`;
    let pipelineId = manualDto?.pipeline_id || '0';
    let stageId = manualDto?.stage_id || 'NEW';
    let probability = manualDto?.probability ?? 30;
    let amount = manualDto?.amount;
    let currency = manualDto?.currency || 'VND';
    let assignedTo = manualDto?.assigned_to || '1';

    // If not manual override, evaluate against dynamic rules
    if (!manualDto || Object.keys(manualDto).length === 0) {
      const configuredRules = await this.configService.getDealRules();
      const evalResult = this.ruleEvaluator.evaluateRules(configuredRules, lead.rawData as any);

      if (!evalResult.matched || !evalResult.dealData) {
        this.logger.log(`No deal conversion rules matched for Lead #${leadId}`, 'DealConversionService');
        return { converted: false, reason: 'NO_RULE_MATCH' };
      }

      ruleId = evalResult.rule?.id || 'default_rule';
      dealTitle = evalResult.dealData.title;
      pipelineId = evalResult.dealData.pipeline_id;
      stageId = evalResult.dealData.stage_id;
      probability = evalResult.dealData.probability;
      amount = evalResult.dealData.amount;
      currency = evalResult.dealData.currency || 'VND';
      assignedTo = evalResult.dealData.assigned_to || '1';
    }

    // Step 1: Create local deal intent (Guarantees idempotency via @@unique([leadId, ruleId]))
    const dealIntent = await this.prisma.deal.upsert({
      where: {
        leadId_ruleId: {
          leadId: lead.id,
          ruleId,
        },
      },
      update: {
        title: dealTitle,
        pipelineId,
        stage: stageId,
        amount,
        currency,
        probability,
        assignedTo,
      },
      create: {
        leadId: lead.id,
        ruleId,
        title: dealTitle,
        pipelineId,
        stage: stageId,
        amount,
        currency,
        probability,
        assignedTo,
        status: DEAL_STATUS.PENDING,
      },
    });

    // If deal already created in Bitrix, return it
    if (dealIntent.bitrix24Id && dealIntent.status === DEAL_STATUS.CREATED) {
      this.logger.log(
        `Deal already created for Lead #${leadId} with Rule [${ruleId}]: Bitrix #${dealIntent.bitrix24Id}`,
        'DealConversionService',
      );
      return { converted: true, deal: dealIntent, bitrix24Id: dealIntent.bitrix24Id };
    }

    // Step 2: Call Bitrix24 to create deal
    let bitrixDealId: number;
    const correlationKey = `tiktok:lead:${lead.id}:rule:${ruleId}`;
    try {
      const bitrixPayload: any = {
        TITLE: dealTitle,
        CATEGORY_ID: Number(pipelineId) || 0,
        STAGE_ID: stageId,
        OPPORTUNITY: amount ? Number(amount) : 0,
        CURRENCY_ID: currency,
        PROBABILITY: probability,
        ASSIGNED_BY_ID: Number(assignedTo) || 1,
        ORIGINATOR_ID: 'TIKTOK_SYNC',
        ORIGIN_ID: correlationKey,
        COMMENTS: `[CorrelationKey:${correlationKey}] Converted from TikTok Lead #${lead.externalId}`,
        SOURCE_ID: 'TIKTOK',
        SOURCE_DESCRIPTION: lead.campaignName || 'TikTok Campaign',
      };

      if (lead.utmSource) bitrixPayload.UTM_SOURCE = lead.utmSource;
      if (lead.utmCampaign) bitrixPayload.UTM_CAMPAIGN = lead.utmCampaign;
      if (lead.ttclid) bitrixPayload.UF_CRM_TTCLID = lead.ttclid;

      const remoteRes = await this.bitrixAdapter.createDeal(bitrixPayload);
      bitrixDealId = remoteRes.id;
    } catch (err: any) {
      this.logger.warn(
        `Error calling createDeal on Bitrix: ${err.message}. Attempting reconciliation...`,
        'DealConversionService',
      );

      // Reconciliation: 1. Deterministic Origin ID, 2. Fallback by Title
      let reconciled = this.bitrixAdapter.findDealByOrigin
        ? await this.bitrixAdapter.findDealByOrigin('TIKTOK_SYNC', correlationKey)
        : null;
      if (!reconciled) {
        reconciled = await this.bitrixAdapter.findDealByTitle(dealTitle);
      }

      if (reconciled) {
        bitrixDealId = reconciled.id;
        this.logger.log(`Successfully reconciled Deal #${bitrixDealId}`, 'DealConversionService');
      } else {
        await this.prisma.deal.update({
          where: { id: dealIntent.id },
          data: { status: DEAL_STATUS.FAILED },
        });
        throw err;
      }
    }

    // Step 3 & 4: Atomic Database Transaction - Update deal, lead, and campaign metrics together
    const isFirstTimeConverted = dealIntent.status === DEAL_STATUS.PENDING;
    const txOperations: any[] = [
      this.prisma.deal.update({
        where: { id: dealIntent.id },
        data: {
          bitrix24Id: bitrixDealId,
          status: DEAL_STATUS.CREATED,
        },
      }),
      this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: LEAD_STATUS.CONVERTED },
      }),
    ];

    if (isFirstTimeConverted && lead.campaignId) {
      txOperations.push(
        this.prisma.campaignMetric.upsert({
          where: { campaignId: lead.campaignId },
          update: {
            convertedDeals: { increment: 1 },
            totalRevenue: { increment: Number(amount || 0) },
          },
          create: {
            campaignId: lead.campaignId,
            campaignName: lead.campaignName || 'Campaign',
            convertedDeals: 1,
            totalRevenue: Number(amount || 0),
          },
        }),
      );
    }

    const [updatedDeal] =
      typeof this.prisma.$transaction === 'function'
        ? await this.prisma.$transaction(txOperations)
        : await Promise.all(txOperations);

    // Step 5: Isolated & Independently Retried Side-effects
    // Deal is already committed to DB & Bitrix24. Timeline and Notification retry independently up to 3 times with exponential backoff.
    await this.executeWithIsolatedRetry('TimelineComment', () =>
      this.bitrixAdapter.addTimelineComment(
        'deal',
        bitrixDealId,
        `[TikTok Auto-Convert] Deal converted automatically via Rule "${ruleId}". Stage: ${stageId}, Probability: ${probability}%. Source: ${lead.campaignName || 'TikTok Campaign'}`,
      ),
    );

    if (assignedTo) {
      await this.executeWithIsolatedRetry('SalesNotification', () =>
        this.bitrixAdapter.sendNotification(
          assignedTo,
          `[New Deal] New Deal #${bitrixDealId} ("${dealTitle}") converted from TikTok Lead "${lead.name}" (Phone: ${lead.phone || 'N/A'}) has been assigned to you!`,
        ),
      );
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        leadId: lead.id,
        action: AUDIT_ACTIONS.DEAL_CREATED,
        entityType: 'DEAL',
        entityId: updatedDeal.id,
        details: {
          ruleId,
          bitrix24Id: bitrixDealId,
          title: dealTitle,
          amount,
        },
      },
    });

    this.logger.log(
      `Lead #${lead.id} successfully converted to Bitrix Deal #${bitrixDealId}`,
      'DealConversionService',
    );

    return {
      converted: true,
      deal: updatedDeal,
      bitrix24Id: bitrixDealId,
    };
  }

  // Executes non-critical side-effects with isolated exponential retry
  private async executeWithIsolatedRetry<T>(
    operationName: string,
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = process.env.NODE_ENV === 'test' ? 10 : 1000,
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        this.logger.warn(
          `[${operationName}] Attempt ${attempt}/${maxRetries} failed: ${err.message}. ${
            attempt < maxRetries ? `Retrying in ${delayMs * attempt}ms...` : 'All retries exhausted (deal remains valid).'
          }`,
          'DealConversionService',
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    return null;
  }
}
