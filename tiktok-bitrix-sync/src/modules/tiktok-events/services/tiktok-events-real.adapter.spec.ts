import axios from 'axios';
import { TikTokEventsRealAdapter } from './tiktok-events-real.adapter';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/logger/app-logger.service';

jest.mock('axios');

describe('TikTokEventsRealAdapter', () => {
  it('should post payload to TikTok Events API with Access-Token header', async () => {
    const mockConfig = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'tiktok.eventsApiUrl') return 'https://business-api.tiktok.com/api';
        if (key === 'tiktok.eventsAccessToken') return 'access-token-123';
        if (key === 'tiktok.pixelCode') return 'PIXEL_999';
        return undefined;
      }),
    } as any as ConfigService;

    const mockLogger = {
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    (axios.post as any).mockResolvedValueOnce({
      data: { code: 0, message: 'OK' },
    });

    const adapter = new TikTokEventsRealAdapter(mockConfig, mockLogger);

    const res = await adapter.sendEvent({
      event: 'SubmitForm',
      event_time: 123456789,
      user: { ttclid: 'ttclid_1' },
    });

    expect(res.code).toBe(0);
    expect(axios.post).toHaveBeenCalledWith(
      'https://business-api.tiktok.com/api',
      expect.objectContaining({
        event_source_id: 'PIXEL_999',
        data: [expect.objectContaining({ event: 'SubmitForm' })],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Access-Token': 'access-token-123' }),
      }),
    );
  });

  it('should log and rethrow error when axios post fails', async () => {
    const mockConfig = { get: jest.fn().mockReturnValue(undefined) } as any as ConfigService;
    const mockLogger = { log: jest.fn(), error: jest.fn() } as any as AppLogger;

    (axios.post as any).mockRejectedValueOnce(new Error('Network timeout'));

    const adapter = new TikTokEventsRealAdapter(mockConfig, mockLogger);

    await expect(
      adapter.sendEvent({
        event: 'CompletePayment',
        event_time: 123456789,
        user: { ttclid: 'ttclid_err' },
      }),
    ).rejects.toThrow('Network timeout');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send conversion event: Network timeout'),
      expect.anything(),
      'TikTokEventsRealAdapter',
    );
  });
});
