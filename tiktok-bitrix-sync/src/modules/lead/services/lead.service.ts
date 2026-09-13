import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { normalizePhone } from '../../../common/normalizers/phone.normalizer';
import { normalizeEmail } from '../../../common/normalizers/email.normalizer';
import { LeadDeduplicationService } from './lead-deduplication.service';
import { ConfigService } from '../../config-mgmt/services/config.service';
import { LeadQueryDto } from '../dto/lead-query.dto';
import { SanitizerNormalizer } from '../../../common/normalizers/sanitizer.normalizer';
import { LeadQualityScoreService } from './lead-quality-score.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AUDIT_ACTIONS, LEAD_STATUS } from '../../../common/constants/api.constants';

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dedupService: LeadDeduplicationService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @Optional() private readonly qualityScoreService?: LeadQualityScoreService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  // Validates, sanitizes, normalizes phone/email, calculates quality score, performs deduplication, and persists lead to DB.
  // Uses distributed lock via Redis to prevent concurrency race conditions during deduplication.
  async processAndStoreLead(payload: any) {
    const cleanPayload = SanitizerNormalizer.sanitizePayload(payload);
    const eventId = cleanPayload.event_id || `gen_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const rawLeadData = cleanPayload.lead_data || {};
    const campaign = cleanPayload.campaign || {};
    const form = cleanPayload.form || {};

    // 1. Normalization
    const phoneNorm = normalizePhone(rawLeadData.phone);
    const emailNorm = normalizeEmail(rawLeadData.email);

    const normalizedPhone = phoneNorm.isValid ? phoneNorm.normalized : rawLeadData.phone;
    const normalizedEmail = emailNorm.isValid ? emailNorm.normalized : rawLeadData.email;

    // Concurrency protection: acquire lock on primary identifier with unique owner UUID
    const lockKey = normalizedEmail
      ? `lock:dedup:email:${normalizedEmail}`
      : normalizedPhone
        ? `lock:dedup:phone:${normalizedPhone}`
        : `lock:dedup:event:${eventId}`;

    const lockValue = crypto.randomUUID();
    let lockAcquired = false;
    if (this.redisService) {
      lockAcquired = await this.redisService.acquireLock(lockKey, lockValue, 5000);
      if (!lockAcquired) {
        await new Promise((r) => setTimeout(r, 150));
        lockAcquired = await this.redisService.acquireLock(lockKey, lockValue, 5000);
      }
    }

    try {
      // 2. Deduplication check
      const dedup = await this.dedupService.findDuplicate(
        normalizedEmail,
        normalizedPhone,
        eventId,
      );

    const config = await this.configService.getFieldMappings();
    const mergeStrategy = config.merge_strategy || 'OVERWRITE_EMPTY';

    let leadRecord;

    const qualityScore = this.qualityScoreService
      ? this.qualityScoreService.calculateQualityScore({
          name: rawLeadData.full_name,
          email: normalizedEmail,
          phone: normalizedPhone,
          city: rawLeadData.city,
          customQuestions: cleanPayload.custom_questions,
          interests: rawLeadData.interests,
          ttclid: rawLeadData.ttclid,
          utmSource: rawLeadData.utm_source,
        })
      : 0;

    if (dedup.isDuplicate && dedup.localLeadId) {
      // Merge with existing local lead
      const existing = await this.prisma.lead.findUnique({
        where: { id: dedup.localLeadId },
      });

      if (existing) {
        this.logger.log(
          `Merging duplicate lead with local lead ID: ${existing.id} (Strategy: ${mergeStrategy})`,
          'LeadService',
        );

        const updatedData: any = {
          qualityScore,
          syncVersion: { increment: 1 },
          updatedAt: new Date(),
        };

        if (mergeStrategy === 'ALWAYS_OVERWRITE') {
          if (rawLeadData.full_name) updatedData.name = rawLeadData.full_name;
          if (normalizedEmail) updatedData.email = normalizedEmail;
          if (normalizedPhone) updatedData.phone = normalizedPhone;
          if (rawLeadData.city) updatedData.city = rawLeadData.city;
        } else if (mergeStrategy === 'OVERWRITE_EMPTY') {
          if (!existing.name && rawLeadData.full_name) updatedData.name = rawLeadData.full_name;
          if (!existing.email && normalizedEmail) updatedData.email = normalizedEmail;
          if (!existing.phone && normalizedPhone) updatedData.phone = normalizedPhone;
          if (!existing.city && rawLeadData.city) updatedData.city = rawLeadData.city;
        }

        leadRecord = await this.prisma.lead.update({
          where: { id: existing.id },
          data: updatedData,
        });

        await this.prisma.auditLog.create({
          data: {
            leadId: leadRecord.id,
            action: AUDIT_ACTIONS.LEAD_UPDATED,
            entityType: 'LEAD',
            entityId: leadRecord.id,
            details: {
              reason: 'DUPLICATE_MERGE',
              matchedBy: dedup.matchedBy,
              mergeStrategy,
              qualityScore,
            },
          },
        });
      }
    }

    if (!leadRecord) {
      // Create new lead record
      leadRecord = await this.prisma.lead.create({
        data: {
          externalId: eventId,
          source: 'tiktok',
          name: rawLeadData.full_name || 'Anonymous Lead',
          email: normalizedEmail || null,
          phone: normalizedPhone || null,
          campaignId: campaign.campaign_id ? String(campaign.campaign_id) : null,
          campaignName: campaign.campaign_name || null,
          adId: campaign.ad_id ? String(campaign.ad_id) : null,
          adName: campaign.ad_name || null,
          formId: form.form_id || null,
          formName: form.form_name || null,
          city: rawLeadData.city || null,
          interests: rawLeadData.interests || [],
          customQuestions: cleanPayload.custom_questions || [],
          ttclid: rawLeadData.ttclid || null,
          utmSource: rawLeadData.utm_source || 'tiktok',
          utmMedium: rawLeadData.utm_medium || null,
          utmCampaign: rawLeadData.utm_campaign || campaign.campaign_name || null,
          utmContent: rawLeadData.utm_content || null,
          utmTerm: rawLeadData.utm_term || null,
          qualityScore,
          rawData: cleanPayload,
          bitrix24Id: dedup.bitrix24Id || null,
          status: LEAD_STATUS.NEW,
        },
      });

      // Update campaign metrics
      if (campaign.campaign_id) {
        await this.prisma.campaignMetric.upsert({
          where: { campaignId: String(campaign.campaign_id) },
          update: { totalLeads: { increment: 1 } },
          create: {
            campaignId: String(campaign.campaign_id),
            campaignName: campaign.campaign_name || 'TikTok Campaign',
            totalLeads: 1,
          },
        });
      }

      await this.prisma.auditLog.create({
        data: {
          leadId: leadRecord.id,
          action: AUDIT_ACTIONS.LEAD_CREATED,
          entityType: 'LEAD',
          entityId: leadRecord.id,
          details: { externalId: eventId, source: 'tiktok' },
        },
      });
    }

      return {
        lead: leadRecord,
        isDuplicate: dedup.isDuplicate,
        bitrix24Id: dedup.bitrix24Id || leadRecord.bitrix24Id,
      };
    } finally {
      if (lockAcquired && this.redisService) {
        await this.redisService.releaseLock(lockKey, lockValue);
      }
    }
  }

  async findPaginated(query: LeadQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.source) where.source = query.source;
    if (query.campaign_id) where.campaignId = query.campaign_id;
    if (query.status) where.status = query.status;
    if (query.email) {
      const cleanEmail = query.email.trim().toLowerCase();
      where.email = cleanEmail.includes('@') ? cleanEmail : { startsWith: cleanEmail };
    }
    if (query.phone) where.phone = query.phone;
    if (query.external_id) where.externalId = query.external_id;

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          deals: { select: { id: true, bitrix24Id: true, title: true, stage: true, amount: true } },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    let lead = null;
    try {
      lead = await this.prisma.lead.findUnique({
        where: { id },
        include: {
          deals: true,
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2023') {
        lead = null;
      } else {
        throw err;
      }
    }

    if (!lead && typeof this.prisma.lead.findFirst === 'function') {
      const isNumber = /^\d+$/.test(id);
      try {
        lead = await this.prisma.lead.findFirst({
          where: {
            OR: [
              { externalId: id },
              ...(isNumber ? [{ bitrix24Id: parseInt(id, 10) }] : []),
            ],
          },
          include: {
            deals: true,
            auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        });
      } catch {}
    }

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }
}
