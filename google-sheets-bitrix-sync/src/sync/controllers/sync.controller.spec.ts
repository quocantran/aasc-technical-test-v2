// Unit tests for SyncController testing HTTP trigger and status inspection

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncController } from './sync.controller.js';

describe('SyncController', () => {
  let controller: SyncController;
  let mockSyncOrchestrator: any;
  let mockLockService: any;

  beforeEach(() => {
    mockSyncOrchestrator = {
      runSync: vi.fn(),
    };
    mockLockService = {
      isLocked: vi.fn(),
    };
    controller = new SyncController(mockSyncOrchestrator, mockLockService);
  });

  it('should trigger sync successfully when no lock is held', async () => {
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.runSync.mockResolvedValue({
      totalRows: 5,
      created: 3,
      updated: 2,
      skipped: 0,
      failed: 0,
      durationMs: 1500,
    });

    const response = await controller.triggerSync({ force: false });

    expect(response.status).toBe('success');
    expect(response.data?.totalRows).toBe(5);
    expect(mockSyncOrchestrator.runSync).toHaveBeenCalledWith({ force: false });
  });

  it('should return warning when lock is active and skip trigger', async () => {
    mockLockService.isLocked.mockReturnValue(true);

    const response = await controller.triggerSync();

    expect(response.status).toBe('warning');
    expect(response.isSkippedDueToLock).toBe(true);
    expect(mockSyncOrchestrator.runSync).not.toHaveBeenCalled();
  });

  it('should report running status correctly', async () => {
    mockLockService.isLocked.mockReturnValue(true);
    mockSyncOrchestrator.getLastResult = vi.fn().mockReturnValue(null);
    const status = await controller.getStatus();
    expect(status.isRunning).toBe(true);
  });

  it('should trigger reverse sync successfully', async () => {
    mockSyncOrchestrator.syncBitrixToSheets = vi.fn().mockResolvedValue({
      totalRows: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
    });

    const response = await controller.triggerReverseSync('1');

    expect(response.status).toBe('success');
    expect(response.data?.updated).toBe(1);
    expect(mockSyncOrchestrator.syncBitrixToSheets).toHaveBeenCalledWith(1);
  });
});
