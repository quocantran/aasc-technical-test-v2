import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './modules/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { RuleEngineModule } from './modules/rule-engine/rule-engine.module';
import { ConfigMgmtModule } from './modules/config-mgmt/config-mgmt.module';
import { BitrixModule } from './modules/bitrix/bitrix.module';
import { TikTokEventsModule } from './modules/tiktok-events/tiktok-events.module';
import { LeadModule } from './modules/lead/lead.module';
import { DealModule } from './modules/deal/deal.module';
import { TikTokModule } from './modules/tiktok/tiktok.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ApiKeyGuard } from './common/guards/api-key.guard';

import { RedisModule } from './common/redis/redis.module';
import { RedisThrottlerGuard } from './common/guards/redis-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    RedisModule,
    DatabaseModule,
    QueueModule,
    HealthModule,
    MetricsModule,
    RuleEngineModule,
    ConfigMgmtModule,
    BitrixModule,
    TikTokEventsModule,
    LeadModule,
    DealModule,
    TikTokModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaClientExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RedisThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
