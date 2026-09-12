import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { PrismaService } from '../../../database/prisma.service';
import {
  TIKTOK_EVENTS_ADAPTER,
  ITikTokEventsAdapter,
  TikTokConversionEventPayload,
} from '../interfaces/tiktok-events.interface';
import { AUDIT_ACTIONS } from '../../../common/constants/api.constants';

@Injectable()
export class TikTokEventsService {
  constructor(
    @Inject(TIKTOK_EVENTS_ADAPTER)
    private readonly eventsAdapter: ITikTokEventsAdapter,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  // Computes SHA256 hash for PII privacy compliance with TikTok Events API.
  private sha256(val?: string): string | undefined {
    if (!val || val.trim() === '') return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  // Formats and sends conversion events (SubmitForm or CompletePayment) to TikTok.
  async trackLeadConversion(lead: any, deal?: any) {
    if (!lead) return;

    const payload: TikTokConversionEventPayload = {
      event: deal ? 'CompletePayment' : 'SubmitForm',
      event_time: Math.floor(Date.now() / 1000),
      event_id: deal ? `conv_deal_${deal.id}` : `conv_lead_${lead.id}`,
      user: {
        ttclid: lead.ttclid || undefined,
        email: this.sha256(lead.email),
        phone: this.sha256(lead.phone),
        external_id: lead.externalId,
      },
      properties: deal
        ? {
            value: Number(deal.amount || 0),
            currency: deal.currency || 'VND',
            content_name: deal.title,
            content_type: 'product',
          }
        : undefined,
    };

    const result = await this.eventsAdapter.sendEvent(payload);

    await this.prisma.auditLog.create({
      data: {
        leadId: lead.id,
        action: AUDIT_ACTIONS.TIKTOK_CONVERSION_SENT,
        entityType: 'LEAD',
        entityId: lead.id,
        details: {
          event: payload.event,
          ttclid: lead.ttclid,
          amount: deal?.amount ? Number(deal.amount) : undefined,
          result: result as any,
        },
      },
    });

    this.logger.log(`TikTok conversion sent for lead #${lead.id}`, 'TikTokEventsService');
    return result;
  }
}
