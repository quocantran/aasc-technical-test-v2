import { Controller, Get } from '@nestjs/common';

// Exposes health check endpoint for container probes and monitoring
@Controller('api/health')
export class HealthController {
  // Returns application status, uptime, and memory usage metrics
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      service: 'google-sheets-bitrix-sync',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      memoryUsage: process.memoryUsage(),
    };
  }
}
