export const TIKTOK_EVENTS_ADAPTER = 'TIKTOK_EVENTS_ADAPTER';

export interface TikTokConversionEventPayload {
  event: string; // e.g. 'CompletePayment', 'SubmitForm', 'Contact'
  event_time: number;
  event_id?: string;
  user: {
    ttclid?: string;
    email?: string; // SHA-256 hashed
    phone?: string; // SHA-256 hashed E.164
    external_id?: string;
  };
  properties?: {
    value?: number;
    currency?: string;
    content_type?: string;
    content_name?: string;
  };
}

export interface TikTokEventsResponse {
  code: number;
  message: string;
  data?: any;
}

export interface ITikTokEventsAdapter {
  sendEvent(payload: TikTokConversionEventPayload): Promise<TikTokEventsResponse>;
}
