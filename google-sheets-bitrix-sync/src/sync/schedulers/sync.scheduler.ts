import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SyncOrchestratorService } from '../services/sync-orchestrator.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';

// Scheduled cron job dynamically registered from environment configuration
@Injectable()
export class SyncScheduler implements OnModuleInit {
  private readonly cronJobName = 'dynamic-sync-cron';

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly logger: AppLogger,
  ) {}

  // Registers and starts the cron job dynamically according to sync.cron setting
  onModuleInit(): void {
    const cronExpression = this.configService.get<string>('sync.cron') || '*/15 * * * *';
    this.logger.log(`Registering dynamic sync Cron job with schedule: ${cronExpression}`, 'SyncScheduler');

    try {
      const job = new CronJob(cronExpression, async () => {
        await this.handleCron();
      });

      this.schedulerRegistry.addCronJob(this.cronJobName, job);
      job.start();
      this.logger.log(`Dynamic sync Cron job [${this.cronJobName}] successfully started`, 'SyncScheduler');
    } catch (error: any) {
      this.logger.error(`Failed to register dynamic cron job: ${error.message}`, error.stack, 'SyncScheduler');
    }
  }

  // Executes periodic sync workflow
  async handleCron(): Promise<void> {
    this.logger.log('Triggering scheduled synchronization via Cron', 'SyncScheduler');
    try {
      await this.syncOrchestrator.runSync();
    } catch (error: any) {
      this.logger.error(`Scheduled sync encountered an unhandled error: ${error.message}`, error.stack, 'SyncScheduler');
    }
  }
}

