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

  it('should cover transport configuration branches for development and production modes', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origPretty = process.env.PRETTY_LOGS;

    try {
      // 1. Development mode with pretty logs
      process.env.NODE_ENV = 'development';
      process.env.PRETTY_LOGS = 'true';
      const devLogger = new AppLogger();
      expect(devLogger).toBeDefined();

      // 2. Development mode with PRETTY_LOGS = false
      process.env.PRETTY_LOGS = 'false';
      const noPrettyLogger = new AppLogger();
      expect(noPrettyLogger).toBeDefined();

      // 3. Production mode
      process.env.NODE_ENV = 'production';
      process.env.PRETTY_LOGS = 'true';
      const prodLogger = new AppLogger();
      expect(prodLogger).toBeDefined();
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.PRETTY_LOGS = origPretty;
    }
  });
});
