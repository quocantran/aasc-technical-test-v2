import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  // Trust proxy for upstream reverse proxies (Docker, Nginx, Cloudflare) to prevent IP spoofing
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Security HTTP headers with Helmet (CSP disabled to allow Swagger UI execution)
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';

  // Global prefix with exclusions for webhooks per TARGET.md and Prometheus /metrics
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['webhooks/tiktok/leads', 'webhooks/bitrix24/deals', 'metrics'],
  });

  // Global input validation & sanitization pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TikTok Lead Generation → Bitrix24 CRM Integration API')
    .setDescription(
      'Automated bidirectional integration engine between TikTok Lead Generation Forms and Bitrix24 CRM with BullMQ queues, dynamic rule engines, deduplication, and analytics.',
    )
    .setVersion('1.0.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Management API Key for administrative endpoints',
      },
      'x-api-key',
    )
    .addTag('Webhooks', 'Incoming webhook receivers for TikTok and Bitrix24')
    .addTag('Leads', 'Lead management and querying')
    .addTag('Deals', 'Deal conversion and querying')
    .addTag('Configuration', 'Runtime field mapping and deal rule management')
    .addTag('Analytics', 'Conversion rates, ROI, and campaign metrics')
    .addTag('Reports', 'Data export to CSV / JSON')
    .addTag('Health', 'Service health check')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`=======================================================`, 'Bootstrap');
  logger.log(`[APP] Application running on: http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  logger.log(`[DOCS] Swagger API Docs available at: http://localhost:${port}/docs`, 'Bootstrap');
  logger.log(`[WEBHOOK] TikTok Webhook: http://localhost:${port}/webhooks/tiktok/leads`, 'Bootstrap');
  logger.log(`[WEBHOOK] Bitrix24 Webhook: http://localhost:${port}/webhooks/bitrix24/deals`, 'Bootstrap');
  logger.log(`=======================================================`, 'Bootstrap');
}

bootstrap();
