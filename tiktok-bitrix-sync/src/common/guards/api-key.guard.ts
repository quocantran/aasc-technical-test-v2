import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/api-key.decorator';
import { API_CONSTANTS } from '../constants/api.constants';
import { ERROR_MESSAGES } from '../constants/error-messages.constants';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly reflector: Reflector;
  private readonly configuredApiKey: string;

  constructor(
    @Optional() reflector?: Reflector,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.reflector = reflector || new Reflector();
    this.configuredApiKey = this.configService?.get<string>('apiKey') || '';
  }


  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }



    const apiKey = this.configuredApiKey || this.configService?.get<string>('apiKey') || '';
    if (!apiKey) {
      throw new UnauthorizedException('API key is not configured on server');
    }

    const request = context.switchToHttp().getRequest();
    const providedKey =
      request.headers[API_CONSTANTS.API_KEY_HEADER] ||
      request.headers[API_CONSTANTS.API_KEY_HEADER.toLowerCase()];

    if (!providedKey) {
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED_API_KEY);
    }

    const providedBuffer = Buffer.from(String(providedKey));
    const expectedBuffer = Buffer.from(String(apiKey));

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED_API_KEY);
    }

    return true;
  }
}
