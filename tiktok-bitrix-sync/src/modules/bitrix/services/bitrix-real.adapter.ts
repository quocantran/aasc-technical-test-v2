import { Injectable } from '@nestjs/common';
import qs from 'qs';
import { AppLogger } from '../../../common/logger/app-logger.service';
import {
  IBitrixCrmAdapter,
  BitrixLeadPayload,
  BitrixDealPayload,
  BitrixEntityResponse,
  BitrixBatchLeadItem,
  BitrixBatchResultItem,
} from '../interfaces/bitrix-adapter.interface';
import { BitrixHttpService } from './bitrix-http.service';
import { BITRIX_API_METHODS } from '../constants/bitrix-api.constants';

@Injectable()
export class BitrixRealAdapter implements IBitrixCrmAdapter {
  constructor(
    private readonly httpService: BitrixHttpService,
    private readonly logger: AppLogger,
  ) {}

  async createLead(
    data: BitrixLeadPayload,
    options: { REGISTER_SONET_EVENT?: 'Y' | 'N' } = { REGISTER_SONET_EVENT: 'N' },
  ): Promise<BitrixEntityResponse> {
    this.logger.log(`[RealBitrix] Creating Lead: ${data.TITLE}`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<number | string>(BITRIX_API_METHODS.LEAD_ADD, {
      fields: data,
      params: options,
    });
    return { id: Number(result), raw: result };
  }

  async createLeadsBatch(
    items: BitrixBatchLeadItem[],
  ): Promise<Record<string, BitrixBatchResultItem>> {
    if (items.length === 0) return {};

    this.logger.log(`[RealBitrix] Executing native batch creation for ${items.length} leads`, 'BitrixRealAdapter');
    const commands: Record<string, string> = {};

    for (const item of items) {
      const queryString = qs.stringify({
        fields: item.data,
        params: { REGISTER_SONET_EVENT: 'N' },
      });
      commands[item.key] = `${BITRIX_API_METHODS.LEAD_ADD}?${queryString}`;
    }

    const batchRes = await this.httpService.executeBatch(commands);
    const result: Record<string, BitrixBatchResultItem> = {};

    for (const item of items) {
      const bitrixId = batchRes.result?.[item.key];
      const bitrixErr = batchRes.result_error?.[item.key];

      if (bitrixId) {
        result[item.key] = { id: Number(bitrixId), success: true };
      } else {
        result[item.key] = {
          success: false,
          error: bitrixErr ? JSON.stringify(bitrixErr) : 'Unknown Bitrix batch error',
        };
      }
    }

    return result;
  }

  async updateLead(id: number, data: Partial<BitrixLeadPayload>): Promise<boolean> {
    this.logger.log(`[RealBitrix] Updating Lead #${id}`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<boolean>(BITRIX_API_METHODS.LEAD_UPDATE, {
      id,
      fields: data,
      params: { REGISTER_SONET_EVENT: 'N' },
    });
    return Boolean(result);
  }

  async getLead(id: number): Promise<any | null> {
    try {
      this.logger.log(`[RealBitrix] Getting Lead #${id}`, 'BitrixRealAdapter');
      const result = await this.httpService.callMethod(BITRIX_API_METHODS.LEAD_GET, { id });
      return result || null;
    } catch (err: any) {
      if (err?.response?.status === 404 || String(err?.message).includes('not found')) {
        return null;
      }
      throw err;
    }
  }

  async findDuplicates(type: 'EMAIL' | 'PHONE', values: string[]): Promise<number[]> {
    const valid = values.filter((v) => v && v.trim() !== '');
    if (valid.length === 0) return [];

    this.logger.log(`[RealBitrix] Finding duplicate leads for ${type}`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<any>(BITRIX_API_METHODS.DUPLICATE_FINDBYCOMM, {
      type,
      values: valid.slice(0, 20),
      entity_type: 'LEAD',
    });

    if (result && Array.isArray(result.LEAD)) {
      return result.LEAD.map(Number);
    }
    return [];
  }

  async createDeal(
    data: BitrixDealPayload,
    options: { REGISTER_SONET_EVENT?: 'Y' | 'N' } = { REGISTER_SONET_EVENT: 'N' },
  ): Promise<BitrixEntityResponse> {
    this.logger.log(`[RealBitrix] Creating Deal: ${data.TITLE}`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<number | string>(BITRIX_API_METHODS.DEAL_ADD, {
      fields: data,
      params: options,
    });
    return { id: Number(result), raw: result };
  }

  async updateDeal(id: number, data: Partial<BitrixDealPayload>): Promise<boolean> {
    this.logger.log(`[RealBitrix] Updating Deal #${id}`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<boolean>(BITRIX_API_METHODS.DEAL_UPDATE, {
      id,
      fields: data,
      params: { REGISTER_SONET_EVENT: 'N' },
    });
    return Boolean(result);
  }

  async getDeal(id: number): Promise<any | null> {
    try {
      this.logger.log(`[RealBitrix] Getting Deal #${id}`, 'BitrixRealAdapter');
      const result = await this.httpService.callMethod(BITRIX_API_METHODS.DEAL_GET, { id });
      return result || null;
    } catch (err: any) {
      if (err?.response?.status === 404 || String(err?.message).includes('not found')) {
        return null;
      }
      throw err;
    }
  }

  async findDealByOrigin(originatorId: string, originId: string): Promise<BitrixEntityResponse | null> {
    this.logger.log(`[RealBitrix] Reconciling Deal by Origin key: ${originatorId}:${originId}`, 'BitrixRealAdapter');
    try {
      const result = await this.httpService.callMethod<any[]>(BITRIX_API_METHODS.DEAL_LIST, {
        filter: { ORIGINATOR_ID: originatorId, ORIGIN_ID: originId },
        select: ['ID', 'TITLE', 'STAGE_ID', 'ORIGINATOR_ID', 'ORIGIN_ID'],
      });

      if (Array.isArray(result) && result.length > 0) {
        return { id: Number(result[0].ID), raw: result[0] };
      }
    } catch (err: any) {
      this.logger.warn(`Origin-based deal search failed: ${err.message}`, 'BitrixRealAdapter');
    }
    return null;
  }

  async findDealByTitle(title: string): Promise<BitrixEntityResponse | null> {
    this.logger.log(`[RealBitrix] Finding Deal by deterministic title: "${title}"`, 'BitrixRealAdapter');
    const result = await this.httpService.callMethod<any[]>(BITRIX_API_METHODS.DEAL_LIST, {
      filter: { TITLE: title },
      select: ['ID', 'TITLE', 'STAGE_ID'],
    });

    if (Array.isArray(result) && result.length > 0) {
      return { id: Number(result[0].ID), raw: result[0] };
    }
    return null;
  }

  async addTimelineComment(entityType: 'lead' | 'deal', entityId: number, comment: string): Promise<boolean> {
    try {
      this.logger.log(`[RealBitrix] Adding timeline comment to ${entityType} #${entityId}`, 'BitrixRealAdapter');
      const result = await this.httpService.callMethod<number | boolean>(BITRIX_API_METHODS.TIMELINE_COMMENT_ADD, {
        fields: {
          ENTITY_ID: entityId,
          ENTITY_TYPE: entityType,
          COMMENT: comment,
        },
      });
      return Boolean(result);
    } catch (err: any) {
      this.logger.warn(`Failed to add timeline comment to ${entityType} #${entityId}: ${err.message}`, 'BitrixRealAdapter');
      return false;
    }
  }

  async sendNotification(userId: number | string, message: string): Promise<boolean> {
    try {
      this.logger.log(`[RealBitrix] Sending notification to user #${userId}`, 'BitrixRealAdapter');
      const result = await this.httpService.callMethod<boolean>(BITRIX_API_METHODS.IM_NOTIFY_SYSTEM_ADD, {
        USER_ID: Number(userId),
        MESSAGE: message,
      });
      return Boolean(result);
    } catch (err: any) {
      this.logger.warn(`Failed to send notification to user #${userId}: ${err.message}`, 'BitrixRealAdapter');
      return false;
    }
  }
}
