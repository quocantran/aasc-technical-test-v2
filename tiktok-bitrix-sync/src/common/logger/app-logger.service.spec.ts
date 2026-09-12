import { AppLogger } from './app-logger.service';

describe('AppLogger', () => {
  it('should format and log info, warn, error, debug and summary', () => {
    const logger = new AppLogger();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    logger.log('Test info message', 'TestContext');
    logger.warn('Test warn message', 'TestContext');
    logger.error('Test error message', 'stack', 'TestContext');
    logger.debug('Test debug message', 'TestContext');
    logger.verbose('Test trace message', 'TestContext');

    logger.printVietnameseSummary({
      totalLeads: 10,
      created: 8,
      updated: 2,
      convertedDeals: 5,
      failed: 0,
      durationMs: 2500,
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
