import { PrismaService } from './prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';

describe('PrismaService', () => {
  it('should initialize and connect, and disconnect on destroy', async () => {
    const mockLogger = {
      log: jest.fn(),
    } as any as AppLogger;

    const service = new PrismaService(mockLogger);
    service.$connect = jest.fn().mockResolvedValue(undefined as never);
    service.$disconnect = jest.fn().mockResolvedValue(undefined as never);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalled();

    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });
});
