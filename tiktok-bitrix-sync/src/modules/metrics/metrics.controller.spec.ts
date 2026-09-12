import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Response } from 'express';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetricsService: any;

  beforeEach(() => {
    mockMetricsService = {
      getContentType: jest.fn().mockReturnValue('text/plain; version=0.0.4; charset=utf-8'),
      getMetrics: jest.fn().mockResolvedValue('# HELP test metric\ntest_metric 1\n'),
    };
    controller = new MetricsController(mockMetricsService as MetricsService);
  });

  it('should set Content-Type header and send prometheus metrics', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any as Response;

    await controller.getMetrics(mockRes);

    expect(mockMetricsService.getContentType).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );
    expect(mockRes.send).toHaveBeenCalledWith('# HELP test metric\ntest_metric 1\n');
  });
});
