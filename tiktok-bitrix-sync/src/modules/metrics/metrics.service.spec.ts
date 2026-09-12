import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { QUEUE_NAMES } from '../../common/constants/queue.constants';

describe('MetricsService & MetricsController', () => {
  let service: MetricsService;
  let controller: MetricsController;

  const mockQueue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 5,
      active: 2,
      delayed: 1,
      failed: 0,
      completed: 20,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        {
          provide: `BullQueue_${QUEUE_NAMES.LEAD_PROCESSING}`,
          useValue: mockQueue,
        },
        {
          provide: `BullQueue_${QUEUE_NAMES.BITRIX_SYNC}`,
          useValue: mockQueue,
        },
        {
          provide: `BullQueue_${QUEUE_NAMES.DEAL_CONVERSION}`,
          useValue: mockQueue,
        },
        {
          provide: `BullQueue_${QUEUE_NAMES.TIKTOK_EVENTS_SYNC}`,
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    controller = module.get<MetricsController>(MetricsController);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  it('should register and return Prometheus metrics output', async () => {
    const metricsOutput = await service.getMetrics();
    expect(typeof metricsOutput).toBe('string');
    expect(metricsOutput).toContain('nodejs_');
    expect(metricsOutput).toContain('bullmq_queue_jobs');
  });

  it('should return valid Prometheus Content-Type', () => {
    const contentType = service.getContentType();
    expect(contentType).toContain('text/plain');
  });

  it('should increment httpRequestsTotal and record httpRequestDurationSeconds', async () => {
    service.httpRequestsTotal.inc({ method: 'GET', route: '/api/v1/health', status_code: '200' });
    service.httpRequestDurationSeconds.observe({ method: 'GET', route: '/api/v1/health', status_code: '200' }, 0.045);

    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain('http_requests_total');
    expect(metricsOutput).toContain('http_request_duration_seconds');
  });

  it('should record business metrics: webhooks, bitrix api, deals, and dlq', async () => {
    service.tiktokWebhooksTotal.inc({ event_type: 'lead.generate', status: 'accepted' });
    service.bitrixApiRequestsTotal.inc({ method: 'crm.lead.add', status: 'success' });
    service.bitrixRateLimiterDelaySeconds.observe(0.12);
    service.dealsConvertedTotal.inc({ rule_id: 'rule_1', stage: 'NEW' });
    service.dlqJobsTotal.inc({ queue: 'bitrix-sync' });

    const metricsOutput = await service.getMetrics();
    expect(metricsOutput).toContain('tiktok_webhooks_total');
    expect(metricsOutput).toContain('bitrix_api_requests_total');
    expect(metricsOutput).toContain('bitrix_rate_limiter_delay_seconds');
    expect(metricsOutput).toContain('deals_converted_total');
    expect(metricsOutput).toContain('bullmq_dlq_jobs_total');
  });

  it('should handle queue inspection failures gracefully without throwing', async () => {
    const failingQueue = {
      getJobCounts: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
    };

    const failingService = new MetricsService(failingQueue as any);
    failingService.onModuleInit();

    await expect(failingService.updateQueueMetrics()).resolves.not.toThrow();
  });

  it('should stream metrics via controller endpoint', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.getMetrics(mockRes as any);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
    expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('bullmq_queue_jobs'));
  });
});
