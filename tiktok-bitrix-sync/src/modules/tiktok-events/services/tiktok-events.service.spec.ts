import { TikTokEventsService } from './tiktok-events.service';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('TikTokEventsService', () => {
  let service: TikTokEventsService;
  let mockAdapter: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockAdapter = {
      sendEvent: jest.fn().mockResolvedValue({ code: 0, message: 'OK' }),
    };

    mockPrisma = {
      auditLog: {
        create: jest.fn(),
      },
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new TikTokEventsService(mockAdapter, mockPrisma as PrismaService, mockLogger);
  });

  it('should track conversion with SHA-256 hashed identifiers and audit log', async () => {
    const lead = {
      id: 'lead-1',
      externalId: 'evt_1',
      email: 'test@example.com',
      phone: '+84901234567',
      ttclid: 'TTCLID-12345',
    };

    const deal = {
      id: 'deal-1',
      title: 'Won Deal',
      amount: 10000000,
      currency: 'VND',
    };

    const res = await service.trackLeadConversion(lead, deal);
    expect(res?.code).toBe(0);
    expect(mockAdapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CompletePayment',
        user: expect.objectContaining({
          ttclid: 'TTCLID-12345',
          email: expect.any(String), // hashed
          phone: expect.any(String), // hashed
        }),
        properties: expect.objectContaining({
          value: 10000000,
          currency: 'VND',
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });
});
