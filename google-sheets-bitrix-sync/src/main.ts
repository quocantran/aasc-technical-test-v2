import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module.js';
import { AppLogger } from './common/logger/app-logger.service.js';

// Bootstraps HTTP server, attaches structured logger, serves static assets, and starts listening on port
async function bootstrap() {
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
    const logger = app.get(AppLogger);
    app.useLogger(logger);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );

    app.useStaticAssets(join(process.cwd(), 'public'), { index: false });

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    logger.log(`Application is running on port ${port}`, 'Bootstrap');
  } catch (err: any) {
    console.error('Failed to bootstrap application:', err);
    process.exit(1);
  }
}
await bootstrap();


