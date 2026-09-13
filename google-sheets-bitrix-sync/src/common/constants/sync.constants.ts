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

export const SYSTEM_COLUMN_ALIASES: Record<string, string[]> = {
  [SYSTEM_COLUMNS.STATUS]: ['trạng thái đồng bộ', 'trạng thái đồng bộ bitrix24', 'sync status', '__sync_status'],
  [SYSTEM_COLUMNS.BITRIX_ID]: ['lead id bitrix24', 'bitrix lead id', 'lead id', 'bitrix_id', '__bitrix_lead_id'],
  [SYSTEM_COLUMNS.LAST_SYNC]: ['thời gian đồng bộ cuối', 'thời gian đồng bộ', 'last sync time', 'last_sync', '__last_sync_time'],
  [SYSTEM_COLUMNS.ERROR]: ['thông báo lỗi', 'lỗi đồng bộ', 'chi tiết lỗi', 'error message', '__error_message'],
  [SYSTEM_COLUMNS.HASH]: ['sync hash', 'mã kiểm tra', 'checksum', '__sync_hash'],
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

// Direction types for synchronization executions
export const SYNC_DIRECTIONS = {
  SHEETS_TO_BITRIX: 'SHEETS_TO_BITRIX',
  BITRIX_TO_SHEETS: 'BITRIX_TO_SHEETS',
} as const;

export type SyncDirection = (typeof SYNC_DIRECTIONS)[keyof typeof SYNC_DIRECTIONS];

// Direction configuration modes (environment variable SYNC_DIRECTION)
export const SYNC_CONFIG_DIRECTIONS = {
  ONE_WAY: 'ONE_WAY',
  TWO_WAY: 'TWO_WAY',
} as const;

// Default limits, batch sizes, and timeout constants
export const SYNC_DEFAULTS = {
  BATCH_SIZE: 50,
  CRON_EXPRESSION: '*/15 * * * *',
  MUTEX_TIMEOUT_MS: 300000,
  REQUESTS_PER_SECOND: 2,
  RECENT_SYNC_TTL_MS: 4000,
  LOCK_TIMEOUT_MS: 15000,
  TEST_LOCK_TIMEOUT_MS: 100,
} as const;

// Standard Bitrix lead category group labels
export const BITRIX_LEAD_GROUPS = {
  CORE: 'Thông tin chính',
  PERSONAL: 'Thông tin cá nhân',
  CONTACT: 'Thông tin liên hệ',
  COMPANY: 'Doanh nghiệp & Công việc',
  SALES: 'Bán hàng & Trạng thái',
  MARKETING: 'Nguồn & Tiếp thị',
  ADDRESS: 'Địa chỉ & Vị trí',
  NOTES: 'Ghi chú & Khác',
  CUSTOM: 'Trường tùy biến (Custom Fields)',
} as const;

// Standard Vietnamese to Bitrix status enum mappings
export const DEFAULT_STATUS_MAPPINGS: Record<string, string> = {
  'Mới': 'NEW',
  'Chưa xử lý': 'NEW',
  'Đang liên hệ': 'IN_PROCESS',
  'Đang xử lý': 'IN_PROCESS',
  'Đã xử lý': 'PROCESSED',
  'Hoàn thành': 'CONVERTED',
  'Không tiềm năng': 'JUNK',
};

// Standard Vietnamese to Bitrix source enum mappings
export const DEFAULT_SOURCE_MAPPINGS: Record<string, string> = {
  'Website': 'WEB',
  'Facebook': 'FACEBOOK',
  'Đối tác': 'PARTNER',
  'Sự kiện': 'TRADE_SHOW',
  'Giới thiệu': 'RECOMMENDATION',
  'Khác': 'OTHER',
};


