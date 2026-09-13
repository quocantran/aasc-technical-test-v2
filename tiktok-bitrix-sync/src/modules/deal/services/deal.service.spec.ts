import { DealService } from './deal.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DealService', () => {
  let service: DealService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      deal: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    service = new DealService(mockPrisma as PrismaService);
  });

  it('should find paginated deals with metadata', async () => {
    mockPrisma.deal.count.mockResolvedValueOnce(15);
    mockPrisma.deal.findMany.mockResolvedValueOnce([
      { id: 'deal-1', title: 'Deal 1', stage: 'NEW', amount: 5000000 },
    ]);

    const res = await service.findPaginated({ page: 1, limit: 10, status: 'created' });

    expect(res.meta.total).toBe(15);
    expect(res.meta.totalPages).toBe(2);
    expect(res.data.length).toBe(1);
    expect(mockPrisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'created' }, skip: 0, take: 10 }),
    );
  });

  it('should filter deals with status "open" mapping to pending and created, and other query params', async () => {
    mockPrisma.deal.count.mockResolvedValueOnce(5);
    mockPrisma.deal.findMany.mockResolvedValueOnce([{ id: 'deal-2' }]);

    const res = await service.findPaginated({
      page: -5,
      limit: 200,
      status: 'OPEN',
      assigned_to: 'user-1',
      stage: 'PREPARATION',
      lead_id: 'lead-99',
    });

    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(100);
    expect(mockPrisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['pending', 'created'] },
          assignedTo: 'user-1',
          stage: 'PREPARATION',
          leadId: 'lead-99',
        },
        skip: 0,
        take: 100,
      }),
    );
  });

  it('should find paginated deals with default values when query is empty', async () => {
    mockPrisma.deal.count.mockResolvedValueOnce(0);
    mockPrisma.deal.findMany.mockResolvedValueOnce([]);

    const res = await service.findPaginated({});
    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(10);
    expect(res.meta.total).toBe(0);
  });

  it('should find deal by id successfully', async () => {

    const mockDeal = { id: 'deal-found', title: 'Found Deal', lead: { id: 'lead-1' } };
    mockPrisma.deal.findUnique.mockResolvedValueOnce(mockDeal);

    const result = await service.findById('deal-found');
    expect(result).toEqual(mockDeal);
  });

  it('should throw NotFoundException if deal not found by id', async () => {
    mockPrisma.deal.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('should handle P2023 error in findPaginated gracefully and return empty list', async () => {
    mockPrisma.deal.findMany.mockRejectedValueOnce({ code: 'P2023' });
    const res = await service.findPaginated({ lead_id: 'malformed-lead-id' });
    expect(res.data).toEqual([]);
    expect(res.meta.total).toBe(0);
  });

  it('should rethrow unexpected error in findPaginated', async () => {
    mockPrisma.deal.findMany.mockRejectedValueOnce(new Error('Prisma engine crashed'));
    await expect(service.findPaginated({})).rejects.toThrow('Prisma engine crashed');
  });

  it('should handle P2023 malformed UUID in findById and fallback to numeric Bitrix ID', async () => {
    mockPrisma.deal.findFirst = jest.fn().mockResolvedValueOnce({
      id: 'deal-from-bitrix',
      bitrix24Id: 5001,
      title: 'Deal from Bitrix',
    });
    mockPrisma.deal.findUnique.mockRejectedValueOnce({ code: 'P2023' });

    const result = await service.findById('5001');
    expect(result.id).toBe('deal-from-bitrix');
    expect(mockPrisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bitrix24Id: 5001 } }),
    );
  });

  it('should rethrow unexpected database error in findById', async () => {
    mockPrisma.deal.findUnique.mockRejectedValueOnce(new Error('Fatal DB Connection Error'));
    await expect(service.findById('fatal-uuid')).rejects.toThrow('Fatal DB Connection Error');
  });
});

