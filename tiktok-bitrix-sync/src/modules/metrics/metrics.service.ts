import { Injectable, Optional, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as client from 'prom-client';
import { QUEUE_NAMES } from '../../common/constants/queue.constants';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: client.Registry;

  // HTTP Metrics
  public readonly httpRequestsTotal: client.Counter<string>;
  public readonly httpRequestDurationSeconds: client.Histogram<string>;

  // Queue Metrics
  public readonly bullmqQueueJobs: client.Gauge<string>;

  // TikTok Webhooks
  public readonly tiktokWebhooksTotal: client.Counter<string>;

  // Bitrix API Metrics
  public readonly bitrixApiRequestsTotal: client.Counter<string>;
  public readonly bitrixRateLimiterDelaySeconds: client.Histogram<string>;

  // Deals & Business Metrics
  public readonly dealsConvertedTotal: client.Counter<string>;
  public readonly dlqJobsTotal: client.Counter<string>;

  private readonly queues: Map<string, Queue> = new Map();

  constructor(
    @Optional() @InjectQueue(QUEUE_NAMES.LEAD_PROCESSING) private readonly leadProcessingQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.BITRIX_SYNC) private readonly bitrixSyncQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.DEAL_CONVERSION) private readonly dealConversionQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.TIKTOK_EVENTS_SYNC) private readonly tiktokEventsSyncQueue?: Queue,
  ) {
    this.registry = new client.Registry();

    // Default Node.js process metrics (CPU, Memory, Event Loop, GC)
    client.collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });

    // HTTP Metrics
    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests received',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // BullMQ Queue Gauges
    this.bullmqQueueJobs = new client.Gauge({
      name: 'bullmq_queue_jobs',
      help: 'Number of jobs per BullMQ queue by status (waiting, active, delayed, failed, completed)',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    // TikTok Webhook Ingestion
    this.tiktokWebhooksTotal = new client.Counter({
      name: 'tiktok_webhooks_total',
      help: 'Total count of incoming TikTok webhooks ingested',
      labelNames: ['event_type', 'status'],
      registers: [this.registry],
    });

    // Bitrix24 CRM API & Rate Limiting
    this.bitrixApiRequestsTotal = new client.Counter({
      name: 'bitrix_api_requests_total',
      help: 'Total Bitrix24 CRM REST API calls made',
      labelNames: ['method', 'status'],
      registers: [this.registry],
    });

    this.bitrixRateLimiterDelaySeconds = new client.Histogram({
      name: 'bitrix_rate_limiter_delay_seconds',
      help: 'Throttle delay imposed by Token Bucket rate limiter in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });

    // Deal Conversions
    this.dealsConvertedTotal = new client.Counter({
      name: 'deals_converted_total',
      help: 'Total deals converted via Rule Engine',
      labelNames: ['rule_id', 'stage'],
      registers: [this.registry],
    });

    // Dead Letter Queue
    this.dlqJobsTotal = new client.Counter({
      name: 'bullmq_dlq_jobs_total',
      help: 'Total jobs routed to Dead Letter Queue (DLQ) upon exhaustion of retries',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    if (this.leadProcessingQueue) {
      this.queues.set(QUEUE_NAMES.LEAD_PROCESSING, this.leadProcessingQueue);
    }
    if (this.bitrixSyncQueue) {
      this.queues.set(QUEUE_NAMES.BITRIX_SYNC, this.bitrixSyncQueue);
    }
    if (this.dealConversionQueue) {
      this.queues.set(QUEUE_NAMES.DEAL_CONVERSION, this.dealConversionQueue);
    }
    if (this.tiktokEventsSyncQueue) {
      this.queues.set(QUEUE_NAMES.TIKTOK_EVENTS_SYNC, this.tiktokEventsSyncQueue);
    }
  }

  /**
   * Samples live BullMQ queues and updates gauges.
   */
  async updateQueueMetrics(): Promise<void> {
    for (const [name, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
        this.bullmqQueueJobs.set({ queue: name, status: 'waiting' }, counts.waiting);
        this.bullmqQueueJobs.set({ queue: name, status: 'active' }, counts.active);
        this.bullmqQueueJobs.set({ queue: name, status: 'delayed' }, counts.delayed);
        this.bullmqQueueJobs.set({ queue: name, status: 'failed' }, counts.failed);
        this.bullmqQueueJobs.set({ queue: name, status: 'completed' }, counts.completed);
      } catch {
        // Suppress queue inspection errors if Redis connection is temporarily disconnected
      }
    }
  }

  /**
   * Returns Prometheus scrape output in text/plain format.
   */
  async getMetrics(): Promise<string> {
    await this.updateQueueMetrics();
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  getRegistry(): client.Registry {
    return this.registry;
  }
}
