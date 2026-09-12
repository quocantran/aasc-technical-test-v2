import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { QUEUE_NAMES, JOB_NAMES } from '../../../common/constants/queue.constants';
import { AUDIT_ACTIONS } from '../../../common/constants/api.constants';
import { TikTokWebhookDto } from '../dto/tiktok-webhook.dto';

@Injectable()
export class TikTokWebhookService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.LEAD_PROCESSING)
    private readonly leadProcessingQueue: Queue,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();
  }


  // Ingests TikTok webhook event with DB idempotency guarantee.
  async ingestWebhook(dto: TikTokWebhookDto, rawPayload: any) {
    const eventId = dto.event_id;
    const eventType = dto.event || 'lead.generate';

    this.logger.log(`Ingesting TikTok webhook [${eventType}] event: ${eventId}`, 'TikTokWebhookService');

    // 1. Check if event already exists in DB (or handle unique constraint)
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      this.logger.warn(`Duplicate webhook event ignored: ${eventId}`, 'TikTokWebhookService');
      return {
        status: 'ignored',
        reason: 'already_exists',
        event_id: eventId,
        message: 'Webhook event has already been received and processed',
      };
    }

    // 2. Persist raw event to DB for audit and processing
    let webhookEvent;
    try {
      webhookEvent = await this.prisma.webhookEvent.create({
        data: {
          eventId,
          eventType,
          source: 'tiktok',
          payload: rawPayload || dto,
          status: 'pending',
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        this.logger.warn(`Race condition duplicate event caught: ${eventId}`, 'TikTokWebhookService');
        return {
          status: 'ignored',
          reason: 'already_exists',
          event_id: eventId,
        };
      }
      throw err;
    }

    // 3. Enqueue to BullMQ with deterministic jobId
    const jobId = `lead-processing-${eventId}`;
    await this.leadProcessingQueue.add(
      JOB_NAMES.PROCESS_LEAD,
      {
        webhookEventId: webhookEvent.id,
        eventId,
        payload: rawPayload || dto,
      },
      {
        jobId,
        removeOnComplete: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
        entityType: 'WEBHOOK',
        entityId: eventId,
        details: { eventType, advertiserId: dto.advertiser_id },
      },
    });

    this.logger.log(`Webhook enqueued successfully: job ${jobId}`, 'TikTokWebhookService');

    return {
      status: 'accepted',
      event_id: eventId,
      job_id: jobId,
      message: 'TikTok webhook received and queued for processing',
    };
  }
}
