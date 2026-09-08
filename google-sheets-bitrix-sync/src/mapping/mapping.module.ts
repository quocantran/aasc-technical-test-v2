import { Module } from '@nestjs/common';
import { MappingService } from './services/mapping.service.js';

// Module providing field transformation and data normalization services
@Module({
  providers: [MappingService],
  exports: [MappingService],
})
export class MappingModule {}
