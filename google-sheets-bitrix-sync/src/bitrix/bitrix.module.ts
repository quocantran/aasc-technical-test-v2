import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BitrixTokenEntity } from './entities/bitrix-token.entity.js';
import { BitrixWebhookStrategy } from './strategies/webhook.strategy.js';
import { BitrixOAuthStrategy } from './strategies/oauth.strategy.js';
import { BITRIX_AUTH_STRATEGY } from './interfaces/bitrix-auth.interface.js';
import { RetryService } from './services/retry.service.js';
import { BitrixRateLimiterService } from './services/bitrix-rate-limiter.service.js';
import { BitrixService } from './services/bitrix.service.js';
import { BitrixLeadService } from './services/bitrix-lead.service.js';
import { BitrixOAuthController } from './controllers/bitrix-oauth.controller.js';

// Module managing Bitrix24 client connections, dynamic DIP auth resolution, and retry policies
@Module({
  imports: [TypeOrmModule.forFeature([BitrixTokenEntity])],
  controllers: [BitrixOAuthController],
  providers: [
    BitrixWebhookStrategy,
    BitrixOAuthStrategy,
    RetryService,
    BitrixRateLimiterService,
    {
      provide: BITRIX_AUTH_STRATEGY,
      useFactory: (
        config: ConfigService,
        webhookStrategy: BitrixWebhookStrategy,
        oauthStrategy: BitrixOAuthStrategy,
      ) => {
        const authType = config.get<string>('bitrix.authType') || 'WEBHOOK';
        return authType === 'OAUTH2' ? oauthStrategy : webhookStrategy;
      },
      inject: [ConfigService, BitrixWebhookStrategy, BitrixOAuthStrategy],
    },
    BitrixService,
    BitrixLeadService,
  ],
  exports: [BitrixService, BitrixLeadService, RetryService, BitrixRateLimiterService, BitrixWebhookStrategy, BitrixOAuthStrategy, BITRIX_AUTH_STRATEGY],
})
export class BitrixModule {}
