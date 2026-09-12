import { normalizeEmail } from './email.normalizer';

describe('normalizeEmail', () => {
  it('should trim and lowercase standard email', () => {
    const res = normalizeEmail('  NgUyEnVanA@Email.Com  ');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('nguyenvana@email.com');
  });

  it('should accept valid emails with dots and plus signs', () => {
    const res = normalizeEmail('user.name+tag@domain.co.uk');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('user.name+tag@domain.co.uk');
  });

  it('should reject invalid email formats', () => {
    expect(normalizeEmail('plainaddress').isValid).toBe(false);
    expect(normalizeEmail('@missingusername.com').isValid).toBe(false);
    expect(normalizeEmail('missingdomain@.com').isValid).toBe(false);
    expect(normalizeEmail('').isValid).toBe(false);
    expect(normalizeEmail(null).isValid).toBe(false);
  });
});
