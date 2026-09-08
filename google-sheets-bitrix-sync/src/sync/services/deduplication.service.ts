import { Injectable } from '@nestjs/common';
import { BitrixLeadService } from '../../bitrix/services/bitrix-lead.service.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { SYNC_STATUS_VI } from '../../common/constants/sync.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';
import { RowUpdatePayload } from '../../google-sheets/interfaces/sheet-row.interface.js';
import { formatSyncDateTime } from '../../common/utils/date.helper.js';
import { CandidateRow, IDeduplicationService } from '../interfaces/sync.interface.js';

// Handles candidate deduplication, multi-criteria communication conflict detection, and timeout recovery (SRP)
@Injectable()
export class DeduplicationService implements IDeduplicationService {
  constructor(
    private readonly bitrixLeadService: BitrixLeadService,
    private readonly logger: AppLogger,
  ) {}

  // Deduplicates candidates against Bitrix communications using batch query and handles conflicts
  async deduplicateCandidates(
    candidates: CandidateRow[],
    updates: RowUpdatePayload[],
    onConflict: () => void,
  ): Promise<void> {
    const createCandidates = candidates.filter((c) => c.action === 'CREATE');
    if (createCandidates.length === 0) return;

    const emails = createCandidates.map((c) => c.email).filter(Boolean) as string[];
    const phones = createCandidates.map((c) => c.phone).filter(Boolean) as string[];

    let emailMap: Record<string, number> = {};
    let phoneMap: Record<string, number> = {};

    if (typeof this.bitrixLeadService.findDuplicatesMap === 'function') {
      const dupRes = await this.bitrixLeadService.findDuplicatesMap(emails, phones);
      emailMap = dupRes.emailMap;
      phoneMap = dupRes.phoneMap;
    } else {
      const emailMatches = await this.bitrixLeadService.findByCommunication('EMAIL', emails);
      const phoneMatches = await this.bitrixLeadService.findByCommunication('PHONE', phones);
      for (const candidate of createCandidates) {
        if (candidate.email && emailMatches.length > 0) {
          const found = await this.bitrixLeadService.findByCommunication('EMAIL', [candidate.email]);
          if (found && found[0]) emailMap[candidate.email.toLowerCase()] = found[0];
        }
        if (candidate.phone && phoneMatches.length > 0) {
          const found = await this.bitrixLeadService.findByCommunication('PHONE', [candidate.phone]);
          if (found && found[0]) phoneMap[candidate.phone] = found[0];
        }
      }
    }

    for (const candidate of createCandidates) {
      const matchedByEmail = candidate.email ? emailMap[candidate.email.toLowerCase()] : undefined;
      const matchedByPhone = candidate.phone ? phoneMap[candidate.phone] : undefined;

      // Flags conflict when email matches lead A while phone matches lead B
      if (matchedByEmail && matchedByPhone && matchedByEmail !== matchedByPhone) {
        onConflict();
        candidate.action = 'CONFLICT';
        updates.push({
          rowIndex: candidate.sheetRow.rowIndex,
          status: SYNC_STATUS_VI.FAILED,
          errorMessage: ERROR_MESSAGES_VI.DEDUP_CONFLICT,
          lastSyncTime: formatSyncDateTime(),
        });
        continue;
      }

      const existingLeadId = matchedByEmail || matchedByPhone;
      if (existingLeadId) {
        this.logger.log(
          `Deduplication match found: Row ${candidate.sheetRow.rowIndex} linked to Lead #${existingLeadId}`,
          'DeduplicationService',
        );
        candidate.action = 'UPDATE';
        candidate.targetLeadId = existingLeadId;
      }
    }
  }

  // Verifies lead ownership using title/name match after a post-create timeout
  async attemptTimeoutRecovery(candidate: CandidateRow): Promise<number | null> {
    try {
      this.logger.warn(
        `Attempting two-phase post-create timeout recovery for row ${candidate.sheetRow.rowIndex}`,
        'DeduplicationService',
      );

      const matchedIds: number[] = [];
      if (candidate.email) {
        const res = await this.bitrixLeadService.findByCommunication('EMAIL', [candidate.email]);
        matchedIds.push(...res);
      }
      if (candidate.phone) {
        const res = await this.bitrixLeadService.findByCommunication('PHONE', [candidate.phone]);
        matchedIds.push(...res);
      }

      // Verifies title or name matches before adopting newly created lead
      for (const id of matchedIds) {
        const lead = await this.bitrixLeadService.getLead(id);
        if (lead) {
          const titleMatch = candidate.title && lead.TITLE === candidate.title;
          const nameMatch = candidate.name && lead.NAME === candidate.name;
          if (titleMatch || nameMatch) {
            this.logger.log(`Verified ownership of recovered Lead #${id}`, 'DeduplicationService');
            return id;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
