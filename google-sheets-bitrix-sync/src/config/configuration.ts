// Maps environment variables to typed application settings
export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    databasePath: process.env.DATABASE_PATH || 'data/database.sqlite',
  },
  bitrix: {
    authType: process.env.BITRIX_AUTH_TYPE || 'WEBHOOK',
    webhookUrl: process.env.BITRIX_WEBHOOK_URL || '',
    rateLimitRps: parseInt(process.env.BITRIX_RATE_LIMIT_RPS || '2', 10),
    maxRetries: parseInt(process.env.BITRIX_MAX_RETRIES || '3', 10),
    inboundWebhookSecret: process.env.BITRIX_INBOUND_WEBHOOK_SECRET || '',
    oauth: {
      clientId: process.env.BITRIX24_CLIENT_ID || '',
      clientSecret: process.env.BITRIX24_CLIENT_SECRET || '',
      portalDomain: process.env.BITRIX24_DEFAULT_DOMAIN || '',
      oauthUrl: process.env.BITRIX24_OAUTH_URL || 'https://oauth.bitrix.info/oauth/token/',
      apiTimeout: parseInt(process.env.BITRIX24_API_TIMEOUT || '10000', 10),
    },
  },
  googleSheets: {
    authType: process.env.GOOGLE_AUTH_TYPE || 'SERVICE_ACCOUNT',
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Leads',
    credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || './config/credentials.json',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    oauth: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
    },
  },
  sync: {
    direction: process.env.SYNC_DIRECTION || 'ONE_WAY',
    cron: process.env.SYNC_CRON || '*/15 * * * *',
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '50', 10),
    mappingPath: process.env.SYNC_MAPPING_PATH || './config/mapping.json',
    mutexTimeoutMs: parseInt(process.env.SYNC_MUTEX_TIMEOUT_MS || '300000', 10),
  },
});
