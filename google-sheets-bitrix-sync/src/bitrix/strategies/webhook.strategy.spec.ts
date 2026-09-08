// Tests for BitrixWebhookStrategy endpoint resolution and header generation
import { describe, it, expect, vi } from 'vitest';
import { BitrixWebhookStrategy } from './webhook.strategy.js';

describe('BitrixWebhookStrategy', () => {
  it('should construct correct REST endpoint URL', () => {
    const mockConfig: any = {
      get: vi.fn().mockReturnValue('https://b24.company.vn/rest/1/secret_token///'),
    };
    const strategy = new BitrixWebhookStrategy(mockConfig);

    const url = strategy.getEndpoint('crm.lead.add');
    expect(url).toBe('https://b24.company.vn/rest/1/secret_token/crm.lead.add.json');
    expect(strategy.getHeaders()).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  it('should handle empty webhookUrl in config gracefully', () => {
    const mockConfig: any = {
      get: vi.fn().mockReturnValue(null),
    };
    const strategy = new BitrixWebhookStrategy(mockConfig);

    const url = strategy.getEndpoint('/crm.lead.get');
    expect(url).toBe('/crm.lead.get.json');
  });
});
