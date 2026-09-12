import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Injectable()
export class ConfigService {
  private readonly localFallbackCache = new Map<string, { value: any; expiresAt: number }>();
  private readonly TTL_SECONDS = 60; // 60 seconds distributed cache

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async getConfiguration<T = any>(key: string, defaultValue?: T): Promise<T> {
    const cacheKey = `config:${key}`;
    if (this.redisService) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as T;
        } catch {}
      }
    } else {
      const local = this.localFallbackCache.get(key);
      if (local && local.expiresAt > Date.now()) {
        return local.value;
      }
    }

    const record = await this.prisma.configuration.findUnique({
      where: { key },
    });

    if (!record) {
      return defaultValue as T;
    }

    if (this.redisService) {
      await this.redisService.set(cacheKey, JSON.stringify(record.value), this.TTL_SECONDS);
    } else {
      this.localFallbackCache.set(key, { value: record.value, expiresAt: Date.now() + this.TTL_SECONDS * 1000 });
    }
    return record.value as T;
  }

  async setConfiguration(key: string, value: any): Promise<any> {
    this.logger.log(`Updating configuration [${key}]`, 'ConfigService');
    const record = await this.prisma.configuration.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    // Invalidate / update distributed cache immediately
    if (this.redisService) {
      const cacheKey = `config:${key}`;
      await this.redisService.set(cacheKey, JSON.stringify(value), this.TTL_SECONDS);
    } else {
      this.localFallbackCache.set(key, { value, expiresAt: Date.now() + this.TTL_SECONDS * 1000 });
    }
    return record.value;
  }

  async getFieldMappings() {
    return this.getConfiguration('field_mapping', {
      field_mapping: {
        'lead_data.full_name': 'NAME',
        'lead_data.email': 'EMAIL[0][VALUE]',
        'lead_data.phone': 'PHONE[0][VALUE]',
        'lead_data.city': 'UF_CRM_CITY',
        'campaign.campaign_name': 'UF_CRM_UTM_CAMPAIGN',
        'campaign.ad_name': 'UF_CRM_AD_NAME',
        'lead_data.ttclid': 'UF_CRM_TTCLID',
      },
      merge_strategy: 'OVERWRITE_EMPTY',
    });
  }

  async updateFieldMappings(payload: any) {
    return this.setConfiguration('field_mapping', payload);
  }

  async getDealRules(): Promise<any[]> {
    const res = await this.getConfiguration<any>('deal_rules', []);
    return Array.isArray(res) ? res : res?.deal_rules || [];
  }

  async updateDealRules(dealRules: any[]) {
    return this.setConfiguration('deal_rules', dealRules);
  }
}
