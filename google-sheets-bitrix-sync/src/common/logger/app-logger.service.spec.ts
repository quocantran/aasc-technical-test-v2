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

  it('should call standard log methods without throwing', () => {
    expect(() => logger.log('test message', 'TestContext')).not.toThrow();
    expect(() => logger.warn('test warn', 'TestContext')).not.toThrow();
    expect(() => logger.debug('test debug', 'TestContext')).not.toThrow();
    expect(() => logger.verbose('test verbose', 'TestContext')).not.toThrow();
    expect(() => logger.error('test error', 'trace', 'TestContext')).not.toThrow();
  });
});
