export const QUEUE_NAMES = {
  LEAD_PROCESSING: 'lead-processing',
  BITRIX_SYNC: 'bitrix-sync',
  DEAL_CONVERSION: 'deal-conversion',
  TIKTOK_EVENTS_SYNC: 'tiktok-events-sync',
} as const;

export const JOB_NAMES = {
  PROCESS_LEAD: 'process-lead',
  SYNC_LEAD_TO_BITRIX: 'sync-lead-to-bitrix',
  SYNC_LEADS_BATCH_TO_BITRIX: 'sync-leads-batch-to-bitrix',
  EVALUATE_DEAL_RULES: 'evaluate-deal-rules',
  SEND_TIKTOK_EVENT: 'send-tiktok-event',
} as const;
