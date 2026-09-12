import { Injectable, Optional } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app-logger.service';
import {
  ITikTokEventsAdapter,
  TikTokConversionEventPayload,
  TikTokEventsResponse,
} from '../interfaces/tiktok-events.interface';

@Injectable()
export class TikTokEventsMockAdapter implements ITikTokEventsAdapter {
  public readonly sentEvents: TikTokConversionEventPayload[] = [];

  private readonly logger: AppLogger;

  constructor(@Optional() logger?: AppLogger) {
    this.logger = logger || new AppLogger();
    this.logger.debug('TikTokEventsMockAdapter instantiated.', 'TikTokEventsMockAdapter');
  }

  async sendEvent(payload: TikTokConversionEventPayload): Promise<TikTokEventsResponse> {
    this.sentEvents.push(payload);
    this.logger.log(
      `[MockTikTokEvents] Successfully tracked "${payload.event}" (ttclid: ${payload.user.ttclid || 'N/A'}, value: ${payload.properties?.value ?? 'N/A'} ${payload.properties?.currency || ''})`,
      'TikTokEventsMockAdapter',
    );

    return {
      code: 0,
      message: 'OK',
      data: {
        event_id: payload.event_id || `mock_${Date.now()}`,
        sent_count: this.sentEvents.length,
      },
    };
  }
}
