import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';

describe('HealthController', () => {
  it('should return terminus health status up', async () => {
    const mockHealthService = {
      check: jest.fn().mockImplementation(async (indicators) => {
        const results = await Promise.all(indicators.map((fn: any) => fn()));
        return {
          status: 'ok',
          info: Object.assign({}, ...results),
          error: {},
          details: Object.assign({}, ...results),
        };
      }),
    } as unknown as HealthCheckService;

    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(mockHealthService, mockPrisma);
    const res: any = await controller.check();

    expect(res.status).toBe('ok');
    expect(res.info?.database?.status).toBe('up');
    expect(res.info?.system?.status).toBe('up');
  });
});
