// Vietnamese sync status labels written back to Google Sheets
export const SYNC_STATUS_VI = {
  SYNCED: 'ĐÃ ĐỒNG BỘ',
  PENDING: 'CHỜ XỬ LÝ',
  FAILED: 'LỖI',
  SKIPPED: 'BỎ QUA',
} as const;

export type SyncStatusVi = (typeof SYNC_STATUS_VI)[keyof typeof SYNC_STATUS_VI];

// Primary Vietnamese standard system column headers in Google Sheets
export const SYSTEM_COLUMNS_VI = {
  STATUS: 'Trạng thái đồng bộ',
  BITRIX_ID: 'Lead ID Bitrix24',
  LAST_SYNC: 'Thời gian đồng bộ cuối',
  ERROR: 'Thông báo lỗi',
  HASH: 'Sync Hash',
} as const;

// Legacy / Internal standard keys
export const SYSTEM_COLUMNS = {
  STATUS: '__sync_status',
  BITRIX_ID: '__bitrix_lead_id',
  LAST_SYNC: '__last_sync_time',
  ERROR: '__error_message',
  HASH: '__sync_hash',
} as const;

// Supported header aliases for each system column (case-insensitive search supported)
export const SYSTEM_COLUMN_ALIASES: Record<string, string[]> = {
  [SYSTEM_COLUMNS.STATUS]: ['trạng thái đồng bộ', 'trạng thái đồng bộ bitrix24', 'sync status', 'status', '__sync_status'],
  [SYSTEM_COLUMNS.BITRIX_ID]: ['lead id bitrix24', 'bitrix lead id', 'lead id', 'bitrix_id', '__bitrix_lead_id'],
  [SYSTEM_COLUMNS.LAST_SYNC]: ['thời gian đồng bộ cuối', 'thời gian đồng bộ', 'last sync time', 'last_sync', '__last_sync_time'],
  [SYSTEM_COLUMNS.ERROR]: ['thông báo lỗi', 'lỗi đồng bộ', 'error message', 'error', '__error_message'],
  [SYSTEM_COLUMNS.HASH]: ['sync hash', 'checksum', 'hash', '__sync_hash'],
};

export const SYSTEM_COLUMN_KEYS = Object.values(SYSTEM_COLUMNS);

// Helper to check if a header name is a recognized system column
export function isSystemHeader(header: string): boolean {
  if (!header) return false;
  const normalized = header.trim().toLowerCase();
  for (const aliases of Object.values(SYSTEM_COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) {
      return true;
    }
  }
  return false;
}

// Execution action determined during row partitioning
export enum SyncAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  SKIP = 'SKIP',
}

// Default limits, batch sizes, and timeout constants
export const SYNC_DEFAULTS = {
  BATCH_SIZE: 50,
  CRON_EXPRESSION: '*/15 * * * *',
  MUTEX_TIMEOUT_MS: 300000,
  REQUESTS_PER_SECOND: 2,
} as const;

