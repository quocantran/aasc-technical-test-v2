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

  it('should return undefined when lead is null or undefined', async () => {
    const res = await service.trackLeadConversion(null);
    expect(res).toBeUndefined();
    expect(mockAdapter.sendEvent).not.toHaveBeenCalled();
  });

  it('should send SubmitForm event when deal is not provided', async () => {
    const lead = {
      id: 'lead-submit',
      externalId: 'ext-sub',
      email: '', // empty email
      phone: '   ', // whitespace only
      // no ttclid
    };

    const res = await service.trackLeadConversion(lead);
    expect(res?.code).toBe(0);
    expect(mockAdapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'SubmitForm',
        event_id: 'conv_lead_lead-submit',
        user: expect.objectContaining({
          ttclid: undefined,
          email: undefined,
          phone: undefined,
          external_id: 'ext-sub',
        }),
        properties: undefined,
      }),
    );
  });

  it('should fallback to value: 0 and VND when deal amount and currency are not specified', async () => {
    const lead = {
      id: 'lead-deal-fallback',
      externalId: 'ext-fallback',
      ttclid: 'ttclid-abc',
    };

    const deal = {
      id: 'deal-no-amount',
      title: 'Deal Without Amount',
    };

    await service.trackLeadConversion(lead, deal);
    expect(mockAdapter.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CompletePayment',
        event_id: 'conv_deal_deal-no-amount',
        properties: expect.objectContaining({
          value: 0,
          currency: 'VND',
        }),
      }),
    );
  });
});
