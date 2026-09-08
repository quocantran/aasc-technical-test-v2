import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeduplicationService } from './deduplication.service.js';
import { CandidateRow } from '../interfaces/sync.interface.js';
import { SYNC_STATUS_VI } from '../../common/constants/sync.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let mockBitrixLeadService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockBitrixLeadService = {
      findDuplicatesMap: vi.fn(),
      findByCommunication: vi.fn(),
      getLead: vi.fn(),
    };
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    service = new DeduplicationService(mockBitrixLeadService, mockLogger);
  });

  it('should link candidate to existing lead when duplicate is found by email', async () => {
    mockBitrixLeadService.findDuplicatesMap.mockResolvedValue({
      emailMap: { 'test@example.com': 123 },
      phoneMap: {},
    });

    const candidate: CandidateRow = {
      sheetRow: { rowIndex: 2, data: {}, rawValues: [], systemFields: {} as any },
      canonicalData: {},
      bitrixFields: {},
      newHash: 'h1',
      email: 'test@example.com',
      action: 'CREATE',
    };

    const updates: any[] = [];
    const onConflict = vi.fn();

    await service.deduplicateCandidates([candidate], updates, onConflict);

    expect(candidate.action).toBe('UPDATE');
    expect(candidate.targetLeadId).toBe(123);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('should detect conflict when email matches Lead A but phone matches Lead B', async () => {
    mockBitrixLeadService.findDuplicatesMap.mockResolvedValue({
      emailMap: { 'conflict@example.com': 100 },
      phoneMap: { '+84901234567': 200 },
    });

    const candidate: CandidateRow = {
      sheetRow: { rowIndex: 3, data: {}, rawValues: [], systemFields: {} as any },
      canonicalData: {},
      bitrixFields: {},
      newHash: 'h2',
      email: 'conflict@example.com',
      phone: '+84901234567',
      action: 'CREATE',
    };

    const updates: any[] = [];
    const onConflict = vi.fn();

    await service.deduplicateCandidates([candidate], updates, onConflict);

    expect(candidate.action).toBe('CONFLICT');
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe(SYNC_STATUS_VI.FAILED);
    expect(updates[0].errorMessage).toBe(ERROR_MESSAGES_VI.DEDUP_CONFLICT);
  });

  it('should recover timed-out lead if ownership is verified by title or name', async () => {
    mockBitrixLeadService.findByCommunication.mockResolvedValue([555]);
    mockBitrixLeadService.getLead.mockResolvedValue({
      ID: 555,
      TITLE: 'VIP Customer',
      NAME: 'Nguyen Van A',
    });

    const candidate: CandidateRow = {
      sheetRow: { rowIndex: 4, data: {}, rawValues: [], systemFields: {} as any },
      canonicalData: {},
      bitrixFields: {},
      newHash: 'h3',
      email: 'vip@example.com',
      title: 'VIP Customer',
      action: 'CREATE',
    };

    const recoveredId = await service.attemptTimeoutRecovery(candidate);

    expect(recoveredId).toBe(555);
  });
});
