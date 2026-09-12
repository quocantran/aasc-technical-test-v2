import { Module } from '@nestjs/common';
import { DealController } from './controllers/deal.controller';
import { DealService } from './services/deal.service';
import { DealConversionService } from './services/deal-conversion.service';
import { BitrixModule } from '../bitrix/bitrix.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { ConfigMgmtModule } from '../config-mgmt/config-mgmt.module';

@Module({
  imports: [BitrixModule, RuleEngineModule, ConfigMgmtModule],
  controllers: [DealController],
  providers: [DealService, DealConversionService],
  exports: [DealService, DealConversionService],
})
export class DealModule {}
