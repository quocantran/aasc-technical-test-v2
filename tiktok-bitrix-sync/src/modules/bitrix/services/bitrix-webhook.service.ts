import { Injectable, Optional, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { BITRIX_ADAPTER, IBitrixCrmAdapter } from '../interfaces/bitrix-adapter.interface';
import { AUDIT_ACTIONS, DEAL_STATUS } from '../../../common/constants/api.constants';
import { QUEUE_NAMES, JOB_NAMES } from '../../../common/constants/queue.constants';

@Injectable()
export class BitrixWebhookService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @Inject(BITRIX_ADAPTER)
    private readonly bitrixAdapter: IBitrixCrmAdapter,
    @Optional()
    @InjectQueue(QUEUE_NAMES.TIKTOK_EVENTS_SYNC)
    private readonly tiktokEventsQueue?: Queue,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();
  }

  // Distributed self-echo guard: locks deal ID in Redis for 15 seconds
  async markDealRecentlyModified(dealId: number): Promise<void> {
    await this.redisService.set(`bitrix:echo:${dealId}`, '1', 15);
  }

  // Checks if deal was recently modified by this system to prevent infinite echo loops
  async isRecentlyModified(dealId: number): Promise<boolean> {
    const lock = await this.redisService.get(`bitrix:echo:${dealId}`);
    return !!lock;
  }

  // Core business logic processing Bitrix24 deal outbound webhooks
  async processDealWebhook(payload: any) {
    const eventName = String(payload?.event || '').toUpperCase();
    const rawId =
      payload?.data?.FIELDS?.ID ||
      payload?.data?.FIELDS_ID ||
      payload?.data?.ID ||
      payload?.ID;

    const dealId = Number(rawId);
    if (!dealId || isNaN(dealId)) {
      return { status: 'ignored', reason: 'Missing deal ID in payload' };
    }

    // Check distributed self-echo loop in Redis
    if (await this.isRecentlyModified(dealId)) {
      this.logger.log(`Ignoring distributed self-echo webhook on Deal #${dealId}`, 'BitrixWebhookService');
      return { status: 'ignored', reason: 'self_echo', dealId };
    }

    // Retrieve fresh deal state from Bitrix24 if available
    const remoteDeal = await this.bitrixAdapter.getDeal(dealId).catch(() => null);

    const stageId = String(
      payload?.data?.FIELDS?.STAGE_ID ||
      payload?.data?.STAGE_ID ||
      remoteDeal?.STAGE_ID ||
      '',
    ).toUpperCase();
    const isWon = stageId === 'WON' || stageId.endsWith(':WON');

    // Update local deal record if exists
    const localDeal = await this.prisma.deal.findFirst({
      where: { bitrix24Id: dealId },
      include: { lead: true },
    });

    if (localDeal) {
      const isAlreadyWon = localDeal.status === DEAL_STATUS.WON;
      const isNewWonTransition = isWon && !isAlreadyWon;
      const newStatus = isWon ? DEAL_STATUS.WON : localDeal.status;

      await this.prisma.deal.update({
        where: { id: localDeal.id },
        data: {
          stage: stageId || localDeal.stage,
          status: newStatus,
        },
      });

      // Audit log
      await this.prisma.auditLog.create({
        data: {
          leadId: localDeal.leadId,
          action: AUDIT_ACTIONS.DEAL_STAGE_CHANGED,
          entityType: 'DEAL',
          entityId: localDeal.id,
          details: {
            event: eventName,
            bitrix24Id: dealId,
            newStage: stageId,
            isWon,
            isAlreadyWon,
          },
        },
      });

      // Idempotency guard: Only trigger TikTok conversion and update metrics on fresh transition to WON
      if (isNewWonTransition && localDeal.lead?.ttclid) {
        this.logger.log(
          `Deal #${dealId} won! Triggering TikTok conversion for ttclid: ${localDeal.lead.ttclid}`,
          'BitrixWebhookService',
        );

        if (this.tiktokEventsQueue) {
          const syncJobId = `tiktok-events-${localDeal.leadId}-deal-won-${localDeal.id}`;
          await this.tiktokEventsQueue.add(
            JOB_NAMES.SEND_TIKTOK_EVENT,
            {
              leadId: localDeal.leadId,
              dealId: localDeal.id,
              eventType: 'CompletePayment',
            },
            {
              jobId: syncJobId,
              removeOnComplete: 100,
              attempts: 3,
            },
          );
          this.logger.log(`Enqueued TikTok conversion event for Deal #${dealId}`, 'BitrixWebhookService');
        }

        // Update campaign metrics (guarded against duplicate counting)
        if (localDeal.lead.campaignId) {
          await this.prisma.campaignMetric.upsert({
            where: { campaignId: localDeal.lead.campaignId },
            update: {
              wonDeals: { increment: 1 },
              totalRevenue: { increment: Number(localDeal.amount || 0) },
            },
            create: {
              campaignId: localDeal.lead.campaignId,
              campaignName: localDeal.lead.campaignName || 'Unknown Campaign',
              wonDeals: 1,
              totalRevenue: Number(localDeal.amount || 0),
            },
          });
        }
      } else if (isWon && isAlreadyWon) {
        this.logger.log(
          `Deal #${dealId} is already marked WON. Skipping duplicate TikTok conversion and metric updates (idempotent).`,
          'BitrixWebhookService',
        );
      }
    }

    return {
      status: 'accepted',
      event: eventName,
      dealId,
      stageId,
      isWon,
    };
  }
}
