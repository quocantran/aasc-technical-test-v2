import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { IGoogleSheetsAuthStrategy } from '../interfaces/google-sheets-auth.interface.js';
import { GoogleTokenEntity } from '../entities/google-token.entity.js';

// Full OAuth2 authentication strategy for Google Sheets with persistent SQLite storage
@Injectable()
export class GoogleOAuthStrategy implements IGoogleSheetsAuthStrategy, OnModuleInit {
  private readonly logger = new Logger(GoogleOAuthStrategy.name);
  private oauth2Client: OAuth2Client;
  private sheetsClient: sheets_v4.Sheets | null = null;
  private initializedFromDb = false;
  private persistLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(GoogleTokenEntity)
    private readonly tokenRepo?: Repository<GoogleTokenEntity>,
  ) {
    const clientId = this.configService.get<string>('googleSheets.oauth.clientId') || '';
    const clientSecret = this.configService.get<string>('googleSheets.oauth.clientSecret') || '';
    const redirectUri = this.configService.get<string>('googleSheets.oauth.redirectUri') || '';

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Listens to auto-renewal events emitted by Google OAuth client and updates SQLite
    this.oauth2Client.on('tokens', async (tokens) => {
      this.logger.log('[OAuth] Google OAuth2 client refreshed tokens automatically');
      await this.persistTokens(tokens);
    });
  }

  // Restores saved tokens from SQLite database during module initialization
  async onModuleInit(): Promise<void> {
    await this.restoreTokensFromDb();
  }

  // Generates Google OAuth consent URL for user authorization (forces account selection for switching accounts)
  generateAuthUrl(scopes: string[] = ['https://www.googleapis.com/auth/spreadsheets']): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: scopes,
    });
  }

  // Exchanges authorization code for OAuth tokens and updates client credentials and database
  async getTokensFromCode(code: string): Promise<any> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.sheetsClient = null;
    await this.persistTokens(tokens);
    this.initializedFromDb = true;
    return tokens;
  }

  // Sets or updates active OAuth tokens on the client and persists to database
  setTokens(tokens: any): void {
    this.oauth2Client.setCredentials(tokens);
    this.sheetsClient = null;
    this.persistTokens(tokens).catch((err) => {
      this.logger.error(`Failed to persist Google tokens: ${err.message}`);
    });
  }

  // Checks if valid access or refresh tokens are currently loaded or stored in SQLite
  async hasValidTokens(): Promise<boolean> {
    const creds = this.oauth2Client.credentials;
    if (creds && (creds.access_token || creds.refresh_token)) {
      return true;
    }

    const restored = await this.restoreTokensFromDb();
    if (restored) {
      const updatedCreds = this.oauth2Client.credentials;
      return Boolean(updatedCreds && (updatedCreds.access_token || updatedCreds.refresh_token));
    }

    return false;
  }

  // Returns initialized OAuth2 authentication client ensuring credentials are loaded
  async getAuthClient(): Promise<OAuth2Client> {
    let creds = this.oauth2Client.credentials;
    if (!creds || (!creds.access_token && !creds.refresh_token)) {
      await this.restoreTokensFromDb();
      creds = this.oauth2Client.credentials;
    }

    if (!creds || (!creds.access_token && !creds.refresh_token)) {
      throw new Error(
        'Google OAuth 2.0 chưa được cấp quyền truy cập. Vui lòng mở trình duyệt vào http://localhost:3000/admin để đăng nhập và cấp quyền trước khi thực hiện đồng bộ.',
      );
    }

    // Proactively refresh access token if expired or near expiry (within 1 min)
    const isExpired = creds.expiry_date ? Date.now() >= creds.expiry_date - 60000 : false;
    if (isExpired && creds.refresh_token) {
      try {
        await this.oauth2Client.getAccessToken();
      } catch (err: any) {
        this.logger.warn(`[OAuth] Token refresh in getAuthClient encountered error: ${err.message}`);
      }
    }

    return this.oauth2Client;
  }

  // Returns Sheets API client authenticated via OAuth2 ensuring active token freshness
  async getSheetsClient(): Promise<sheets_v4.Sheets> {
    await this.getAuthClient();
    if (this.sheetsClient) {
      return this.sheetsClient;
    }
    this.sheetsClient = google.sheets({ version: 'v4', auth: this.oauth2Client });
    return this.sheetsClient;
  }

  // Restores stored tokens from SQLite database with proactive refresh for expired tokens
  private async restoreTokensFromDb(): Promise<boolean> {
    if (!this.tokenRepo) return false;
    try {
      const saved = await this.tokenRepo.findOne({ where: { identifier: 'default' } });
      if (saved && (saved.accessToken || saved.refreshToken)) {
        this.oauth2Client.setCredentials({
          access_token: saved.accessToken || undefined,
          refresh_token: saved.refreshToken || undefined,
          expiry_date: saved.expiresAt ? Number(saved.expiresAt) : undefined,
        });
        this.logger.log('[OAuth] Restored Google OAuth credentials from SQLite database');

        // Smart Proactive Refresh: If token is expired or expires in < 5 mins, refresh immediately
        const isNearExpiry = saved.expiresAt ? Date.now() >= Number(saved.expiresAt) - 300000 : false;
        if (isNearExpiry && saved.refreshToken) {
          try {
            this.logger.log('[OAuth] Access token is expired or near expiry, proactively refreshing via refresh_token...');
            const res = await this.oauth2Client.getAccessToken();
            if (res.token) {
              this.logger.log('[OAuth] Proactively refreshed Google access token successfully');
            }
          } catch (refreshErr: any) {
            this.logger.warn(`[OAuth] Proactive token refresh failed: ${refreshErr.message}`);
          }
        }

        this.initializedFromDb = true;
        return true;
      }
      this.initializedFromDb = true;
      return false;
    } catch (err: any) {
      this.logger.warn(`Failed to restore Google tokens from DB: ${err.message}`);
      return false;
    }
  }

  // Persists token payload into SQLite database table with serialization and refresh_token preservation
  private async persistTokens(tokens: any): Promise<void> {
    if (!this.tokenRepo) return;

    // Chain operations sequentially to prevent concurrent insert collisions
    return (this.persistLock = this.persistLock
      .then(async () => {
        await this.doPersistTokens(tokens);
      })
      .catch((err) => {
        this.logger.error(`[OAuth] Error in persistTokens queue: ${err.message}`);
      }));
  }

  // Internal execution of token persistence under mutex lock
  private async doPersistTokens(tokens: any): Promise<void> {
    try {
      const existing = await this.tokenRepo!.findOne({ where: { identifier: 'default' } });

      const accessToken = tokens.access_token || existing?.accessToken;
      // CRITICAL: Google only returns refresh_token on the first authorization.
      // Always preserve the existing refresh_token if new one is omitted.
      const refreshToken = tokens.refresh_token || existing?.refreshToken;
      const expiresAt = tokens.expiry_date || existing?.expiresAt;
      const scope = tokens.scope || existing?.scope;

      if (!accessToken && !refreshToken) {
        return;
      }

      if (existing) {
        existing.accessToken = accessToken || existing.accessToken;
        if (refreshToken) existing.refreshToken = refreshToken;
        if (expiresAt) existing.expiresAt = Number(expiresAt);
        if (scope) existing.scope = scope;
        await this.tokenRepo!.save(existing);
      } else {
        const newRecord = this.tokenRepo!.create({
          identifier: 'default',
          accessToken: accessToken || '',
          refreshToken: refreshToken || '',
          expiresAt: expiresAt ? Number(expiresAt) : undefined,
          scope: scope || '',
        });
        await this.tokenRepo!.save(newRecord);
      }
      this.logger.log('[OAuth] Persisted Google OAuth tokens to SQLite successfully');
    } catch (err: any) {
      this.logger.debug?.(`[OAuth] Initial save hit exception: ${err.message}`);
      try {
        const updateData: any = {};
        if (tokens.access_token) updateData.accessToken = tokens.access_token;
        if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
        if (tokens.expiry_date) updateData.expiresAt = Number(tokens.expiry_date);
        if (tokens.scope) updateData.scope = tokens.scope;
        await this.tokenRepo!.update({ identifier: 'default' }, updateData);
        this.logger.log('[OAuth] Persisted Google OAuth tokens via update fallback');
      } catch (fallbackErr: any) {
        this.logger.error(`[OAuth] Error persisting Google tokens: ${fallbackErr.message}`);
      }
    }
  }
}
