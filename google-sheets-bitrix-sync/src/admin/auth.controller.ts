import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GoogleOAuthStrategy } from '../google-sheets/strategies/oauth.strategy.js';

// REST controller exposing Google OAuth 2.0 authorization URLs and code exchange callbacks
@Controller('api/auth')
export class AuthController {
  constructor(private readonly googleOAuthStrategy: GoogleOAuthStrategy) {}

  // Generates Google OAuth 2.0 consent URL for user authorization
  @Get('google/url')
  getGoogleAuthUrl() {
    const url = this.googleOAuthStrategy.generateAuthUrl();
    return {
      status: 'success',
      data: { url },
    };
  }

  // Handles Google OAuth callback and exchanges code for access and refresh tokens
  @Get('google/callback')
  async handleGoogleCallback(@Query('code') code: string) {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }
    const tokens = await this.googleOAuthStrategy.getTokensFromCode(code);
    return {
      status: 'success',
      message: 'Google OAuth 2.0 authorization completed successfully',
      data: {
        hasRefreshToken: Boolean(tokens.refresh_token),
        expiryDate: tokens.expiry_date,
      },
    };
  }
}

