export const BITRIX_API_METHODS = {
  LEAD_ADD: 'crm.lead.add',
  LEAD_UPDATE: 'crm.lead.update',
  LEAD_GET: 'crm.lead.get',
  LEAD_LIST: 'crm.lead.list',
  LEAD_DELETE: 'crm.lead.delete',
  LEAD_FIELDS: 'crm.lead.fields',
  DEAL_ADD: 'crm.deal.add',
  DEAL_UPDATE: 'crm.deal.update',
  DEAL_GET: 'crm.deal.get',
  DEAL_LIST: 'crm.deal.list',
  DEAL_DELETE: 'crm.deal.delete',
  DEAL_FIELDS: 'crm.deal.fields',
  DEAL_CATEGORY_LIST: 'crm.dealcategory.list',
  DEAL_CATEGORY_STAGE_LIST: 'crm.dealcategory.stage.list',
  DUPLICATE_FINDBYCOMM: 'crm.duplicate.findbycomm',
  TIMELINE_COMMENT_ADD: 'crm.timeline.comment.add',
  IM_NOTIFY_SYSTEM_ADD: 'im.notify.system.add',
  BATCH: 'batch',
} as const;

export const BITRIX_CONSTANTS = {
  MAX_BATCH_COMMANDS: 50,
  MAX_FINDBYCOMM_VALUES: 20,
  MAX_REQUESTS_PER_SECOND: 2,
  THROTTLE_INTERVAL_MS: 500,
  DEFAULT_TIMEOUT_MS: 30000,
} as const;

export const BITRIX_WEBHOOK_EVENTS = {
  ON_CRM_DEAL_ADD: 'ONCRMDEALADD',
  ON_CRM_DEAL_UPDATE: 'ONCRMDEALUPDATE',
  ON_CRM_LEAD_ADD: 'ONCRMLEADADD',
  ON_CRM_LEAD_UPDATE: 'ONCRMLEADUPDATE',
} as const;
