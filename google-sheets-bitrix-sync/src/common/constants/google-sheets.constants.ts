// Operational limits, default ranges, cache TTL, and sheet name for Google Sheets API
export const GOOGLE_SHEETS_CONSTANTS = {
  HEADER_ROW_INDEX: 1,
  DEFAULT_RANGE: 'A:ZZ',
  MAX_READ_QUOTA_PER_MINUTE: 60,
  MAX_WRITE_QUOTA_PER_MINUTE: 60,
  DEFAULT_SHEET_NAME: 'Leads',
  ROW_COUNT_CACHE_TTL_MS: 15000,
  DEFAULT_TOKEN_EXPIRES_IN_SEC: 3600,
} as const;

