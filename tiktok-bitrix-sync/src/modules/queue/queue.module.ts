import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../../common/constants/queue.constants';
import { LeadProcessingWorker } from './processors/lead-processing.worker';
import { BitrixSyncWorker } from './processors/bitrix-sync.worker';
import { DealConversionWorker } from './processors/deal-conversion.worker';
import { TikTokEventsSyncWorker } from './processors/tiktok-events-sync.worker';
import { LeadModule } from '../lead/lead.module';
import { BitrixModule } from '../bitrix/bitrix.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { ConfigMgmtModule } from '../config-mgmt/config-mgmt.module';
import { TikTokEventsModule } from '../tiktok-events/tiktok-events.module';
import { DealModule } from '../deal/deal.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db') || 0,
          lazyConnect: true,
          retryStrategy: () => null,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false,
        },
      }),

      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.LEAD_PROCESSING,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      },
      {
        name: QUEUE_NAMES.BITRIX_SYNC,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      },
      {
        name: QUEUE_NAMES.DEAL_CONVERSION,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      },
      {
        name: QUEUE_NAMES.TIKTOK_EVENTS_SYNC,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      },
    ),
    forwardRef(() => LeadModule),
    forwardRef(() => DealModule),
    BitrixModule,
    RuleEngineModule,
    ConfigMgmtModule,
    forwardRef(() => TikTokEventsModule),
  ],
  providers: [
    LeadProcessingWorker,
    BitrixSyncWorker,
    DealConversionWorker,
    TikTokEventsSyncWorker,
  ],
  exports: [BullModule],
})
export class QueueModule {}
