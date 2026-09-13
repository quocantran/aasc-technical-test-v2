import { describe, it, expect } from 'vitest';
import { formatSyncDateTime, parseSyncDateTime } from './date.helper.js';

describe('date.helper', () => {
  it('should format date to DD/MM/YYYY HH:mm:ss format', () => {
    const fixedDate = new Date(2026, 8, 8, 21, 5, 9); // 2026-09-08 21:05:09
    const formatted = formatSyncDateTime(fixedDate);
    expect(formatted).toBe('08/09/2026 21:05:09');
    expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}$/);
  });

  it('should pad single-digit day, month, hour, minute, second with zero', () => {
    const d = new Date(2026, 0, 5, 4, 3, 2); // 2026-01-05 04:03:02
    expect(formatSyncDateTime(d)).toBe('05/01/2026 04:03:02');
  });

  it('should parse DD/MM/YYYY HH:mm:ss back to timestamp', () => {
    const original = new Date(2026, 8, 8, 21, 5, 9);
    const formatted = formatSyncDateTime(original);
    const timestamp = parseSyncDateTime(formatted);
    expect(timestamp).toBe(original.getTime());
  });

  it('should parse ISO 8601 string for backward compatibility', () => {
    const iso = '2026-03-01T00:00:00.000Z';
    const timestamp = parseSyncDateTime(iso);
    expect(timestamp).toBe(new Date(iso).getTime());
  });

  it('should parse Excel/Google Sheets serial date format (both comma and dot separators)', () => {
    const serialDot = '46278.548796';
    const serialComma = '46278,548796';
    const tsDot = parseSyncDateTime(serialDot);
    const tsComma = parseSyncDateTime(serialComma);
    expect(tsDot).toBeGreaterThan(0);
    expect(tsComma).toBe(tsDot);
    const date = new Date(tsDot);
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(date.getUTCDate()).toBe(13);
  });

  it('should return 0 for null or empty input', () => {
    expect(parseSyncDateTime(null)).toBe(0);
    expect(parseSyncDateTime('')).toBe(0);
    expect(parseSyncDateTime(undefined)).toBe(0);
  });
});
