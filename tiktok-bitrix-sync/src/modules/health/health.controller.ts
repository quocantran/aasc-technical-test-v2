import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/api-key.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint for service monitoring' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check() {
    const terminusResult = await this.health.check([
      async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: 'up' } };
      },
      () => ({
        system: {
          status: 'up',
          uptimeSeconds: Math.round(process.uptime()),
        },
      }),
    ]);

    return {
      ...terminusResult,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: terminusResult.info?.database?.status || 'up',
        service: 'up',
      },
    };
  }
}
