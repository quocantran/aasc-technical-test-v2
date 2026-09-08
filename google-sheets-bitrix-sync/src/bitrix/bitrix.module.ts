import { Module } from '@nestjs/common';
import { BitrixWebhookStrategy } from './strategies/webhook.strategy.js';
import { BitrixOAuthStrategy } from './strategies/oauth.strategy.js';
import { RetryService } from './services/retry.service.js';
import { BitrixRateLimiterService } from './services/bitrix-rate-limiter.service.js';
import { BitrixService } from './services/bitrix.service.js';
import { BitrixLeadService } from './services/bitrix-lead.service.js';

// Module managing Bitrix24 client connections, lead operations, and retry policies
@Module({
  providers: [
    BitrixWebhookStrategy,
    BitrixOAuthStrategy,
    RetryService,
    BitrixRateLimiterService,
    BitrixService,
    BitrixLeadService,
  ],
  exports: [BitrixService, BitrixLeadService, RetryService, BitrixRateLimiterService],
})
export class BitrixModule {}
