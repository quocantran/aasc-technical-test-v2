export const ERROR_MESSAGES = {
  UNAUTHORIZED_WEBHOOK: 'Invalid or missing webhook signature',
  UNAUTHORIZED_API_KEY: 'Invalid or missing API key',
  LEAD_NOT_FOUND: 'Lead not found',
  DEAL_NOT_FOUND: 'Deal not found',
  INVALID_PHONE_FORMAT: 'Invalid Vietnamese phone number format',
  INVALID_EMAIL_FORMAT: 'Invalid email address format',
  DUPLICATE_EVENT: 'Webhook event already processed or currently processing',
  BITRIX_API_ERROR: 'Bitrix24 CRM API communication error',
  CONFIG_NOT_FOUND: 'Configuration key not found',
} as const;
