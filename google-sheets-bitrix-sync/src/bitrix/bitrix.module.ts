import { Module } from '@nestjs/common';
import { BitrixWebhookStrategy } from './strategies/webhook.strategy.js';
import { BITRIX_AUTH_STRATEGY } from './interfaces/bitrix-auth.interface.js';
import { RetryService } from './services/retry.service.js';
import { BitrixRateLimiterService } from './services/bitrix-rate-limiter.service.js';
import { BitrixService } from './services/bitrix.service.js';
import { BitrixLeadService } from './services/bitrix-lead.service.js';

// Module managing Bitrix24 client connections via Inbound Webhook, rate limiting, and retry policies
@Module({
  providers: [
    BitrixWebhookStrategy,
    RetryService,
    BitrixRateLimiterService,
    {
      provide: BITRIX_AUTH_STRATEGY,
      useExisting: BitrixWebhookStrategy,
    },
    BitrixService,
    BitrixLeadService,
  ],
  exports: [
    BitrixService,
    BitrixLeadService,
    RetryService,
    BitrixRateLimiterService,
    BitrixWebhookStrategy,
    BITRIX_AUTH_STRATEGY,
  ],
})
export class BitrixModule {}
