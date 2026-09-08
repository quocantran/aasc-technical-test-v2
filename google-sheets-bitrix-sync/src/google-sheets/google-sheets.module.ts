import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service.js';
import { ServiceAccountStrategy } from './strategies/service-account.strategy.js';
import { GoogleOAuthStrategy } from './strategies/oauth.strategy.js';
import { RetryService } from '../bitrix/services/retry.service.js';

// Module managing Google Sheets connection strategies, row operations, and retry policies
@Module({
  providers: [GoogleSheetsService, ServiceAccountStrategy, GoogleOAuthStrategy, RetryService],
  exports: [GoogleSheetsService, ServiceAccountStrategy],
})
export class GoogleSheetsModule {}
