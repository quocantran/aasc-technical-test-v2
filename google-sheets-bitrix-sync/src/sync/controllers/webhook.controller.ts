import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncOrchestratorService } from '../services/sync-orchestrator.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_CONFIG_DIRECTIONS } from '../../common/constants/sync.constants.js';

// Receives and validates real-time webhook event notifications from Bitrix24
@Controller('api/webhook/bitrix')
export class WebhookController {
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly logger: AppLogger,
  ) {
    this.webhookSecret = this.configService.get<string>('bitrix.inboundWebhookSecret') || '';
  }

  // Handles incoming Bitrix lead events, verifies token, and triggers background sync
  @Post()
  async handleBitrixWebhook(
    @Body() payload: any,
    @Headers('authorization') authHeader?: string,
  ) {
    this.logger.log(`Received Bitrix24 webhook event: ${payload?.event || 'Unknown'}`, 'WebhookController');

    // Validates application token against configured secret if enabled
    if (this.webhookSecret) {
      const token =
        payload?.auth?.application_token ||
        payload?.['auth[application_token]'] ||
        payload?.auth_token ||
        authHeader?.replace('Bearer ', '');
      if (token !== this.webhookSecret) {
        this.logger.warn('Unauthorized Bitrix24 webhook request rejected', 'WebhookController');
        throw new UnauthorizedException('Invalid Bitrix24 webhook token');
      }
    }

    const eventName = String(payload?.event || '').toUpperCase();
    const rawId = payload?.data?.FIELDS?.ID || payload?.data?.FIELDS_ID || payload?.data?.ID || payload?.ID;
    const leadIds: (string | number)[] = Array.isArray(rawId) ? rawId : (rawId !== undefined && rawId !== null ? [rawId] : []);
    const leadId = leadIds.length > 0 ? (leadIds.length === 1 ? leadIds[0] : leadIds) : undefined;

    // Suppresses self-echo webhook loops for leads just created or updated by this system
    const isSelfEcho =
      leadIds.length > 0 &&
      (eventName.includes('ADD') || eventName.includes('UPDATE') || eventName.includes('MODIFY')) &&
      typeof this.syncOrchestrator.isLeadRecentlySynced === 'function' &&
      leadIds.every((id) => this.syncOrchestrator.isLeadRecentlySynced(id));

    if (isSelfEcho) {
      this.logger.log(
        `Skipping self-echo Bitrix24 webhook event ${eventName} on recently synced Lead(s) ${JSON.stringify(leadId)}`,
        'WebhookController',
      );
      return {
        status: 'ignored',
        reason: 'self_echo',
        event: payload?.event,
        leadId,
        message: 'Self-echo webhook ignored (recently synced by forward sync)',
      };
    }

    this.logger.log(`Bitrix24 event ${eventName} on Lead(s) ${JSON.stringify(leadId ?? 'N/A')}, triggering sync`, 'WebhookController');

    const syncDirection = this.configService.get<string>('sync.direction') || SYNC_CONFIG_DIRECTIONS.ONE_WAY;

    // Dispatches either reverse sync or forward sync based on event & configuration
    if (
      syncDirection === SYNC_CONFIG_DIRECTIONS.TWO_WAY &&
      (eventName.includes('ADD') ||
        eventName.includes('UPDATE') ||
        eventName.includes('MODIFY') ||
        eventName.includes('DELETE'))
    ) {
      this.syncOrchestrator.syncBitrixToSheets(leadId).catch((err) => {
        this.logger.error(`Async two-way sync from webhook failed: ${err.message}`, err.stack, 'WebhookController');
      });
    } else {
      this.syncOrchestrator.runSync().catch((err) => {
        this.logger.error(`Async forward sync from webhook failed: ${err.message}`, err.stack, 'WebhookController');
      });
    }

    return {
      status: 'accepted',
      event: payload?.event,
      leadId,
      direction: syncDirection,
      message: 'Webhook processed successfully',
    };
  }
}

