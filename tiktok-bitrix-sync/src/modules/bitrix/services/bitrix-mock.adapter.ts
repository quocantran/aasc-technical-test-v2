import { Injectable, Optional } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app-logger.service';
import {
  IBitrixCrmAdapter,
  BitrixLeadPayload,
  BitrixDealPayload,
  BitrixEntityResponse,
  BitrixBatchLeadItem,
  BitrixBatchResultItem,
} from '../interfaces/bitrix-adapter.interface';

@Injectable()
export class BitrixMockAdapter implements IBitrixCrmAdapter {
  private leadSequence = 1000;
  private dealSequence = 5000;

  public readonly leads = new Map<number, any>();
  public readonly deals = new Map<number, any>();
  public readonly timelineComments: Array<{ entityType: string; entityId: number; comment: string; createdAt: string }> = [];
  public readonly notifications: Array<{ userId: number | string; message: string; createdAt: string }> = [];

  private readonly logger: AppLogger;

  constructor(@Optional() logger?: AppLogger) {
    this.logger = logger || new AppLogger();
    this.logger.debug('BitrixMockAdapter instantiated.', 'BitrixMockAdapter');
  }

  async createLead(
    data: BitrixLeadPayload,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: { REGISTER_SONET_EVENT?: 'Y' | 'N' },
  ): Promise<BitrixEntityResponse> {
    const id = ++this.leadSequence;
    const leadRecord = {
      ID: String(id),
      ...data,
      DATE_CREATE: new Date().toISOString(),
      DATE_MODIFY: new Date().toISOString(),
    };

    this.leads.set(id, leadRecord);
    this.logger.log(
      `[MockBitrix] Created Lead #${id} (Total mock leads: ${this.leads.size})`,
      'BitrixMockAdapter',
    );
    return { id, raw: leadRecord };
  }

  async createLeadsBatch(
    items: BitrixBatchLeadItem[],
  ): Promise<Record<string, BitrixBatchResultItem>> {
    this.logger?.log(`[MockBitrix] Executing mock batch creation for ${items.length} leads`, 'BitrixMockAdapter');
    const result: Record<string, BitrixBatchResultItem> = {};
    for (const item of items) {
      const res = await this.createLead(item.data);
      result[item.key] = { id: res.id, success: true };
    }
    return result;
  }

  async updateLead(id: number, data: Partial<BitrixLeadPayload>): Promise<boolean> {
    const existing = this.leads.get(id);
    if (!existing) {
      this.logger.warn(`[MockBitrix] Update failed: Lead #${id} not found`, 'BitrixMockAdapter');
      return false;
    }

    const updated = {
      ...existing,
      ...data,
      DATE_MODIFY: new Date().toISOString(),
    };
    this.leads.set(id, updated);
    this.logger.log(`[MockBitrix] Updated Lead #${id}`, 'BitrixMockAdapter');
    return true;
  }

  async getLead(id: number): Promise<any | null> {
    return this.leads.get(id) || null;
  }

  async findDuplicates(type: 'EMAIL' | 'PHONE', values: string[]): Promise<number[]> {
    const matchedIds: number[] = [];
    const searchSet = new Set(values.map((v) => v.toLowerCase().trim()));

    for (const [id, lead] of this.leads.entries()) {
      if (type === 'EMAIL' && Array.isArray(lead.EMAIL)) {
        const hasMatch = lead.EMAIL.some((item: any) =>
          searchSet.has(String(item.VALUE).toLowerCase().trim()),
        );
        if (hasMatch) matchedIds.push(id);
      } else if (type === 'PHONE' && Array.isArray(lead.PHONE)) {
        const hasMatch = lead.PHONE.some((item: any) =>
          searchSet.has(String(item.VALUE).trim()),
        );
        if (hasMatch) matchedIds.push(id);
      }
    }

    this.logger.debug(
      `[MockBitrix] Duplicate check for ${type} found ${matchedIds.length} leads`,
      'BitrixMockAdapter',
    );
    return matchedIds;
  }

  async createDeal(
    data: BitrixDealPayload,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: { REGISTER_SONET_EVENT?: 'Y' | 'N' },
  ): Promise<BitrixEntityResponse> {
    const id = ++this.dealSequence;
    const dealRecord = {
      ID: String(id),
      ...data,
      STAGE_ID: data.STAGE_ID || 'NEW',
      DATE_CREATE: new Date().toISOString(),
      DATE_MODIFY: new Date().toISOString(),
    };

    this.deals.set(id, dealRecord);
    this.logger.log(
      `[MockBitrix] Created Deal #${id}: "${data.TITLE}" (Total mock deals: ${this.deals.size})`,
      'BitrixMockAdapter',
    );
    return { id, raw: dealRecord };
  }

  async updateDeal(id: number, data: Partial<BitrixDealPayload>): Promise<boolean> {
    const existing = this.deals.get(id);
    if (!existing) {
      this.logger.warn(`[MockBitrix] Update failed: Deal #${id} not found`, 'BitrixMockAdapter');
      return false;
    }

    const updated = {
      ...existing,
      ...data,
      DATE_MODIFY: new Date().toISOString(),
    };
    this.deals.set(id, updated);
    this.logger.log(`[MockBitrix] Updated Deal #${id}`, 'BitrixMockAdapter');
    return true;
  }

  async getDeal(id: number): Promise<any | null> {
    return this.deals.get(id) || null;
  }

  async findDealByOrigin(originatorId: string, originId: string): Promise<BitrixEntityResponse | null> {
    for (const [id, deal] of this.deals.entries()) {
      if (deal.ORIGINATOR_ID === originatorId && deal.ORIGIN_ID === originId) {
        return { id, raw: deal };
      }
    }
    return null;
  }

  async findDealByTitle(title: string): Promise<BitrixEntityResponse | null> {
    for (const [id, deal] of this.deals.entries()) {
      if (deal.TITLE === title) {
        return { id, raw: deal };
      }
    }
    return null;
  }

  async addTimelineComment(entityType: 'lead' | 'deal', entityId: number, comment: string): Promise<boolean> {
    this.timelineComments.push({
      entityType,
      entityId,
      comment,
      createdAt: new Date().toISOString(),
    });
    this.logger?.log(
      `[MockBitrix] Added timeline comment for ${entityType} #${entityId}: "${comment}"`,
      'BitrixMockAdapter',
    );
    return true;
  }

  async sendNotification(userId: number | string, message: string): Promise<boolean> {
    this.notifications.push({
      userId,
      message,
      createdAt: new Date().toISOString(),
    });
    this.logger?.log(
      `[MockBitrix] Sent notification to user #${userId}: "${message}"`,
      'BitrixMockAdapter',
    );
    return true;
  }
}
