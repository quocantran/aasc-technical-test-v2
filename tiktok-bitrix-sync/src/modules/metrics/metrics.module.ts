import { Module, Global, forwardRef } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { QueueModule } from '../queue/queue.module';

@Global()
@Module({
  imports: [forwardRef(() => QueueModule)],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
