import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// Module declaring the health check endpoint
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
