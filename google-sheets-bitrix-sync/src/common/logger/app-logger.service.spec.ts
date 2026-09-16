// Tests for AppLogger logging methods and Vietnamese execution summary formatter
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppLogger, SyncSummaryData } from './app-logger.service.js';

describe('AppLogger', () => {
  let logger: AppLogger;

  beforeEach(() => {
    logger = new AppLogger();
  });

  it('should format and print Vietnamese summary without errors', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const summary: SyncSummaryData = {
      totalRows: 10,
      created: 5,
      updated: 3,
      skipped: 1,
      failed: 1,
      durationMs: 3420,
    };

    logger.printVietnameseSummary(summary);

    expect(consoleSpy).toHaveBeenCalled();
    const loggedText = consoleSpy.mock.calls[0][0];
    expect(loggedText).toContain('KẾT QUẢ ĐỒNG BỘ GOOGLE SHEETS -> BITRIX24');
    expect(loggedText).toContain('Tổng số bản ghi đọc được    : 10');
    expect(loggedText).toContain('Bản ghi tạo mới thành công  : 5');
    expect(loggedText).toContain('3.42s');

    consoleSpy.mockRestore();
  });

  it('should format and print Vietnamese summary for reverse direction with deleted count', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const reverseSummary: SyncSummaryData = {
      totalRows: 15,
      created: 2,
      updated: 5,
      skipped: 6,
      failed: 2,
      deleted: 3,
      durationMs: 4500,
      direction: 'BITRIX_TO_SHEETS',
    };

    logger.printVietnameseSummary(reverseSummary);

    expect(consoleSpy).toHaveBeenCalled();
    const loggedText = consoleSpy.mock.calls[0][0];
    expect(loggedText).toContain('KẾT QUẢ ĐỒNG BỘ BITRIX24 -> GOOGLE SHEETS');
    expect(loggedText).toContain('Tổng số bản ghi trên CRM    : 15');
    expect(loggedText).toContain('Bản ghi xóa trên Sheet      : 3');

    consoleSpy.mockRestore();
  });

  it('should call standard log methods without throwing', () => {
    expect(() => logger.log('test message', 'TestContext')).not.toThrow();
    expect(() => logger.warn('test warn', 'TestContext')).not.toThrow();
    expect(() => logger.debug('test debug', 'TestContext')).not.toThrow();
    expect(() => logger.verbose('test verbose', 'TestContext')).not.toThrow();
    expect(() => logger.error('test error', 'trace', 'TestContext')).not.toThrow();
  });

  it('should initialize correctly when NODE_ENV is production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prodLogger = new AppLogger();
    expect(prodLogger).toBeDefined();
    expect(() => prodLogger.log('production log message')).not.toThrow();
    process.env.NODE_ENV = originalEnv;
  });
});
