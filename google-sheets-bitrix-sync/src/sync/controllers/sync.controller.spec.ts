import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncController } from './sync.controller.js';
import { HttpException } from '@nestjs/common';

describe('SyncController', () => {
  let controller: SyncController;
  let mockSyncOrchestrator: any;
  let mockLockService: any;
  let mockGoogleSheetsService: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSyncOrchestrator = {
      runSync: vi.fn(),
      syncBitrixToSheets: vi.fn(),
      getLastResult: vi.fn(),
    };
    mockLockService = {
      isLocked: vi.fn(),
    };
    mockGoogleSheetsService = {
      getRowCount: vi.fn(),
    };
    controller = new SyncController(mockSyncOrchestrator, mockLockService, mockGoogleSheetsService);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should throw HttpException if runSync throws an error', async () => {
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.runSync.mockRejectedValue(new Error('Sync failed'));

    await expect(controller.triggerSync()).rejects.toThrow(HttpException);
  });

  it('should return warning when lock is active and skip trigger', async () => {
    mockLockService.isLocked.mockReturnValue(true);

    const promise = controller.triggerSync();
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe('warning');
    expect(response.isSkippedDueToLock).toBe(true);
    expect(mockSyncOrchestrator.runSync).not.toHaveBeenCalled();
  });

  it('should trigger reverse sync successfully with leadId', async () => {
    mockLockService.isLocked.mockReturnValue(false);
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

  it('should trigger reverse sync without leadId', async () => {
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.syncBitrixToSheets = vi.fn().mockResolvedValue({
      totalRows: 10,
      updated: 2,
    });

    const response = await controller.triggerReverseSync();

    expect(response.status).toBe('success');
    expect(mockSyncOrchestrator.syncBitrixToSheets).toHaveBeenCalledWith(undefined);
  });

  it('should return warning on reverse sync when lock is active', async () => {
    mockLockService.isLocked.mockReturnValue(true);

    const promise = controller.triggerReverseSync();
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe('warning');
    expect(response.isSkippedDueToLock).toBe(true);
  });

  it('should report running status and update totalRows from sheetsService', async () => {
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.getLastResult.mockReturnValue({ totalRows: 5, timestamp: '2026-09-11' });
    mockGoogleSheetsService.getRowCount.mockResolvedValue(10);

    const status = await controller.getStatus();
    expect(status.isRunning).toBe(false);
    expect(status.currentTotalRows).toBe(10);
  });

  it('should fallback to default error message if error has no message', async () => {
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.runSync.mockRejectedValue({});

    await expect(controller.triggerSync()).rejects.toThrow('Lỗi trong quá trình đồng bộ');
  });

  it('should handle getStatus when googleSheetsService is undefined', async () => {
    const controllerWithoutSheets = new SyncController(mockSyncOrchestrator, mockLockService);
    mockLockService.isLocked.mockReturnValue(false);
    mockSyncOrchestrator.getLastResult.mockReturnValue(null);

    const status = await controllerWithoutSheets.getStatus();
    expect(status.isRunning).toBe(false);
    expect(status.lastRunTime).toBeNull();
    expect(status.lastResult).toBeNull();
    expect(status.currentTotalRows).toBe(0);
  });

  it('should fallback to lastResult totalRows if sheetsService throws error', async () => {
    mockLockService.isLocked.mockReturnValue(true);
    mockSyncOrchestrator.getLastResult.mockReturnValue({ totalRows: 7, timestamp: '2026-09-11' });
    mockGoogleSheetsService.getRowCount.mockRejectedValue(new Error('Sheet API error'));

    const status = await controller.getStatus();
    expect(status.currentTotalRows).toBe(7);
  });
});
