import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BitrixOAuthStrategy } from '../strategies/oauth.strategy.js';

// DTO for Bitrix24 Local Application installation event payload
export interface InstallAppDto {
  AUTH_ID?: string;
  REFRESH_ID?: string;
  AUTH_EXPIRES?: string | number;
  DOMAIN?: string;
  member_id?: string;
  code?: string;
  auth?: {
    access_token?: string;
    refresh_token?: string;
    domain?: string;
    expires_in?: number;
    member_id?: string;
    scope?: string;
  };
}

// Controller handling Local Application installation events from Bitrix24 (POST /install and /api/auth/bitrix/install)
@Controller(['install', 'api/auth/bitrix/install'])
export class BitrixOAuthController {
  private readonly logger = new Logger(BitrixOAuthController.name);

  constructor(private readonly oauthStrategy: BitrixOAuthStrategy) {}

  // Receives installation event payload via HTTP POST when app is installed on Bitrix24
  @Post()
  async handleInstall(
    @Body() body: InstallAppDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.logger.log(`[Install] Inbound POST installation request from IP: ${req.ip}`);

    const accessToken = body.AUTH_ID || body.auth?.access_token;
    const refreshToken = body.REFRESH_ID || body.auth?.refresh_token;
    const domain = body.DOMAIN || body.auth?.domain || 'default';
    const expiresIn = Number(body.AUTH_EXPIRES || body.auth?.expires_in || 3600);
    const memberId = body.member_id || body.auth?.member_id;
    const code = body.code;

    // Local Application Flow: Bitrix24 directly sends AUTH_ID and REFRESH_ID
    if (accessToken && refreshToken) {
      await this.oauthStrategy.verifyBitrixTokenHandshake(domain, accessToken);

      await this.oauthStrategy.saveToken({
        domain,
        accessToken,
        refreshToken,
        expiresIn,
        expiresAt: Date.now() + expiresIn * 1000,
        memberId,
        scope: body.auth?.scope || 'crm',
      });

      this.logger.log(`[Install] Bitrix24 app installed successfully for portal: ${domain}`);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Application installed and tokens saved to SQLite successfully',
        domain,
      });
    }

    // Authorization Code Flow: Exchange code for token pair if code parameter is sent
    if (code) {
      const data = await this.oauthStrategy.exchangeCodeForTokens(code, domain);
      this.logger.log(`[Install] Code exchanged successfully for portal: ${data.domain || domain}`);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Application installed via authorization code successfully',
        domain: data.domain || domain,
      });
    }

    this.logger.warn(`[Install] Missing token credentials in request body`);
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Missing AUTH_ID / REFRESH_ID or authorization code in request from Bitrix24.',
    });
  }
}
