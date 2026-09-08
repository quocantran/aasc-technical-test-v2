/**
 * Formats a Date instance into DD/MM/YYYY HH:mm:ss for Google Sheets
 * Example: 08/09/2026 21:42:15
 */
export function formatSyncDateTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Parses a date-time string from Google Sheets (which may be DD/MM/YYYY HH:mm:ss, DD/MM/YYYY, or ISO 8601)
 * into a millisecond timestamp for comparison.
 */
export function parseSyncDateTime(str?: string | null): number {
  if (!str) return 0;
  const trimmed = str.trim();

  // Matches DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const [, day, month, year, h = '0', m = '0', s = '0'] = dmyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(s)).getTime();
  }

  const parsed = new Date(trimmed).getTime();
  return isNaN(parsed) ? 0 : parsed;
}
