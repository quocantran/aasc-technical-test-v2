import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleTokenEntity } from './entities/google-token.entity.js';
import { GoogleSheetsService } from './google-sheets.service.js';
import { ServiceAccountStrategy } from './strategies/service-account.strategy.js';
import { GoogleOAuthStrategy } from './strategies/oauth.strategy.js';
import { GOOGLE_SHEETS_AUTH_STRATEGY } from './interfaces/google-sheets-auth.interface.js';
import { RetryService } from '../bitrix/services/retry.service.js';

// Module managing Google Sheets connection strategies, dynamic DIP auth resolution, and retry policies
@Module({
  imports: [TypeOrmModule.forFeature([GoogleTokenEntity])],
  providers: [
    ServiceAccountStrategy,
    GoogleOAuthStrategy,
    RetryService,
    {
      provide: GOOGLE_SHEETS_AUTH_STRATEGY,
      useFactory: (
        config: ConfigService,
        saStrategy: ServiceAccountStrategy,
        oauthStrategy: GoogleOAuthStrategy,
      ) => {
        const authType = config.get<string>('googleSheets.authType') || 'SERVICE_ACCOUNT';
        return authType === 'OAUTH2' ? oauthStrategy : saStrategy;
      },
      inject: [ConfigService, ServiceAccountStrategy, GoogleOAuthStrategy],
    },
    GoogleSheetsService,
  ],
  exports: [GoogleSheetsService, ServiceAccountStrategy, GoogleOAuthStrategy, GOOGLE_SHEETS_AUTH_STRATEGY],
})
export class GoogleSheetsModule {}
