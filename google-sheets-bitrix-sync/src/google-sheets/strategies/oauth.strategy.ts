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

  // Generates Google OAuth consent URL for user authorization
  generateAuthUrl(scopes: string[] = ['https://www.googleapis.com/auth/spreadsheets']): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });
  }

  // Exchanges authorization code for OAuth tokens and updates client credentials and database
  async getTokensFromCode(code: string): Promise<any> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.sheetsClient = null;
    await this.persistTokens(tokens);
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

  // Returns initialized OAuth2 authentication client ensuring credentials are loaded
  async getAuthClient(): Promise<OAuth2Client> {
    if (!this.initializedFromDb) {
      await this.restoreTokensFromDb();
    }
    return this.oauth2Client;
  }

  // Returns Sheets API client authenticated via OAuth2
  async getSheetsClient(): Promise<sheets_v4.Sheets> {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }
    const auth = await this.getAuthClient();
    this.sheetsClient = google.sheets({ version: 'v4', auth });
    return this.sheetsClient;
  }

  // Restores stored tokens from SQLite or seeds initial record from environment
  private async restoreTokensFromDb(): Promise<void> {
    if (!this.tokenRepo) return;
    try {
      const saved = await this.tokenRepo.findOne({ where: { identifier: 'default' } });
      if (saved && saved.accessToken) {
        this.oauth2Client.setCredentials({
          access_token: saved.accessToken,
          refresh_token: saved.refreshToken || undefined,
          expiry_date: saved.expiresAt ? Number(saved.expiresAt) : undefined,
        });
        this.logger.log('[OAuth] Restored Google OAuth credentials from SQLite database');
      }
      this.initializedFromDb = true;
    } catch (err: any) {
      this.logger.warn(`Failed to restore Google tokens from DB: ${err.message}`);
    }
  }

  // Persists token payload into SQLite database table
  private async persistTokens(tokens: any): Promise<void> {
    if (!this.tokenRepo) return;
    try {
      let record = await this.tokenRepo.findOne({ where: { identifier: 'default' } });
      if (!record) {
        record = this.tokenRepo.create({ identifier: 'default' });
      }

      if (tokens.access_token) record.accessToken = tokens.access_token;
      if (tokens.refresh_token) record.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) record.expiresAt = tokens.expiry_date;
      if (tokens.scope) record.scope = tokens.scope;

      await this.tokenRepo.save(record);
      this.logger.log('[OAuth] Persisted updated Google OAuth tokens to SQLite');
    } catch (err: any) {
      this.logger.error(`[OAuth] Error persisting Google tokens: ${err.message}`);
    }
  }
}
