import { BatchMigrationService } from './batch-migration.service';
import { PrismaService } from '../../../database/prisma.service';
import { Queue } from 'bullmq';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('BatchMigrationService', () => {
  let service: BatchMigrationService;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findMany: jest.fn(),
      },
      syncJob: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const mockLogger = {
      log: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as any as AppLogger;

    service = new BatchMigrationService(
      mockPrisma as PrismaService,
      mockQueue as Queue,
      mockLogger,
    );
  });

  it('should return completed if no unsynced leads match', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([]);
    mockPrisma.syncJob.create.mockResolvedValueOnce({
      id: 'sync-job-1',
      status: 'completed',
      totalItems: 0,
    });

    const result = await service.startBatchMigration({ batchSize: 50, limit: 100 });
    expect(result.status).toBe('completed');
    expect(result.totalItems).toBe(0);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should enqueue batch migration jobs for unsynced leads', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([
      { id: 'lead-1', syncVersion: 1, bitrix24Id: null },
      { id: 'lead-2', syncVersion: 1, bitrix24Id: null },
    ]);

    mockPrisma.syncJob.create.mockResolvedValueOnce({
      id: 'sync-job-2',
      status: 'in_progress',
      totalItems: 2,
    });
    mockPrisma.syncJob.update.mockResolvedValueOnce({});

    const result = await service.startBatchMigration({ batchSize: 50, limit: 100 });
    expect(result.status).toBe('in_progress');
    expect(result.enqueuedCount).toBe(2);
    expect(result.batchCount).toBe(1);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockPrisma.syncJob.update).toHaveBeenCalled();
  });

  it('should retrieve job status', async () => {
    mockPrisma.syncJob.findUnique.mockResolvedValueOnce({
      id: 'sync-job-3',
      status: 'in_progress',
      progress: 50,
    });

    const status = await service.getJobStatus('sync-job-3');
    expect(status.id).toBe('sync-job-3');
    expect(status.progress).toBe(50);
  });

  it('should throw NotFoundException for invalid jobId', async () => {
    mockPrisma.syncJob.findUnique.mockResolvedValueOnce(null);
    await expect(service.getJobStatus('non-existent')).rejects.toThrow();
  });

  it('should handle forceReSync and date range filters', async () => {
    mockPrisma.lead.findMany.mockResolvedValueOnce([]);
    mockPrisma.syncJob.create.mockResolvedValueOnce({
      id: 'sync-job-dates',
      status: 'completed',
      totalItems: 0,
    });

    const res = await service.startBatchMigration({
      batchSize: 20,
      limit: 50,
      forceReSync: true,
      dateFrom: '2026-01-01T00:00:00Z',
      dateTo: '2026-02-01T00:00:00Z',
    });

    expect(res.status).toBe('completed');
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it('should handle P2023 malformed UUID error in getJobStatus and throw NotFoundException', async () => {
    mockPrisma.syncJob.findUnique.mockRejectedValueOnce({
      code: 'P2023',
      message: 'Inconsistent column data',
    });

    await expect(service.getJobStatus('12')).rejects.toThrow('job #12 not found');
  });

  it('should rethrow unexpected database errors in getJobStatus', async () => {
    mockPrisma.syncJob.findUnique.mockRejectedValueOnce(new Error('Fatal DB Connection Lost'));

    await expect(service.getJobStatus('fatal-job')).rejects.toThrow('Fatal DB Connection Lost');
  });
});
