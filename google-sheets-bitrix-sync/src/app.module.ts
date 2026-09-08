import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration.js';
import { envValidationSchema } from './config/validation.schema.js';
import { LoggerModule } from './common/logger/logger.module.js';
import { HealthModule } from './health/health.module.js';
import { SyncModule } from './sync/sync.module.js';
import { AdminModule } from './admin/admin.module.js';

// Root application module aggregating core configurations, background scheduler, and business modules
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    HealthModule,
    SyncModule,
    AdminModule,
  ],
})
export class AppModule {}

