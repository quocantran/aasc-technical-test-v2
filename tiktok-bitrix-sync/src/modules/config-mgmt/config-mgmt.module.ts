import { Module } from '@nestjs/common';
import { ConfigController } from './controllers/config.controller';
import { ConfigService } from './services/config.service';

@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigMgmtModule {}
