import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { QUEUE_NAMES, JOB_NAMES } from '../../../common/constants/queue.constants';
import { BatchMigrateDto } from '../dto/batch-migrate.dto';

@Injectable()
export class BatchMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.BITRIX_SYNC)
    private readonly bitrixSyncQueue: Queue,
    private readonly logger: AppLogger,
  ) {}

  // Triggers asynchronous batch migration of historical leads into Bitrix24.
  async startBatchMigration(dto: BatchMigrateDto) {
    const { batchSize = 50, limit = 1000, forceReSync = false, dateFrom, dateTo } = dto;

    const where: any = {};
    if (!forceReSync) {
      where.OR = [
        { bitrix24Id: null },
        { status: 'failed' },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    // Find candidates for migration
    const candidateLeads = await this.prisma.lead.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: { id: true, syncVersion: true, bitrix24Id: true },
    });

    const totalItems = candidateLeads.length;

    // Create a persistent tracking job in PostgreSQL
    const syncJob = await this.prisma.syncJob.create({
      data: {
        jobType: 'HISTORICAL_BATCH_MIGRATION',
        status: totalItems === 0 ? 'completed' : 'in_progress',
        progress: 0,
        totalItems,
        processedItems: 0,
        failedItems: 0,
        metadata: {
          batchSize,
          limit,
          forceReSync,
          dateFrom,
          dateTo,
        },
        startedAt: new Date(),
        completedAt: totalItems === 0 ? new Date() : null,
      },
    });

    this.logger.log(
      `Initiated batch migration job [${syncJob.id}] for ${totalItems} leads (batch size: ${batchSize})`,
      'BatchMigrationService',
    );

    if (totalItems === 0) {
      return {
        jobId: syncJob.id,
        status: 'completed',
        totalItems: 0,
        message: 'No leads matched the migration criteria',
      };
    }

    // Enqueue jobs in native Bitrix batches (up to batchSize leads per HTTP request)
    let enqueuedBatchCount = 0;
    for (let i = 0; i < candidateLeads.length; i += batchSize) {
      const batch = candidateLeads.slice(i, i + batchSize);
      const leadIds = batch.map((l) => l.id);
      const batchJobId = `batch-sync-${syncJob.id}-${Math.floor(i / batchSize)}`;

      await this.bitrixSyncQueue.add(
        JOB_NAMES.SYNC_LEADS_BATCH_TO_BITRIX,
        {
          leadIds,
          migrationJobId: syncJob.id,
          batchIndex: Math.floor(i / batchSize),
        },
        {
          jobId: batchJobId,
          removeOnComplete: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      enqueuedBatchCount++;
    }

    await this.prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { progress: 10 },
    });

    return {
      jobId: syncJob.id,
      status: 'in_progress',
      totalItems,
      batchCount: enqueuedBatchCount,
      enqueuedCount: totalItems,
      message: `Native batch migration initiated. ${totalItems} leads queued across ${enqueuedBatchCount} Bitrix24 batch requests.`,
    };
  }

  // Retrieves current status and metrics of a migration job.
  async getJobStatus(jobId: string) {
    const job = await this.prisma.syncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Migration job #${jobId} not found`);
    }

    return job;
  }
}
