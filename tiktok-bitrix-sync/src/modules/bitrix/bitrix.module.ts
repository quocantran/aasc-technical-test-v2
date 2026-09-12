import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../common/constants/queue.constants';
import { BitrixHttpService } from './services/bitrix-http.service';
import { BitrixRateLimiterService } from './services/bitrix-rate-limiter.service';
import { RetryService } from './services/retry.service';
import { BitrixRealAdapter } from './services/bitrix-real.adapter';
import { BitrixMockAdapter } from './services/bitrix-mock.adapter';
import { BitrixWebhookService } from './services/bitrix-webhook.service';
import { BitrixWebhookController } from './controllers/bitrix-webhook.controller';
import { BitrixWebhookGuard } from './guards/bitrix-webhook.guard';
import { BITRIX_ADAPTER } from './interfaces/bitrix-adapter.interface';
import { AppLogger } from '../../common/logger/app-logger.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.TIKTOK_EVENTS_SYNC,
    }),
  ],
  controllers: [BitrixWebhookController],
  providers: [
    BitrixWebhookService,
    BitrixWebhookGuard,
    BitrixRateLimiterService,
    RetryService,
    BitrixHttpService,
    BitrixRealAdapter,
    BitrixMockAdapter,
    {
      provide: BITRIX_ADAPTER,
      useFactory: (
        configService: ConfigService,
        realAdapter: BitrixRealAdapter,
        mockAdapter: BitrixMockAdapter,
        logger: AppLogger,
      ) => {
        const useMock = configService.get<boolean>('bitrix.useMock');
        if (useMock) {
          logger.log('Registering BitrixMockAdapter (USE_MOCK_BITRIX=true)', 'BitrixModule');
          return mockAdapter;
        }
        logger.log('Registering BitrixRealAdapter (USE_MOCK_BITRIX=false)', 'BitrixModule');
        return realAdapter;
      },
      inject: [ConfigService, BitrixRealAdapter, BitrixMockAdapter, AppLogger],
    },
  ],
  exports: [BITRIX_ADAPTER, BitrixMockAdapter, BitrixRealAdapter, BitrixHttpService, BitrixWebhookService, BitrixWebhookGuard],
})
export class BitrixModule {}
