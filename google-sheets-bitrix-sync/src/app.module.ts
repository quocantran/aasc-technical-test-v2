import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration.js';
import { envValidationSchema } from './config/validation.schema.js';
import { LoggerModule } from './common/logger/logger.module.js';
import { DatabaseModule } from './databases/database.module.js';
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
    DatabaseModule,
    HealthModule,
    SyncModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    },
  ],
})
export class AppModule {}

