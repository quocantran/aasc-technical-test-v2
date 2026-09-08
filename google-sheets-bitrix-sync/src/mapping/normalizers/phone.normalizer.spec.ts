// Tests for Vietnamese phone number normalization and E.164 +84 standard formatting
import { describe, it, expect } from 'vitest';
import { normalizeVietnamesePhone } from './phone.normalizer.js';

describe('normalizeVietnamesePhone', () => {
  it('should normalize standard 10-digit 09x phone numbers', () => {
    const result = normalizeVietnamesePhone('0901234567');
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('+84901234567');
  });

  it('should normalize phone numbers with spaces, dashes, and brackets', () => {
    const result = normalizeVietnamesePhone('(091) 234-5678');
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('+84912345678');
  });

  it('should normalize phone numbers starting with +84 or 84', () => {
    const res1 = normalizeVietnamesePhone('+84 983 123 456');
    expect(res1.isValid).toBe(true);
    expect(res1.normalized).toBe('+84983123456');

    const res2 = normalizeVietnamesePhone('84983123456');
    expect(res2.isValid).toBe(true);
    expect(res2.normalized).toBe('+84983123456');
  });

  it('should reject invalid phone numbers or incorrect prefixes', () => {
    const res1 = normalizeVietnamesePhone('12345');
    expect(res1.isValid).toBe(false);

    const res2 = normalizeVietnamesePhone('0123456789'); // 01 is not a valid modern VN mobile prefix
    expect(res2.isValid).toBe(false);

    const res3 = normalizeVietnamesePhone('');
    expect(res3.isValid).toBe(false);
  });
});
