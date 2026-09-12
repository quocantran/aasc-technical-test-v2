import { LeadDeduplicationService } from './lead-deduplication.service';
import { PrismaService } from '../../../database/prisma.service';
import { IBitrixCrmAdapter } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('LeadDeduplicationService', () => {
  let service: LeadDeduplicationService;
  let mockPrisma: any;
  let mockBitrixAdapter: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockBitrixAdapter = {
      findDuplicates: jest.fn(),
    };

    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    service = new LeadDeduplicationService(
      mockPrisma as PrismaService,
      mockBitrixAdapter as IBitrixCrmAdapter,
      mockLogger,
    );
  });

  it('should detect duplicate by external_id in local database', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce({
      id: 'lead-uuid-1',
      externalId: 'evt_123',
      bitrix24Id: 101,
    });

    const res = await service.findDuplicate('a@b.com', '+84901234567', 'evt_123');
    expect(res.isDuplicate).toBe(true);
    expect(res.localLeadId).toBe('lead-uuid-1');
    expect(res.bitrix24Id).toBe(101);
    expect(res.matchedBy).toBe('external_id');
  });

  it('should detect duplicate by email in local database', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValueOnce({
      id: 'lead-uuid-2',
      email: 'nguyenvana@email.com',
      bitrix24Id: 102,
    });

    const res = await service.findDuplicate('nguyenvana@email.com');
    expect(res.isDuplicate).toBe(true);
    expect(res.localLeadId).toBe('lead-uuid-2');
    expect(res.matchedBy).toBe('email');
  });

  it('should query Bitrix CRM if not found locally', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValueOnce(null); // by email
    mockPrisma.lead.findFirst.mockResolvedValueOnce(null); // by phone

    mockBitrixAdapter.findDuplicates.mockResolvedValueOnce([555]); // Bitrix lead #555

    const res = await service.findDuplicate('newuser@email.com', '+84901234567');
    expect(res.isDuplicate).toBe(true);
    expect(res.bitrix24Id).toBe(555);
    expect(res.matchedBy).toBe('email');
  });

  it('should return false if no duplicates exist locally or in Bitrix', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockBitrixAdapter.findDuplicates.mockResolvedValue([]);

    const res = await service.findDuplicate('unique@domain.com', '+84909999999');
    expect(res.isDuplicate).toBe(false);
  });

  it('should detect duplicate by phone in local database with null bitrix24Id', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValueOnce(null); // email not matched
    mockPrisma.lead.findFirst.mockResolvedValueOnce({
      id: 'lead-uuid-phone',
      phone: '+84901234567',
      bitrix24Id: null,
    });

    const res = await service.findDuplicate('test@test.com', '+84901234567');
    expect(res.isDuplicate).toBe(true);
    expect(res.localLeadId).toBe('lead-uuid-phone');
    expect(res.bitrix24Id).toBeUndefined();
    expect(res.matchedBy).toBe('phone');
  });

  it('should detect duplicate by phone in Bitrix CRM when email check returns empty', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValue(null);

    mockBitrixAdapter.findDuplicates.mockResolvedValueOnce([]); // email check empty
    mockBitrixAdapter.findDuplicates.mockResolvedValueOnce([888]); // phone check found

    const res = await service.findDuplicate('test@test.com', '+84901234567');
    expect(res.isDuplicate).toBe(true);
    expect(res.bitrix24Id).toBe(888);
    expect(res.matchedBy).toBe('phone');
  });

  it('should handle Bitrix adapter error gracefully and continue', async () => {
    mockPrisma.lead.findUnique.mockResolvedValueOnce(null);
    mockPrisma.lead.findFirst.mockResolvedValue(null);

    mockBitrixAdapter.findDuplicates.mockRejectedValueOnce(new Error('Bitrix email timeout'));
    mockBitrixAdapter.findDuplicates.mockRejectedValueOnce(new Error('Bitrix phone timeout'));

    const res = await service.findDuplicate('test@test.com', '+84901234567');
    expect(res.isDuplicate).toBe(false);
  });

  it('should return isDuplicate false when no parameters are provided', async () => {
    const res = await service.findDuplicate();
    expect(res.isDuplicate).toBe(false);
  });
});
