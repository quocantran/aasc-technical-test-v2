import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Injectable()
export class BitrixWebhookGuard implements CanActivate {
  private readonly webhookSecret: string;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();
    this.webhookSecret =
      this.configService.get<string>('bitrix.inboundWebhookSecret') ||
      process.env.BITRIX_INBOUND_WEBHOOK_SECRET ||
      '';
  }

  canActivate(context: ExecutionContext): boolean {
    // Fail-Closed Security: reject immediately if secret is not configured
    if (!this.webhookSecret) {
      this.logger.error(
        'BITRIX_INBOUND_WEBHOOK_SECRET is not configured on server. Rejecting webhook request.',
        undefined,
        'BitrixWebhookGuard',
      );
      throw new InternalServerErrorException('Server misconfiguration: BITRIX_INBOUND_WEBHOOK_SECRET is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const payload = request.body;
    const authHeader = request.headers['authorization'];

    const token =
      payload?.auth?.application_token ||
      payload?.['auth[application_token]'] ||
      payload?.auth_token ||
      (typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : undefined);

    if (!token) {
      this.logger.warn('Bitrix24 webhook rejected: Missing application token', 'BitrixWebhookGuard');
      throw new UnauthorizedException('Missing Bitrix24 webhook token');
    }

    const tokenBuffer = Buffer.from(String(token));
    const secretBuffer = Buffer.from(String(this.webhookSecret));

    if (
      tokenBuffer.length !== secretBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, secretBuffer)
    ) {
      this.logger.warn('Unauthorized Bitrix24 webhook token rejected', 'BitrixWebhookGuard');
      throw new UnauthorizedException('Invalid Bitrix24 webhook token');
    }

    return true;
  }
}
