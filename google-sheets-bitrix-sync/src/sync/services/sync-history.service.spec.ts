import { describe, it, expect, beforeEach } from 'vitest';
import { SyncHistoryService } from './sync-history.service.js';
import { SyncExecutionResult } from '../interfaces/sync.interface.js';

describe('SyncHistoryService', () => {
  let service: SyncHistoryService;

  beforeEach(() => {
    service = new SyncHistoryService();
  });

  it('should initialize with empty history in test environment', () => {
    expect(service.getRecentLogs()).toEqual([]);
    expect(service.getLastResult()).toBeNull();
  });

  it('should record execution result and retrieve it as last result', () => {
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

  it('should replace previous result with latest run', () => {
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
    expect(service.getRecentLogs()).toHaveLength(1);
  });
});
