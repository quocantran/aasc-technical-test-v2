import { Module } from '@nestjs/common';
import { TikTokWebhookController } from './controllers/tiktok-webhook.controller';
import { TikTokWebhookService } from './services/tiktok-webhook.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [TikTokWebhookController],
  providers: [TikTokWebhookService],
  exports: [TikTokWebhookService],
})
export class TikTokModule {}
