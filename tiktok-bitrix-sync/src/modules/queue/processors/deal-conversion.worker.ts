import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '../../../common/constants/queue.constants';
import { DealConversionService } from '../../deal/services/deal-conversion.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Processor(QUEUE_NAMES.DEAL_CONVERSION)
@Injectable()
export class DealConversionWorker extends WorkerHost {
  constructor(
    private readonly dealConversionService: DealConversionService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { leadId } = job.data;
    this.logger.log(`Evaluating deal conversion rules for lead #${leadId}`, 'DealConversionWorker');

    try {
      const result = await this.dealConversionService.convertLeadToDeal(leadId);
      return result;
    } catch (err: any) {
      this.logger.error(`Deal conversion failed for lead #${leadId}: ${err.message}`, err.stack, 'DealConversionWorker');

      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await this.prisma.dlqRecord.create({
          data: {
            queueName: QUEUE_NAMES.DEAL_CONVERSION,
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
