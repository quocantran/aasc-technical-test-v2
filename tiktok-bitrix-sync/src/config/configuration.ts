export default () => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    appName: process.env.APP_NAME || 'tiktok-bitrix-sync',
    appSecret: process.env.APP_SECRET || (isProd ? '' : 'dev-secret-key'),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    apiKey: process.env.API_KEY || (isProd ? '' : 'aasc-secure-api-key-2026'),

    database: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tiktok_bitrix_sync?schema=public',
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },

    tiktok: {
      secretToken: process.env.TIKTOK_SECRET_TOKEN || (isProd ? '' : 'tiktok_secret_token_12345'),
      appId: process.env.TIKTOK_APP_ID || '7123456789',
      useMockEvents: process.env.USE_MOCK_TIKTOK_EVENTS === 'true',
      eventsApiUrl:
        process.env.TIKTOK_EVENTS_API_URL ||
        'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      eventsAccessToken: process.env.TIKTOK_EVENTS_ACCESS_TOKEN || 'mock_tiktok_events_token',
      pixelCode: process.env.TIKTOK_PIXEL_CODE || 'mock_pixel_code',
    },

  bitrix: {
    webhookUrl: process.env.BITRIX_WEBHOOK_URL || 'https://b24-sample.bitrix24.vn/rest/1/sampletoken123',
    inboundWebhookSecret:
      process.env.BITRIX_OUTBOUND_SECRET ||
      process.env.BITRIX_INBOUND_WEBHOOK_SECRET ||
      '',
    useMock: process.env.USE_MOCK_BITRIX === 'true',
    rateLimitRps: parseInt(process.env.BITRIX_RATE_LIMIT_RPS || '2', 10),
    maxRetries: parseInt(process.env.BITRIX_MAX_RETRIES || '3', 10),
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    dlqMaxAttempts: parseInt(process.env.DLQ_MAX_ATTEMPTS || '5', 10),
    autoRetryDelayMs: parseInt(process.env.AUTO_RETRY_DELAY_MS || '1000', 10),
  },

    logging: {
      level: process.env.LOG_LEVEL || 'debug',
      pretty: process.env.PRETTY_LOGS !== 'false',
    },
  };
};
