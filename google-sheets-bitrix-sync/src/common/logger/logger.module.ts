import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service.js';

// Global module providing AppLogger throughout the application
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
