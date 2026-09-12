import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppLogger } from '../../../common/logger/app-logger.service';
import {
  ITikTokEventsAdapter,
  TikTokConversionEventPayload,
  TikTokEventsResponse,
} from '../interfaces/tiktok-events.interface';

@Injectable()
export class TikTokEventsRealAdapter implements ITikTokEventsAdapter {
  private readonly apiUrl: string;
  private readonly accessToken: string;
  private readonly pixelCode: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.apiUrl =
      this.configService?.get<string>('tiktok.eventsApiUrl') ||
      'https://business-api.tiktok.com/open_api/v1.3/event/track/';
    this.accessToken = this.configService?.get<string>('tiktok.eventsAccessToken') || '';
    this.pixelCode = this.configService?.get<string>('tiktok.pixelCode') || '';
  }

  async sendEvent(payload: TikTokConversionEventPayload): Promise<TikTokEventsResponse> {
    this.logger.log(
      `[RealTikTokEvents] Sending conversion event "${payload.event}" for ttclid: ${payload.user.ttclid}`,
      'TikTokEventsRealAdapter',
    );

    const body = {
      event_source: 'web',
      event_source_id: this.pixelCode,
      data: [payload],
    };

    try {
      const response = await axios.post(this.apiUrl, body, {
        headers: {
          'Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.data;
    } catch (err: any) {
      this.logger.error(
        `[RealTikTokEvents] Failed to send conversion event: ${err.message}`,
        err.stack,
        'TikTokEventsRealAdapter',
      );
      throw err;
    }
  }
}
