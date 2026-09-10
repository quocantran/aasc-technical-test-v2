import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncHistoryEntity } from './entities/sync-history.entity.js';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module.js';
import { BitrixModule } from '../bitrix/bitrix.module.js';
import { MappingModule } from '../mapping/mapping.module.js';
import { HashService } from './services/hash.service.js';
import { LockService } from './services/lock.service.js';
import { SyncHistoryService } from './services/sync-history.service.js';
import { DeduplicationService } from './services/deduplication.service.js';
import { ForwardSyncService } from './services/forward-sync.service.js';
import { ReverseSyncService } from './services/reverse-sync.service.js';
import { SyncOrchestratorService } from './services/sync-orchestrator.service.js';
import { SyncController } from './controllers/sync.controller.js';
import { WebhookController } from './controllers/webhook.controller.js';
import { SyncScheduler } from './schedulers/sync.scheduler.js';
import { SyncCommand } from './commands/sync.command.js';

// Module configuring synchronization pipeline services, controllers, cron, and CLI command
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncHistoryEntity]),
    GoogleSheetsModule,
    BitrixModule,
    MappingModule,
  ],
  controllers: [SyncController, WebhookController],
  providers: [
    HashService,
    LockService,
    SyncHistoryService,
    DeduplicationService,
    ForwardSyncService,
    ReverseSyncService,
    SyncOrchestratorService,
    SyncScheduler,
    SyncCommand,
  ],
  exports: [
    SyncOrchestratorService,
    HashService,
    LockService,
    SyncHistoryService,
    DeduplicationService,
    ForwardSyncService,
    ReverseSyncService,
  ],
})
export class SyncModule {}
