import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppLogger } from '../logger/app-logger.service';
import { API_CONSTANTS } from '../constants/api.constants';
import { ERROR_MESSAGES } from '../constants/error-messages.constants';

@Injectable()
export class TikTokSignatureGuard implements CanActivate {
  private readonly secretToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.secretToken = this.configService?.get<string>('tiktok.secretToken') || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature =
      request.headers[API_CONSTANTS.TIKTOK_SIGNATURE_HEADER] ||
      request.headers['x-tiktok-signature'];

    if (!this.secretToken) {
      this.logger.error(
        'TIKTOK_SECRET_TOKEN is not configured on server. Rejecting request to prevent unauthorized access.',
        undefined,
        'TikTokSignatureGuard',
      );
      throw new InternalServerErrorException('Server misconfiguration: TIKTOK_SECRET_TOKEN is not configured');
    }

    if (!signature) {
      this.logger.warn('TikTok webhook rejected: Missing signature header', 'TikTokSignatureGuard');
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED_WEBHOOK);
    }

    // Raw payload buffer / string verification
    let payloadBuffer: Buffer;
    if (Buffer.isBuffer(request.rawBody)) {
      payloadBuffer = request.rawBody;
    } else if (typeof request.rawBody === 'string') {
      payloadBuffer = Buffer.from(request.rawBody);
    } else if (typeof request.body === 'string') {
      payloadBuffer = Buffer.from(request.body);
    } else {
      this.logger.error(
        'request.rawBody is missing. Server must retain raw body to verify HMAC signatures securely without key reordering risks.',
        undefined,
        'TikTokSignatureGuard',
      );
      throw new InternalServerErrorException('Raw body buffer is required for HMAC signature verification');
    }

    const hmac = crypto.createHmac('sha256', this.secretToken);
    hmac.update(payloadBuffer);
    const expectedSignature = hmac.digest('hex');

    const signatureBuffer = Buffer.from(String(signature));
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      this.logger.warn(
        `TikTok webhook signature mismatch. Received: ${signature}`,
        'TikTokSignatureGuard',
      );
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED_WEBHOOK);
    }

    return true;
  }
}
