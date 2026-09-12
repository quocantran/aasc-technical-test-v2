import { SanitizerNormalizer } from './sanitizer.normalizer';

describe('SanitizerNormalizer', () => {
  it('should strip script tags and HTML injection from string', () => {
    const malicious = '<script>alert("xss")</script>Nguyen Van A <b onclick="alert(1)">VIP</b>';
    const clean = SanitizerNormalizer.sanitizeString(malicious);
    expect(clean).toBe('Nguyen Van A VIP');
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick=');
  });

  it('should recursively sanitize deeply nested payload objects', () => {
    const payload = {
      full_name: 'John <img src=x onerror=alert(1)> Doe',
      custom_questions: [
        { question: 'Budget', answer: '<script>stealCookies()</script>50000000' },
      ],
      metadata: {
        note: 'Normal text with <i>HTML</i> tags',
      },
    };

    const sanitized = SanitizerNormalizer.sanitizePayload(payload);
    expect(sanitized.full_name).toBe('John  Doe');
    expect(sanitized.custom_questions[0].answer).toBe('50000000');
    expect(sanitized.metadata.note).toBe('Normal text with HTML tags');
  });
});
