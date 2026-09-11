import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthStrategy } from '../google-sheets/strategies/oauth.strategy.js';

// REST controller exposing Google OAuth 2.0 authorization URLs, connection status, and redirect callbacks
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly googleOAuthStrategy: GoogleOAuthStrategy,
    private readonly configService: ConfigService,
  ) {}

  // Returns current Google Sheets authentication status (OAuth2 vs Service Account)
  @Get('google/status')
  async getGoogleAuthStatus() {
    const authType = this.configService.get<string>('googleSheets.authType') || 'SERVICE_ACCOUNT';
    const isOAuth = authType === 'OAUTH2';
    const isConnected = isOAuth
      ? await this.googleOAuthStrategy.hasValidTokens()
      : true; // Service Account is active via credentials.json

    return {
      status: 'success',
      data: {
        authType,
        isOAuth,
        isConnected,
      },
    };
  }

  // Generates Google OAuth 2.0 consent URL for user authorization
  @Get('google/url')
  getGoogleAuthUrl() {
    const url = this.googleOAuthStrategy.generateAuthUrl();
    return {
      status: 'success',
      data: { url },
    };
  }

  // Handles Google OAuth callback: saves token to SQLite and redirects back to /admin with toast state
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.redirect('/admin?auth=error&msg=' + encodeURIComponent('Mã ủy quyền không hợp lệ'));
    }
    try {
      await this.googleOAuthStrategy.getTokensFromCode(code);
      return res.redirect('/admin?auth=success');
    } catch (err: any) {
      return res.redirect('/admin?auth=error&msg=' + encodeURIComponent(err.message || 'Lỗi lưu token'));
    }
  }
}

