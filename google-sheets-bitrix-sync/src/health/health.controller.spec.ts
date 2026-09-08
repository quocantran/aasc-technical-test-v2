// Tests for HealthController verifying system health metrics and metadata
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    controller = new HealthController();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should return health status ok with metadata in default environment', () => {
    delete process.env.NODE_ENV;
    const response = controller.checkHealth();
    expect(response).toBeDefined();
    expect(response.status).toBe('ok');
    expect(response.service).toBe('google-sheets-bitrix-sync');
    expect(response.environment).toBe('development');
    expect(typeof response.uptime).toBe('number');
    expect(typeof response.timestamp).toBe('string');
  });

  it('should return environment when NODE_ENV is explicitly defined', () => {
    process.env.NODE_ENV = 'production';
    const response = controller.checkHealth();
    expect(response.environment).toBe('production');
  });
});
