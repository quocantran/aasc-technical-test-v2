import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { MappingModule } from '../mapping/mapping.module.js';
import { BitrixModule } from '../bitrix/bitrix.module.js';
import { AdminController } from './admin.controller.js';

// Dedicated Admin Management Module providing web dashboard and admin configuration REST APIs
@Module({
  imports: [SyncModule, MappingModule, BitrixModule],
  controllers: [AdminController],
})
export class AdminModule {}
