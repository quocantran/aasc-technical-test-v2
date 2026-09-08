// Unit tests for WebhookController validating Bitrix24 token and event processing

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockConfigService: any;
  let mockSyncOrchestrator: any;
  let mockLogger: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'bitrix.inboundWebhookSecret') return 'valid_secret';
        return null;
      }),
    };
    mockSyncOrchestrator = {
      runSync: vi.fn().mockResolvedValue({}),
      syncBitrixToSheets: vi.fn().mockResolvedValue({}),
    };
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    controller = new WebhookController(mockConfigService, mockSyncOrchestrator, mockLogger);
  });

  it('should accept webhook when token matches secret in payload auth', async () => {
    const payload = {
      event: 'ONCRMLEADADD',
      data: { FIELDS: { ID: '999' } },
      auth: { application_token: 'valid_secret' },
    };

    const response = await controller.handleBitrixWebhook(payload);

    expect(response.status).toBe('accepted');
    expect(response.leadId).toBe('999');
    expect(mockSyncOrchestrator.runSync).toHaveBeenCalled();
  });

  it('should accept webhook when token matches secret in Authorization header', async () => {
    const payload = {
      event: 'ONCRMLEADADD',
      data: { FIELDS: { ID: '999' } },
    };

    const response = await controller.handleBitrixWebhook(payload, 'Bearer valid_secret');

    expect(response.status).toBe('accepted');
    expect(response.leadId).toBe('999');
    expect(mockSyncOrchestrator.runSync).toHaveBeenCalled();
  });

  it('should accept webhook when no webhookSecret is configured', async () => {
    mockConfigService.get = vi.fn(() => null);
    controller = new WebhookController(mockConfigService, mockSyncOrchestrator, mockLogger);

    const payload = {
      event: 'ONCRMLEADADD',
      data: { FIELDS: { ID: '111' } },
    };

    const response = await controller.handleBitrixWebhook(payload);
    expect(response.status).toBe('accepted');
    expect(mockSyncOrchestrator.runSync).toHaveBeenCalled();
  });

  it('should trigger syncBitrixToSheets when direction is TWO_WAY and event is ONCRMLEADMODIFY', async () => {
    mockConfigService.get = vi.fn((key: string) => {
      if (key === 'bitrix.inboundWebhookSecret') return 'valid_secret';
      if (key === 'sync.direction') return 'TWO_WAY';
      return null;
    });

    const payload = {
      event: 'ONCRMLEADMODIFY',
      data: { FIELDS: { ID: '888' } },
      auth: { application_token: 'valid_secret' },
    };

    const response = await controller.handleBitrixWebhook(payload);

    expect(response.status).toBe('accepted');
    expect(response.leadId).toBe('888');
    expect(mockSyncOrchestrator.syncBitrixToSheets).toHaveBeenCalledWith('888');
  });

  it('should trigger syncBitrixToSheets when direction is TWO_WAY and event is ONCRMLEADADD', async () => {
    mockConfigService.get = vi.fn((key: string) => {
      if (key === 'bitrix.inboundWebhookSecret') return 'valid_secret';
      if (key === 'sync.direction') return 'TWO_WAY';
      return null;
    });

    const payload = {
      event: 'ONCRMLEADADD',
      data: { FIELDS: { ID: '45' } },
      auth: { application_token: 'valid_secret' },
    };

    const response = await controller.handleBitrixWebhook(payload);

    expect(response.status).toBe('accepted');
    expect(response.leadId).toBe('45');
    expect(mockSyncOrchestrator.syncBitrixToSheets).toHaveBeenCalledWith('45');
  });

  it('should reject webhook when token is invalid', async () => {
    const payload = {
      event: 'ONCRMLEADADD',
      auth: { application_token: 'wrong_secret' },
    };

    await expect(controller.handleBitrixWebhook(payload)).rejects.toThrow(UnauthorizedException);
    expect(mockSyncOrchestrator.runSync).not.toHaveBeenCalled();
  });
});
