import { Injectable, Logger, UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { IBitrixAuthStrategy } from '../interfaces/bitrix-auth.interface.js';
import { BitrixTokenEntity } from '../entities/bitrix-token.entity.js';
import { BITRIX_CONSTANTS } from '../constants/bitrix-api.constants.js';

// Enterprise OAuth2 strategy with persistent SQLite storage, coalescing mutex, and proactive renewal
@Injectable()
export class BitrixOAuthStrategy implements IBitrixAuthStrategy {
  private readonly logger = new Logger(BitrixOAuthStrategy.name);
  private clientId: string;
  private clientSecret: string;
  private portalDomain: string;
  private oauthUrl: string;
  private apiTimeout: number;
  private accessToken: string;
  private refreshTokenVal: string;
  private refreshPromise: Promise<BitrixTokenEntity> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(BitrixTokenEntity)
    private readonly tokenRepository?: Repository<BitrixTokenEntity>,
  ) {
    this.clientId =
      this.configService.get<string>('bitrix.oauth.clientId') ||
      this.configService.get<string>('BITRIX24_CLIENT_ID') ||
      '';
    this.clientSecret =
      this.configService.get<string>('bitrix.oauth.clientSecret') ||
      this.configService.get<string>('BITRIX24_CLIENT_SECRET') ||
      '';
    this.portalDomain =
      this.configService.get<string>('bitrix.oauth.portalDomain') ||
      this.configService.get<string>('BITRIX24_DEFAULT_DOMAIN') ||
      '';
    this.oauthUrl =
      this.configService.get<string>('bitrix.oauth.oauthUrl') ||
      this.configService.get<string>('BITRIX24_OAUTH_URL') ||
      'https://oauth.bitrix.info/oauth/token/';
    this.apiTimeout =
      this.configService.get<number>('bitrix.oauth.apiTimeout') ||
      parseInt(this.configService.get<string>('BITRIX24_API_TIMEOUT') || '10000', 10);
    this.accessToken = '';
    this.refreshTokenVal = '';
  }

  // Performs security handshake with Bitrix24 REST API (app.info) before saving tokens
  async verifyBitrixTokenHandshake(domain: string, accessToken: string): Promise<boolean> {
    const testUrl = `https://${domain}/rest/app.info.json`;
    try {
      this.logger.log(`[OAuth] Performing security handshake with Bitrix24 portal (${domain})...`);
      const response = await axios.get(testUrl, {
        params: { auth: accessToken },
        timeout: BITRIX_CONSTANTS.OAUTH_TIMEOUT_MS,
      });

      if (response.data && (response.data.result || !response.data.error)) {
        this.logger.log(`[OAuth] Security handshake passed for portal: ${domain}`);
        return true;
      }

      throw new Error(response.data?.error_description || 'Invalid token response');
    } catch (error: any) {
      const errMsg = error.response?.data?.error_description || error.message;
      this.logger.error(`[OAuth] Handshake failed for portal ${domain}: ${errMsg}`);
      throw new UnauthorizedException(`Xác thực Token với Bitrix24 thất bại: ${errMsg}`);
    }
  }

  // Exchanges authorization code for access and refresh tokens, persisting to SQLite
  async exchangeCodeForTokens(code: string, domain?: string): Promise<BitrixTokenEntity> {
    this.logger.log(`[OAuth] Exchanging authorization code for Bitrix tokens...`);
    const response = await axios.get(this.oauthUrl, {
      params: {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        scope: 'crm',
      },
      timeout: this.apiTimeout,
    });

    const data = response.data;
    if (data.error) {
      throw new Error(`OAuth Exchange Code Error [${data.error}]: ${data.error_description}`);
    }

    const expiresIn = data.expires_in || 3600;
    const expiresAt = data.expires ? data.expires * 1000 : Date.now() + expiresIn * 1000;
    return await this.saveToken({
      domain: domain || data.domain || this.portalDomain || 'default',
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      expiresAt,
      memberId: data.member_id,
      scope: data.scope || 'crm',
    });
  }

  // Refreshes expired access token using Single-Flight Mutex and double-checked locking
  async refreshToken(currentToken?: BitrixTokenEntity): Promise<BitrixTokenEntity> {
    if (this.refreshPromise) {
      this.logger.log('[OAuth] Token renewal already in flight. Coalescing concurrent request...');
      return this.refreshPromise;
    }

    this.refreshPromise = this.executeTokenRefresh(currentToken).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  // Internal execution of token refresh with double-checked DB verification
  private async executeTokenRefresh(currentToken?: BitrixTokenEntity): Promise<BitrixTokenEntity> {
    const domain = currentToken?.domain || this.portalDomain || 'default';
    const latestToken = await this.getLatestToken(domain);

    // Double-check: verify if token was renewed by another concurrent request in DB
    if (latestToken && !this.isTokenExpired(latestToken)) {
      this.logger.log('[OAuth] Double-check passed: token was already renewed. Skipping external call.');
      this.accessToken = latestToken.accessToken;
      this.refreshTokenVal = latestToken.refreshToken;
      return latestToken;
    }

    const token = currentToken || latestToken;
    const refreshTokenToUse = token?.refreshToken || this.refreshTokenVal;

    if (!refreshTokenToUse) {
      throw new UnauthorizedException('No refresh_token found. Please authorize Bitrix24 OAuth application.');
    }

    this.logger.log(`[OAuth] Refreshing access token for Bitrix domain: ${domain}...`);

    try {
      const response = await axios.get(this.oauthUrl, {
        params: {
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshTokenToUse,
        },
        timeout: this.apiTimeout,
      });

      const data = response.data;
      if (data.error) {
        throw new Error(`Bitrix OAuth Error [${data.error}]: ${data.error_description}`);
      }

      const expiresIn = data.expires_in || 3600;
      const expiresAt = data.expires ? data.expires * 1000 : Date.now() + expiresIn * 1000;

      const updated = await this.saveToken({
        domain: data.domain || token?.domain || domain,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshTokenToUse,
        expiresIn,
        expiresAt,
        memberId: data.member_id || token?.memberId,
        scope: data.scope || token?.scope,
      });

      this.logger.log(`[OAuth] Bitrix token renewed successfully until: ${new Date(expiresAt).toISOString()}`);
      return updated;
    } catch (error: any) {
      const msg = error.response?.data?.error_description || error.message;
      this.logger.error(`[OAuth] Bitrix token renewal failed: ${msg}`);
      throw new UnauthorizedException(`Failed to refresh Bitrix24 token: ${msg}`);
    }
  }

  // Returns active access token, proactively renewing if expiring within safety buffer
  async getValidToken(): Promise<BitrixTokenEntity> {
    let token = await this.getLatestToken();

    if (!token) {
      throw new UnauthorizedException('No Bitrix24 OAuth token found. Please install the application on Bitrix24.');
    }

    if (this.isTokenExpired(token)) {
      this.logger.warn('[OAuth] Bitrix token expired or near expiration, renewing proactively...');
      token = await this.refreshToken(token);
    }

    return token;
  }

  // Checks if token has expired or is expiring within the 5-minute safety buffer
  isTokenExpired(token: BitrixTokenEntity | { expiresAt?: number }): boolean {
    if (!token || !token.expiresAt) return true;
    const bufferTimeMs = 5 * 60 * 1000;
    return Date.now() >= Number(token.expiresAt) - bufferTimeMs;
  }

  // Persists token record to SQLite and updates memory instance variables
  async saveToken(dto: {
    domain: string;
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    expiresAt?: number;
    memberId?: string;
    scope?: string;
  }): Promise<BitrixTokenEntity> {
    this.accessToken = dto.accessToken;
    if (dto.refreshToken) this.refreshTokenVal = dto.refreshToken;
    if (dto.domain && dto.domain !== 'default') this.portalDomain = dto.domain;

    if (!this.tokenRepository) {
      return {
        id: 1,
        domain: dto.domain,
        accessToken: dto.accessToken,
        refreshToken: dto.refreshToken || '',
        expiresIn: dto.expiresIn || BITRIX_CONSTANTS.DEFAULT_TOKEN_EXPIRES_IN_SEC,
        expiresAt: dto.expiresAt || Date.now() + BITRIX_CONSTANTS.DEFAULT_TOKEN_EXPIRES_IN_SEC * 1000,
        memberId: dto.memberId || '',
        scope: dto.scope || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BitrixTokenEntity;
    }

    let tokenRecord = await this.tokenRepository.findOne({ where: { domain: dto.domain } });
    if (!tokenRecord) {
      tokenRecord = this.tokenRepository.create({ domain: dto.domain });
    }

    tokenRecord.accessToken = dto.accessToken;
    if (dto.refreshToken) tokenRecord.refreshToken = dto.refreshToken;
    tokenRecord.expiresIn = dto.expiresIn || BITRIX_CONSTANTS.DEFAULT_TOKEN_EXPIRES_IN_SEC;
    tokenRecord.expiresAt = dto.expiresAt || Date.now() + tokenRecord.expiresIn * 1000;
    if (dto.memberId) tokenRecord.memberId = dto.memberId;
    if (dto.scope) tokenRecord.scope = dto.scope;

    return this.tokenRepository.save(tokenRecord);
  }

  // Retrieves most recent token record from SQLite or memory fallback
  async getLatestToken(domain?: string): Promise<BitrixTokenEntity | null> {
    if (!this.tokenRepository) {
      if (!this.accessToken) return null;
      return {
        id: 1,
        domain: this.portalDomain || domain || 'default',
        accessToken: this.accessToken,
        refreshToken: this.refreshTokenVal,
        expiresIn: BITRIX_CONSTANTS.DEFAULT_TOKEN_EXPIRES_IN_SEC,
        expiresAt: Date.now() + BITRIX_CONSTANTS.DEFAULT_TOKEN_EXPIRES_IN_SEC * 1000,
        memberId: '',
        scope: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BitrixTokenEntity;
    }

    if (domain) {
      return this.tokenRepository.findOne({ where: { domain } });
    }

    const tokens = await this.tokenRepository.find({
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    return tokens.length > 0 ? tokens[0] : null;
  }

  // Sets or updates active tokens manually with database persistence
  async setTokens(tokens: { accessToken: string; refreshToken?: string; portalDomain?: string }): Promise<void> {
    this.accessToken = tokens.accessToken;
    if (tokens.refreshToken) this.refreshTokenVal = tokens.refreshToken;
    if (tokens.portalDomain) this.portalDomain = tokens.portalDomain;

    await this.saveToken({
      domain: tokens.portalDomain || this.portalDomain || 'default',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || this.refreshTokenVal,
    });
  }

  // Resolves REST API endpoint for OAuth portal domain
  getEndpoint(method: string): string {
    const cleanMethod = method.replace(/^\/+/, '');
    const domain = this.portalDomain || 'b24.bitrix24.vn';
    return `https://${domain}/rest/${cleanMethod}.json`;
  }

  // Returns Bearer authorization headers, ensuring valid active access token
  async getHeaders(): Promise<Record<string, string>> {
    try {
      const valid = await this.getValidToken();
      return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${valid.accessToken}`,
      };
    } catch {
      return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      };
    }
  }

  // Returns active access token string directly
  async getAccessToken(): Promise<string> {
    const valid = await this.getValidToken();
    return valid.accessToken;
  }
}
