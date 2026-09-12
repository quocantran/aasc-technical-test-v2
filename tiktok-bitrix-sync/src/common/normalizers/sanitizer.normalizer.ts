// Sanitizes raw user input strings and objects against XSS and HTML injections.
export class SanitizerNormalizer {
  // Strips HTML tags, script elements, and dangerous characters from string
  static sanitizeString(input?: string | null): string {
    if (!input || typeof input !== 'string') return '';

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove <style> tags
      .replace(/<[^>]+>/g, '') // Strip remaining HTML tags
      .replace(/javascript:/gi, '') // Strip javascript: pseudo-protocol
      .replace(/on\w+\s*=/gi, '') // Strip inline event handlers (e.g. onerror=, onclick=)
      .trim();
  }

  // Deeply sanitizes any object or array of data
  static sanitizePayload<T = any>(data: T): T {
    if (!data) return data;

    if (typeof data === 'string') {
      return this.sanitizeString(data) as any;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizePayload(item)) as any;
    }

    if (typeof data === 'object' && data !== null && !(data instanceof Date)) {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizePayload(value);
      }
      return sanitized as any;
    }

    return data;
  }
}
