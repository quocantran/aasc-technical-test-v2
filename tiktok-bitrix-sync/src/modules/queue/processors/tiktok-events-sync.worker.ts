import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '../../../common/constants/queue.constants';
import { TikTokEventsService } from '../../tiktok-events/services/tiktok-events.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Processor(QUEUE_NAMES.TIKTOK_EVENTS_SYNC)
@Injectable()
export class TikTokEventsSyncWorker extends WorkerHost {
  constructor(
    private readonly tiktokEventsService: TikTokEventsService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { leadId, dealId } = job.data;
    this.logger.log(`Processing TikTok conversion sync for lead #${leadId}`, 'TikTokEventsSyncWorker');

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) return { skipped: true };

    let deal;
    if (dealId) {
      deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    }

    try {
      const res = await this.tiktokEventsService.trackLeadConversion(lead, deal);
      return res;
    } catch (err: any) {
      this.logger.error(`TikTok event track failed: ${err.message}`, err.stack, 'TikTokEventsSyncWorker');

      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await this.prisma.dlqRecord.create({
          data: {
            queueName: QUEUE_NAMES.TIKTOK_EVENTS_SYNC,
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
