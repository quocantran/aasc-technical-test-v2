import { Module } from '@nestjs/common';
import { RuleEvaluatorService } from './services/rule-evaluator.service';

@Module({
  providers: [RuleEvaluatorService],
  exports: [RuleEvaluatorService],
})
export class RuleEngineModule {}
