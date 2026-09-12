import { TikTokEventsMockAdapter } from './tiktok-events-mock.adapter';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('TikTokEventsMockAdapter', () => {
  it('should store and acknowledge sent events in memory', async () => {
    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    const adapter = new TikTokEventsMockAdapter(mockLogger);

    const res = await adapter.sendEvent({
      event: 'SubmitForm',
      event_time: Math.floor(Date.now() / 1000),
      user: { ttclid: 'ttclid_123' },
    });

    expect(res.code).toBe(0);
    expect(adapter.sentEvents.length).toBe(1);
    expect(adapter.sentEvents[0].user.ttclid).toBe('ttclid_123');
  });
});
