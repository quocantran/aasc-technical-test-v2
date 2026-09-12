import {
  Controller,
  Post,
  Body,
  UseGuards,
  Optional,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { Public } from '../../../common/decorators/api-key.decorator';
import { BitrixWebhookService } from '../services/bitrix-webhook.service';
import { BitrixWebhookGuard } from '../guards/bitrix-webhook.guard';

@ApiTags('Webhooks')
@Controller('webhooks/bitrix24')
export class BitrixWebhookController {
  private readonly logger: AppLogger;

  constructor(
    private readonly webhookService: BitrixWebhookService,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger || new AppLogger();
  }

  @Public()
  @UseGuards(BitrixWebhookGuard)
  @Post('deals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive outbound webhook notifications from Bitrix24 Deals' })
  @ApiResponse({ status: 200, description: 'Webhook processed or queued successfully' })
  async handleDealWebhook(@Body() payload: any) {
    this.logger.log(
      `Received Bitrix24 webhook event: ${payload?.event || 'Unknown'}`,
      'BitrixWebhookController',
    );

    // Delegate processing to application service (Thin Controller MVC pattern)
    return this.webhookService.processDealWebhook(payload);
  }
}
