import { normalizeVietnamesePhone } from './phone.normalizer';

describe('normalizeVietnamesePhone', () => {
  it('should normalize valid 0-prefixed 10-digit number to +84', () => {
    const res = normalizeVietnamesePhone('0901234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+84901234567');
  });

  it('should normalize valid +84-prefixed number', () => {
    const res = normalizeVietnamesePhone('+84901234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+84901234567');
  });

  it('should normalize valid 84-prefixed number', () => {
    const res = normalizeVietnamesePhone('84901234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+84901234567');
  });

  it('should strip spaces, dashes, dots, and brackets', () => {
    const res = normalizeVietnamesePhone(' (090) 123-4567 ');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+84901234567');
  });

  it('should support valid Viettel, Mobifone, Vinaphone prefixes (3, 5, 7, 8, 9)', () => {
    expect(normalizeVietnamesePhone('0321234567').isValid).toBe(true);
    expect(normalizeVietnamesePhone('0521234567').isValid).toBe(true);
    expect(normalizeVietnamesePhone('0721234567').isValid).toBe(true);
    expect(normalizeVietnamesePhone('0821234567').isValid).toBe(true);
    expect(normalizeVietnamesePhone('0921234567').isValid).toBe(true);
  });

  it('should reject invalid length or invalid prefixes (e.g. starting with 1 or 2)', () => {
    expect(normalizeVietnamesePhone('0121234567').isValid).toBe(false);
    expect(normalizeVietnamesePhone('12345').isValid).toBe(false);
    expect(normalizeVietnamesePhone('').isValid).toBe(false);
    expect(normalizeVietnamesePhone(null).isValid).toBe(false);
  });

  it('should normalize international numbers for US, SG, and UK to E.164', () => {
    const us = normalizeVietnamesePhone('+14155552671');
    expect(us.isValid).toBe(true);
    expect(us.normalized).toBe('+14155552671');
    expect(us.country).toBe('US');

    const sg = normalizeVietnamesePhone('+6591234567');
    expect(sg.isValid).toBe(true);
    expect(sg.normalized).toBe('+6591234567');
    expect(sg.country).toBe('SG');

    const uk = normalizeVietnamesePhone('+447911123456');
    expect(uk.isValid).toBe(true);
    expect(uk.normalized).toBe('+447911123456');
  });
});
