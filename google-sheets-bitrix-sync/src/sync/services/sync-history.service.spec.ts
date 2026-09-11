import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncHistoryService } from './sync-history.service.js';
import { SyncExecutionResult } from '../interfaces/sync.interface.js';
import fs from 'fs';

describe('SyncHistoryService', () => {
  let service: SyncHistoryService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      count: vi.fn(),
      find: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn().mockResolvedValue(true),
    };
    service = new SyncHistoryService();
  });

  it('should initialize with empty history in test environment', () => {
    expect(service.getRecentLogs()).toEqual([]);
    expect(service.getLastResult()).toBeNull();
  });

  it('should record execution result and retrieve it as last result without repo', () => {
    const result: SyncExecutionResult = {
      totalRows: 10,
      created: 5,
      updated: 3,
      skipped: 2,
      failed: 0,
      durationMs: 1200,
      direction: 'SHEETS_TO_BITRIX',
    };

    service.record(result);

    expect(service.getLastResult()).toEqual(result);
    expect(service.getRecentLogs()).toHaveLength(1);
    expect(service.getRecentLogs()[0]).toEqual(result);
  });

  it('should store multiple execution logs in history with latest run first', () => {
    const res1: SyncExecutionResult = {
      totalRows: 5,
      created: 2,
      updated: 3,
      skipped: 0,
      failed: 0,
      durationMs: 500,
    };
    const res2: SyncExecutionResult = {
      totalRows: 8,
      created: 4,
      updated: 4,
      skipped: 0,
      failed: 0,
      durationMs: 700,
    };

    service.record(res1);
    service.record(res2);

    expect(service.getLastResult()).toEqual(res2);
    expect(service.getRecentLogs()).toHaveLength(2);
    expect(service.getRecentLogs()[0]).toEqual(res2);
    expect(service.getRecentLogs()[1]).toEqual(res1);
  });

  it('should trim memory logs if exceeding maxMemoryLogs (100)', async () => {
    for (let i = 0; i < 105; i++) {
      await service.record({
        totalRows: i,
        created: 1,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 10,
      });
    }
    const logs = service.getRecentLogs(150);
    expect(logs.length).toBe(100);
    expect(logs[0].totalRows).toBe(104);
  });

  it('should save entity to repository when repo is provided', async () => {
    const serviceWithRepo = new SyncHistoryService(mockRepo);
    const result: SyncExecutionResult = {
      totalRows: 10,
      created: 5,
      updated: 3,
      skipped: 2,
      failed: 0,
      durationMs: 1200,
      direction: 'SHEETS_TO_BITRIX',
      syncedLeadIds: ['101', '102'],
    };

    await serviceWithRepo.record(result);

    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('should catch error when repository save fails', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB save failure'));
    const serviceWithRepo = new SyncHistoryService(mockRepo);

    await expect(
      serviceWithRepo.record({
        totalRows: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 10,
      }),
    ).resolves.not.toThrow();
  });

  it('should query history from in-memory if repo is absent', async () => {
    await service.record({ totalRows: 1, created: 1, updated: 0, skipped: 0, failed: 0, durationMs: 10 });
    const res = await service.queryHistory(10, 0);
    expect(res).toHaveLength(1);
  });

  it('should query history from repo with pagination and map entities', async () => {
    const mockEntities = [
      {
        direction: 'SHEETS_TO_BITRIX',
        totalRows: 2,
        created: 1,
        updated: 1,
        skipped: 0,
        failed: 0,
        deleted: 0,
        durationMs: 50,
        timestamp: '2026-09-11T00:00:00Z',
        syncedLeadIds: JSON.stringify(['1', '2']),
      },
      {
        direction: 'BITRIX_TO_SHEETS',
        totalRows: 1,
        created: 0,
        updated: 1,
        skipped: 0,
        failed: 0,
        deleted: 0,
        durationMs: 30,
        timestamp: '2026-09-11T00:01:00Z',
        syncedLeadIds: 'invalid json',
      },
    ];
    mockRepo.find.mockResolvedValue(mockEntities);
    const serviceWithRepo = new SyncHistoryService(mockRepo);

    const history = await serviceWithRepo.queryHistory(10, 0);
    expect(history).toHaveLength(2);
    expect(history[0].syncedLeadIds).toEqual(['1', '2']);
    expect(history[1].syncedLeadIds).toBeUndefined();
  });

  it('should restore from SQLite on initStorage if count > 0', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockRepo.count.mockResolvedValue(2);
      mockRepo.find.mockResolvedValue([
        {
          direction: 'SHEETS_TO_BITRIX',
          totalRows: 2,
          created: 2,
          updated: 0,
          skipped: 0,
          failed: 0,
          deleted: 0,
          durationMs: 100,
          timestamp: '2026-09-11T00:00:00Z',
        },
      ]);
      const serviceWithRepo = new SyncHistoryService(mockRepo);
      await serviceWithRepo.onModuleInit();

      expect(serviceWithRepo.getRecentLogs()).toHaveLength(1);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('should migrate legacy file if count is 0 and legacyJsonPath exists', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify([{ totalRows: 5, created: 2, updated: 3, skipped: 0, failed: 0, durationMs: 100 }]),
    );

    try {
      mockRepo.count.mockResolvedValue(0);
      const serviceWithRepo = new SyncHistoryService(mockRepo);
      await serviceWithRepo.onModuleInit();

      expect(mockRepo.save).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevEnv;
      vi.restoreAllMocks();
    }
  });

  it('should handle error gracefully during initStorage', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    mockRepo.count.mockRejectedValue(new Error('Connection lost'));

    try {
      const serviceWithRepo = new SyncHistoryService(mockRepo);
      await expect(serviceWithRepo.onModuleInit()).resolves.not.toThrow();
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
