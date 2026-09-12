export const API_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  API_KEY_HEADER: 'x-api-key',
  TIKTOK_SIGNATURE_HEADER: 'tiktok-signature',
  TIKTOK_TIMESTAMP_HEADER: 'tiktok-timestamp',
} as const;

export const EVENT_TYPES = {
  LEAD_GENERATE: 'lead.generate',
  FORM_SUBMIT: 'form.submit',
  FORM_COMPLETE: 'form.complete',
  USER_INTERACTION: 'user.interaction',
} as const;

export const LEAD_STATUS = {
  NEW: 'new',
  PROCESSING: 'processing',
  SYNCED: 'synced',
  FAILED: 'failed',
  CONVERTED: 'converted',
  DUPLICATE_MERGED: 'duplicate_merged',
} as const;

export const DEAL_STATUS = {
  PENDING: 'pending',
  CREATED: 'created',
  WON: 'won',
  LOST: 'lost',
  FAILED: 'failed',
} as const;

export const AUDIT_ACTIONS = {
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  WEBHOOK_REJECTED: 'WEBHOOK_REJECTED',
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_UPDATED: 'LEAD_UPDATED',
  LEAD_SYNCED: 'LEAD_SYNCED',
  LEAD_SYNC_FAILED: 'LEAD_SYNC_FAILED',
  FORM_COMPLETED: 'FORM_COMPLETED',
  DEAL_CREATED: 'DEAL_CREATED',
  DEAL_STAGE_CHANGED: 'DEAL_STAGE_CHANGED',
  TIKTOK_CONVERSION_SENT: 'TIKTOK_CONVERSION_SENT',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
} as const;

