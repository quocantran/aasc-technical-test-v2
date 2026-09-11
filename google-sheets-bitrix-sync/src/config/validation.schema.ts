import Joi from 'joi';

// Validates required environment variables and sets defaults on application boot
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  DATABASE_PATH: Joi.string().default('data/database.sqlite'),

  BITRIX_WEBHOOK_URL: Joi.string().uri().required(),
  BITRIX_RATE_LIMIT_RPS: Joi.number().default(2),
  BITRIX_MAX_RETRIES: Joi.number().default(3),
  BITRIX_INBOUND_WEBHOOK_SECRET: Joi.string().optional().allow(''),

  GOOGLE_AUTH_TYPE: Joi.string().valid('SERVICE_ACCOUNT', 'OAUTH2').default('SERVICE_ACCOUNT'),
  GOOGLE_SHEET_ID: Joi.string().required(),
  GOOGLE_SHEET_NAME: Joi.string().default('Leads'),
  GOOGLE_SHEETS_CREDENTIALS_PATH: Joi.string().optional().allow(''),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: Joi.string().email().optional().allow(''),

  GOOGLE_OAUTH_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().optional().allow(''),
  GOOGLE_OAUTH_REDIRECT_URI: Joi.string().optional().allow(''),

  SYNC_DIRECTION: Joi.string()
    .valid('ONE_WAY', 'TWO_WAY')
    .default('ONE_WAY'),
  SYNC_CRON: Joi.string().default('*/15 * * * *'),
  SYNC_BATCH_SIZE: Joi.number().default(50),
  SYNC_MAPPING_PATH: Joi.string().default('./config/mapping.json'),
  SYNC_MUTEX_TIMEOUT_MS: Joi.number().default(300000),
}).unknown(true);
