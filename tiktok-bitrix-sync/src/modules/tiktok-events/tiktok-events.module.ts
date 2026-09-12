import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TikTokEventsRealAdapter } from './services/tiktok-events-real.adapter';
import { TikTokEventsMockAdapter } from './services/tiktok-events-mock.adapter';
import { TikTokEventsService } from './services/tiktok-events.service';
import { TIKTOK_EVENTS_ADAPTER } from './interfaces/tiktok-events.interface';
import { AppLogger } from '../../common/logger/app-logger.service';

@Module({
  imports: [ConfigModule],
  providers: [
    TikTokEventsRealAdapter,
    TikTokEventsMockAdapter,
    TikTokEventsService,
    {
      provide: TIKTOK_EVENTS_ADAPTER,
      useFactory: (
        configService: ConfigService,
        realAdapter: TikTokEventsRealAdapter,
        mockAdapter: TikTokEventsMockAdapter,
        logger: AppLogger,
      ) => {
        const useMock = configService.get<boolean>('tiktok.useMockEvents');
        if (useMock) {
          logger.log('Registering TikTokEventsMockAdapter (USE_MOCK_TIKTOK_EVENTS=true)', 'TikTokEventsModule');
          return mockAdapter;
        }
        logger.log('Registering TikTokEventsRealAdapter (USE_MOCK_TIKTOK_EVENTS=false)', 'TikTokEventsModule');
        return realAdapter;
      },
      inject: [ConfigService, TikTokEventsRealAdapter, TikTokEventsMockAdapter, AppLogger],
    },
  ],
  exports: [TikTokEventsService, TIKTOK_EVENTS_ADAPTER, TikTokEventsMockAdapter],
})
export class TikTokEventsModule {}
