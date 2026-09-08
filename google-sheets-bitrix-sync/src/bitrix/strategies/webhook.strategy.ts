import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBitrixAuthStrategy } from '../interfaces/bitrix-auth.interface.js';

// Implements authentication strategy using Bitrix24 Inbound Webhook URL
@Injectable()
export class BitrixWebhookStrategy implements IBitrixAuthStrategy {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const rawUrl = this.configService.get<string>('bitrix.webhookUrl') || '';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
  }

  // Appends REST method name to webhook URL base
  getEndpoint(method: string): string {
    const cleanMethod = method.replace(/^\/+/, '');
    return `${this.baseUrl}/${cleanMethod}.json`;
  }

  // Returns standard JSON request headers
  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
