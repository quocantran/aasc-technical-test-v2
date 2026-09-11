import { describe, it, expect } from 'vitest';
import { GoogleTokenEntity } from './google-token.entity.js';

describe('GoogleTokenEntity', () => {
  it('should instantiate entity and allow setting properties', () => {
    const token = new GoogleTokenEntity();
    token.id = 1;
    token.identifier = 'default';
    token.accessToken = 'access_123';
    token.refreshToken = 'refresh_123';
    token.expiresIn = 3600;
    token.expiresAt = Date.now() + 3600000;
    token.scope = 'https://www.googleapis.com/auth/spreadsheets';
    token.createdAt = new Date();
    token.updatedAt = new Date();

    expect(token.id).toBe(1);
    expect(token.identifier).toBe('default');
    expect(token.accessToken).toBe('access_123');
    expect(token.refreshToken).toBe('refresh_123');
    expect(token.expiresIn).toBe(3600);
    expect(token.scope).toContain('spreadsheets');
    expect(token.createdAt).toBeInstanceOf(Date);
    expect(token.updatedAt).toBeInstanceOf(Date);
  });
});
