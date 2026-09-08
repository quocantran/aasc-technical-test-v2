// Tests for email normalizer verifying lowercase conversion, trimming, and RFC validation
import { describe, it, expect } from 'vitest';
import { normalizeEmail } from './email.normalizer.js';

describe('normalizeEmail', () => {
  it('should trim and lowercase valid emails', () => {
    const result = normalizeEmail('  John.Doe@Example.COM  ');
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('john.doe@example.com');
  });

  it('should reject invalid email formats', () => {
    expect(normalizeEmail('not-an-email').isValid).toBe(false);
    expect(normalizeEmail('@missingusername.com').isValid).toBe(false);
    expect(normalizeEmail('missingdomain@').isValid).toBe(false);
    expect(normalizeEmail('').isValid).toBe(false);
  });
});
