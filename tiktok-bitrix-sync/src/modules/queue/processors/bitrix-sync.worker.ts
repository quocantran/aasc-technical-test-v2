import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { QUEUE_NAMES, JOB_NAMES } from '../../../common/constants/queue.constants';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { BITRIX_ADAPTER, IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { LeadMappingService } from '../../lead/services/lead-mapping.service';
import { AUDIT_ACTIONS, LEAD_STATUS } from '../../../common/constants/api.constants';

@Processor(QUEUE_NAMES.BITRIX_SYNC, {
  limiter: {
    max: 2,
    duration: 1000,
  },
})
@Injectable()
export class BitrixSyncWorker extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadMappingService: LeadMappingService,
    @Inject(BITRIX_ADAPTER)
    private readonly bitrixAdapter: IBitrixCrmAdapter,
    @InjectQueue(QUEUE_NAMES.DEAL_CONVERSION)
    private readonly dealConversionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TIKTOK_EVENTS_SYNC)
    private readonly tiktokEventsQueue: Queue,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === JOB_NAMES.SYNC_LEADS_BATCH_TO_BITRIX) {
      return this.processBatch(job);
    }

    const { leadId, existingBitrix24Id } = job.data;
    this.logger.log(`Syncing lead #${leadId} to Bitrix24 CRM`, 'BitrixSyncWorker');

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      this.logger.error(`Lead #${leadId} not found in DB`, undefined, 'BitrixSyncWorker');
      return { skipped: true, reason: 'LEAD_NOT_FOUND' };
    }

    try {
      const bitrixPayload = await this.leadMappingService.mapTikTokToBitrix(lead.rawData as any);

      let bitrixId = lead.bitrix24Id || existingBitrix24Id;

      if (bitrixId) {
        // Update existing lead in Bitrix24
        this.logger.log(`Updating existing Lead #${bitrixId} in Bitrix24`, 'BitrixSyncWorker');
        await this.bitrixAdapter.updateLead(bitrixId, bitrixPayload);
      } else {
        // Create new lead in Bitrix24
        this.logger.log(`Creating new Lead in Bitrix24 for: ${lead.name}`, 'BitrixSyncWorker');
        const res = await this.bitrixAdapter.createLead(bitrixPayload, { REGISTER_SONET_EVENT: 'N' });
        bitrixId = res.id;
      }

      // Log timeline comment in Bitrix24
      await this.bitrixAdapter.addTimelineComment(
        'lead',
        bitrixId,
        `[TikTok Sync] Lead imported from Campaign "${lead.campaignName || 'TikTok'}" (Ad: "${lead.adName || 'N/A'}", Form: "${lead.formName || 'N/A'}") at ${new Date().toISOString()}`,
      );

      // Update lead in PostgreSQL
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          bitrix24Id: bitrixId,
          status: LEAD_STATUS.SYNCED,
          syncError: null,
        },
      });

      // Update campaign metrics
      if (lead.campaignId) {
        await this.prisma.campaignMetric.upsert({
          where: { campaignId: lead.campaignId },
          update: { syncedLeads: { increment: 1 } },
          create: {
            campaignId: lead.campaignId,
            campaignName: lead.campaignName || 'Campaign',
            syncedLeads: 1,
          },
        });
      }

      // Audit log
      await this.prisma.auditLog.create({
        data: {
          leadId: lead.id,
          action: AUDIT_ACTIONS.LEAD_SYNCED,
          entityType: 'LEAD',
          entityId: lead.id,
          details: { bitrix24Id: bitrixId },
        },
      });

      // Enqueue to Deal Conversion Queue
      const dealJobId = `deal-conversion-${lead.id}-v1`;
      await this.dealConversionQueue.add(
        JOB_NAMES.EVALUATE_DEAL_RULES,
        { leadId: lead.id },
        {
          jobId: dealJobId,
          removeOnComplete: 100,
          attempts: 3,
        },
      );

      // Enqueue to TikTok Events Queue to track Form Submission
      await this.tiktokEventsQueue.add(
        JOB_NAMES.SEND_TIKTOK_EVENT,
        { leadId: lead.id, eventType: 'SubmitForm' },
        { removeOnComplete: 100 },
      );

      this.logger.log(
        `Lead #${lead.id} successfully synced to Bitrix24 Lead #${bitrixId}`,
        'BitrixSyncWorker',
      );

      return { leadId: lead.id, bitrix24Id: bitrixId };
    } catch (err: any) {
      this.logger.error(`Bitrix sync failed for lead #${leadId}: ${err.message}`, err.stack, 'BitrixSyncWorker');

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LEAD_STATUS.FAILED,
          syncError: err.message,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          leadId: lead.id,
          action: AUDIT_ACTIONS.LEAD_SYNC_FAILED,
          entityType: 'LEAD',
          entityId: lead.id,
          details: { error: err.message },
        },
      });

      // If attempts exhausted, record to DLQ
      if (job.attemptsMade + 1 >= (job.opts.attempts || 5)) {
        await this.prisma.dlqRecord.create({
          data: {
            queueName: QUEUE_NAMES.BITRIX_SYNC,
            jobId: String(job.id),
            jobName: job.name,
            payload: job.data,
            errorMessage: err.message,
            stackTrace: err.stack,
            attempts: job.attemptsMade + 1,
          },
        });
      }

      throw err;
    }
  }

  private async processBatch(job: Job<any, any, string>): Promise<any> {
    const { leadIds = [], migrationJobId, batchIndex = 0 } = job.data;
    this.logger.log(`Processing native batch sync #${batchIndex} with ${leadIds.length} leads`, 'BitrixSyncWorker');

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return { skipped: true, reason: 'EMPTY_BATCH' };
    }

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds } },
    });

    const batchItems: Array<{ key: string; data: any }> = [];
    for (const lead of leads) {
      const bitrixPayload = await this.leadMappingService.mapTikTokToBitrix(lead.rawData as any);
      batchItems.push({ key: lead.id, data: bitrixPayload });
    }

    const batchResults = await this.bitrixAdapter.createLeadsBatch(batchItems);
    let successCount = 0;
    let failCount = 0;

    for (const lead of leads) {
      const itemResult = batchResults[lead.id];
      if (itemResult?.success && itemResult?.id) {
        successCount++;
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            bitrix24Id: itemResult.id,
            status: LEAD_STATUS.SYNCED,
            syncError: null,
          },
        });

        // Enqueue to Deal Conversion Queue
        const dealJobId = `deal-conversion-${lead.id}-v1`;
        await this.dealConversionQueue.add(
          JOB_NAMES.EVALUATE_DEAL_RULES,
          { leadId: lead.id },
          { jobId: dealJobId, removeOnComplete: 100, attempts: 3 },
        );
      } else {
        failCount++;
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: LEAD_STATUS.FAILED,
            syncError: itemResult?.error || 'Batch creation failed',
          },
        });
      }
    }

    // Update migration job status if present
    if (migrationJobId) {
      const syncJob = await this.prisma.syncJob.findUnique({ where: { id: migrationJobId } });
      if (syncJob) {
        const newProcessed = syncJob.processedItems + successCount;
        const newFailed = syncJob.failedItems + failCount;
        const total = syncJob.totalItems || 1;
        const progress = Math.min(100, Math.round(((newProcessed + newFailed) / total) * 100));
        const isDone = (newProcessed + newFailed) >= total;

        await this.prisma.syncJob.update({
          where: { id: migrationJobId },
          data: {
            processedItems: newProcessed,
            failedItems: newFailed,
            progress,
            status: isDone ? 'completed' : 'in_progress',
            completedAt: isDone ? new Date() : null,
          },
        });
      }
    }

    return { total: leads.length, successCount, failCount };
  }
}
