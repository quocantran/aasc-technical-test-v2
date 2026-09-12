import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES, JOB_NAMES } from '../../../common/constants/queue.constants';
import { AUDIT_ACTIONS, EVENT_TYPES } from '../../../common/constants/api.constants';
import { LeadService } from '../../lead/services/lead.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Processor(QUEUE_NAMES.LEAD_PROCESSING)
@Injectable()
export class LeadProcessingWorker extends WorkerHost {
  constructor(
    private readonly leadService: LeadService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.BITRIX_SYNC)
    private readonly bitrixSyncQueue: Queue,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { webhookEventId, eventId, payload } = job.data;
    this.logger.log(`Processing lead job [${job.id}] for event ${eventId}`, 'LeadProcessingWorker');

    try {
      const eventType = payload.event || EVENT_TYPES.LEAD_GENERATE;

      // Branch 1: User interaction touchpoint without contact info -> record audit touchpoint without creating junk CRM leads
      const hasContact = payload.lead_data?.phone || payload.lead_data?.email;
      if (eventType === EVENT_TYPES.USER_INTERACTION && !hasContact) {
        this.logger.log(`Recorded user.interaction engagement touchpoint for event ${eventId}`, 'LeadProcessingWorker');
        
        await this.prisma.auditLog.create({
          data: {
            action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
            entityType: 'USER_INTERACTION',
            entityId: eventId,
            details: {
              campaignId: payload.campaign?.campaign_id,
              adId: payload.campaign?.ad_id,
              ttclid: payload.lead_data?.ttclid,
            },
          },
        });

        if (webhookEventId) {
          await this.prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: { status: 'processed', processedAt: new Date() },
          });
        }

        return { eventType, status: 'interaction_recorded', eventId };
      }

      // Branch 2 & 3: Form Completion (explicit Instant Form answers) vs Standard Lead Generation
      const isFormCompletion =
        eventType === EVENT_TYPES.FORM_COMPLETE || eventType === EVENT_TYPES.FORM_SUBMIT;
      if (isFormCompletion) {
        this.logger.log(
          `Processing explicit form completion [${eventId}] for form: ${payload.form?.form_name || payload.form?.form_id || 'Instant Form'}`,
          'LeadProcessingWorker',
        );
      }

      const { lead, isDuplicate, bitrix24Id } = await this.leadService.processAndStoreLead(payload);

      // Record dedicated audit log for explicit Form Completion submissions
      if (isFormCompletion && lead) {
        await this.prisma.auditLog.create({
          data: {
            leadId: lead.id,
            action: AUDIT_ACTIONS.FORM_COMPLETED,
            entityType: 'LEAD',
            entityId: lead.id,
            details: {
              formId: payload.form?.form_id,
              formName: payload.form?.form_name,
              customQuestions: payload.custom_questions,
              eventId,
            },
          },
        });
      }

      // Update webhook event status in DB
      if (webhookEventId) {
        await this.prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            status: 'processed',
            processedAt: new Date(),
          },
        });
      }

      // Enqueue to Bitrix Sync Queue with deterministic versioned Job ID
      const syncJobId = `bitrix-sync-${lead.id}-${lead.syncVersion}`;
      await this.bitrixSyncQueue.add(
        JOB_NAMES.SYNC_LEAD_TO_BITRIX,
        {
          leadId: lead.id,
          syncVersion: lead.syncVersion,
          isDuplicate,
          existingBitrix24Id: bitrix24Id,
        },
        {
          jobId: syncJobId,
          removeOnComplete: 100,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Enqueued lead #${lead.id} to bitrix-sync: ${syncJobId}`, 'LeadProcessingWorker');
      return { leadId: lead.id, isDuplicate, bitrix24Id };
    } catch (err: any) {
      this.logger.error(`Failed processing lead job ${job.id}: ${err.message}`, err.stack, 'LeadProcessingWorker');

      if (webhookEventId) {
        await this.prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            status: 'failed',
            errorMessage: err.message,
          },
        });
      }

      // If attempts exhausted, record to DLQ
      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await this.prisma.dlqRecord.create({
          data: {
            queueName: QUEUE_NAMES.LEAD_PROCESSING,
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
}
