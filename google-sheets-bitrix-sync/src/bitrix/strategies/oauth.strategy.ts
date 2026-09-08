import { Injectable } from '@nestjs/common';
import { IBitrixAuthStrategy } from '../interfaces/bitrix-auth.interface.js';

// OAuth2 authentication strategy supporting bearer token authorization
@Injectable()
export class BitrixOAuthStrategy implements IBitrixAuthStrategy {
  private accessToken: string = '';
  private portalDomain: string = '';

  // Resolves API endpoint for OAuth portal domain
  getEndpoint(method: string): string {
    const cleanMethod = method.replace(/^\/+/, '');
    return `https://${this.portalDomain}/rest/${cleanMethod}.json`;
  }

  // Returns headers including Bearer authorization token
  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };
  }
}
