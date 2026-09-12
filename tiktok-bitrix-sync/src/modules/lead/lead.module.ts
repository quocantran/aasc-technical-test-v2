import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../common/constants/queue.constants';
import { LeadController } from './controllers/lead.controller';
import { LeadService } from './services/lead.service';
import { LeadDeduplicationService } from './services/lead-deduplication.service';
import { LeadMappingService } from './services/lead-mapping.service';
import { BatchMigrationService } from './services/batch-migration.service';
import { BitrixModule } from '../bitrix/bitrix.module';
import { ConfigMgmtModule } from '../config-mgmt/config-mgmt.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { DealModule } from '../deal/deal.module';
import { LeadQualityScoreService } from './services/lead-quality-score.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.BITRIX_SYNC,
    }),
    BitrixModule,
    ConfigMgmtModule,
    RuleEngineModule,
    DealModule,
  ],
  controllers: [LeadController],
  providers: [
    LeadService,
    LeadDeduplicationService,
    LeadMappingService,
    BatchMigrationService,
    LeadQualityScoreService,
  ],
  exports: [
    LeadService,
    LeadDeduplicationService,
    LeadMappingService,
    BatchMigrationService,
    LeadQualityScoreService,
  ],
})
export class LeadModule {}

