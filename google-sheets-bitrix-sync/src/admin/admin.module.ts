import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { MappingModule } from '../mapping/mapping.module.js';
import { BitrixModule } from '../bitrix/bitrix.module.js';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module.js';
import { AdminController } from './admin.controller.js';
import { AuthController } from './auth.controller.js';

// Dedicated Admin Management Module providing web dashboard, OAuth 2.0 routes, and admin configuration REST APIs
@Module({
  imports: [SyncModule, MappingModule, BitrixModule, GoogleSheetsModule],
  controllers: [AdminController, AuthController],
})
export class AdminModule {}
