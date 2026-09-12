import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

async function exportSwagger() {
  console.log('Generating OpenAPI Swagger document...');

  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

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

  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const outputPath = path.join(docsDir, 'swagger.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`✅ OpenAPI Swagger JSON successfully exported to: ${outputPath}`);
  await app.close();
  process.exit(0);
}

exportSwagger().catch((err) => {
  console.error('Failed to export Swagger JSON:', err);
  process.exit(1);
});
