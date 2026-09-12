import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { BITRIX_ADAPTER, IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';

export interface DedupResult {
  isDuplicate: boolean;
  localLeadId?: string;
  bitrix24Id?: number;
  matchedBy?: 'email' | 'phone' | 'external_id';
}

@Injectable()
export class LeadDeduplicationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BITRIX_ADAPTER)
    private readonly bitrixAdapter: IBitrixCrmAdapter,
    private readonly logger: AppLogger,
  ) {}

  // Checks for duplicate leads first in local DB, then queries Bitrix24 CRM.
  async findDuplicate(
    email?: string,
    phone?: string,
    externalId?: string,
  ): Promise<DedupResult> {
    // 1. Check by external_id (exact event/form duplication)
    if (externalId) {
      const existing = await this.prisma.lead.findUnique({
        where: { externalId },
      });
      if (existing) {
        return {
          isDuplicate: true,
          localLeadId: existing.id,
          bitrix24Id: existing.bitrix24Id ?? undefined,
          matchedBy: 'external_id',
        };
      }
    }

    // 2. Check local DB by Email
    if (email && email.trim() !== '') {
      const existing = await this.prisma.lead.findFirst({
        where: { email: email.trim().toLowerCase() },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return {
          isDuplicate: true,
          localLeadId: existing.id,
          bitrix24Id: existing.bitrix24Id ?? undefined,
          matchedBy: 'email',
        };
      }
    }

    // 3. Check local DB by Phone
    if (phone && phone.trim() !== '') {
      const existing = await this.prisma.lead.findFirst({
        where: { phone: phone.trim() },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return {
          isDuplicate: true,
          localLeadId: existing.id,
          bitrix24Id: existing.bitrix24Id ?? undefined,
          matchedBy: 'phone',
        };
      }
    }

    // 4. Remote duplicate check in Bitrix24 CRM
    if (email && email.trim() !== '') {
      try {
        const remoteIds = await this.bitrixAdapter.findDuplicates('EMAIL', [email.trim().toLowerCase()]);
        if (remoteIds.length > 0) {
          this.logger.log(`Found duplicate Lead #${remoteIds[0]} in Bitrix24 by email: ${email}`, 'LeadDeduplicationService');
          return {
            isDuplicate: true,
            bitrix24Id: remoteIds[0],
            matchedBy: 'email',
          };
        }
      } catch (err: any) {
        this.logger.warn(`Bitrix duplicate check by email failed: ${err.message}`, 'LeadDeduplicationService');
      }
    }

    if (phone && phone.trim() !== '') {
      try {
        const remoteIds = await this.bitrixAdapter.findDuplicates('PHONE', [phone.trim()]);
        if (remoteIds.length > 0) {
          this.logger.log(`Found duplicate Lead #${remoteIds[0]} in Bitrix24 by phone: ${phone}`, 'LeadDeduplicationService');
          return {
            isDuplicate: true,
            bitrix24Id: remoteIds[0],
            matchedBy: 'phone',
          };
        }
      } catch (err: any) {
        this.logger.warn(`Bitrix duplicate check by phone failed: ${err.message}`, 'LeadDeduplicationService');
      }
    }

    return { isDuplicate: false };
  }
}
