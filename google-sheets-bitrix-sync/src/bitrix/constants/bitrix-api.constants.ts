// Centralized Bitrix24 REST API method names avoiding string hardcoding
export const BITRIX_API_METHODS = {
  LEAD_ADD: 'crm.lead.add',
  LEAD_UPDATE: 'crm.lead.update',
  LEAD_GET: 'crm.lead.get',
  LEAD_LIST: 'crm.lead.list',
  LEAD_DELETE: 'crm.lead.delete',
  LEAD_FIELDS: 'crm.lead.fields',
  DUPLICATE_FINDBYCOMM: 'crm.duplicate.findbycomm',
  BATCH: 'batch',
} as const;

// Supported multifield communication types in Bitrix24
export const BITRIX_MULTIFIELD_TYPES = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  WEB: 'WEB',
  IM: 'IM',
} as const;

// Value type specifiers for Bitrix multifield entries
export const BITRIX_VALUE_TYPES = {
  WORK: 'WORK',
  HOME: 'HOME',
  MOBILE: 'MOBILE',
  OTHER: 'OTHER',
} as const;

// Rate limiting, timeout, and batch processing operational limits
export const BITRIX_CONSTANTS = {
  MAX_BATCH_COMMANDS: 50,
  MAX_FINDBYCOMM_VALUES: 20,
  MAX_REQUESTS_PER_SECOND: 2,
  THROTTLE_INTERVAL_MS: 500,
  DEFAULT_TIMEOUT_MS: 30000,
  OAUTH_TIMEOUT_MS: 5000,
  DEFAULT_TOKEN_EXPIRES_IN_SEC: 3600,
} as const;

// Inbound Bitrix24 webhook event action types
export const BITRIX_WEBHOOK_EVENTS = {
  ON_CRM_LEAD_ADD: 'ONCRMLEADADD',
  ON_CRM_LEAD_UPDATE: 'ONCRMLEADUPDATE',
  ON_CRM_LEAD_DELETE: 'ONCRMLEADDELETE',
} as const;

