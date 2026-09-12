import * as crypto from 'crypto';

jest.mock('@nestjs/bullmq', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  class BullModuleMock {
    static forRootAsync() {
      return {
        module: BullModuleMock,
        providers: [],
        exports: [],
      };
    }
    static registerQueue(...queues: any[]) {
      const providers = queues.map((q: any) => ({
        provide: `BullQueue_${q.name}`,
        useValue: {
          add: async () => ({ id: 'mock-job-id' }),
          process: async () => {},
          getJobCounts: async () => ({
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
          }),
        },
      }));
      return {
        module: BullModuleMock,
        providers,
        exports: providers.map((p) => p.provide),
      };
    }
  }

  return {
    InjectQueue: (name: string) => Inject(`BullQueue_${name}`),
    Processor: () => (target: any) => target,
    WorkerHost: class {},
    getQueueToken: (name: string) => `BullQueue_${name}`,
    BullModule: BullModuleMock,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('TikTok to Bitrix24 Sync Application (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Override PrismaService with an in-memory mock for isolated E2E testing
    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ '?column?': 1 }],
      webhookEvent: {
        findUnique: async ({ where }: any) => {
          if (where?.eventId === 'evt_existing') {
            return { id: 'uuid-existing', eventId: 'evt_existing', status: 'processed' };
          }
          return null;
        },
        create: async ({ data }: any) => ({ id: 'uuid-new', ...data }),
      },
      lead: {
        findUnique: async ({ where }: any) => {
          if (where?.id === 'lead-uuid-1' || where?.externalId === 'evt_lead_1') {
            return {
              id: 'lead-uuid-1',
              externalId: 'evt_lead_1',
              name: 'Nguyen Van E2E',
              email: 'e2e@example.com',
              phone: '+84901234567',
              status: 'synced',
              createdAt: new Date(),
              deals: [{ id: 'deal-uuid-1', amount: 5000000 }],
              rawData: {},
            };
          }
          return null;
        },
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 'lead-uuid-1', ...data }),
        findMany: async () => [
          {
            id: 'lead-uuid-1',
            externalId: 'evt_lead_1',
            name: 'Nguyen Van E2E',
            email: 'e2e@example.com',
            phone: '+84901234567',
            status: 'synced',
            createdAt: new Date(),
            deals: [{ id: 'deal-uuid-1', amount: 5000000 }],
          },
        ],
        count: async () => 1,
        update: async ({ data }: any) => ({ id: 'lead-uuid-1', ...data }),
      },
      deal: {
        findFirst: async () => ({
          id: 'deal-uuid-1',
          bitrix24Id: 5001,
          status: 'created',
          stage: 'NEW',
          lead: { id: 'lead-uuid-1' },
        }),
        findUnique: async ({ where }: any) => {
          if (where?.id === 'deal-uuid-1') {
            return {
              id: 'deal-uuid-1',
              title: 'E2E Deal',
              bitrix24Id: 5001,
              status: 'created',
              stage: 'NEW',
              lead: { id: 'lead-uuid-1' },
            };
          }
          return null;
        },
        findMany: async () => [
          {
            id: 'deal-uuid-1',
            title: 'E2E Deal',
            bitrix24Id: 5001,
            status: 'created',
            stage: 'NEW',
            lead: { id: 'lead-uuid-1' },
          },
        ],
        count: async () => 1,
        create: async ({ data }: any) => ({ id: 'deal-uuid-1', ...data }),
        update: async ({ data }: any) => ({ id: 'deal-uuid-1', ...data }),
        upsert: async ({ create }: any) => ({ id: 'deal-uuid-1', ...create }),
      },
      configuration: {
        findUnique: async ({ where }: any) => {
          if (where?.key === 'FIELD_MAPPINGS') {
            return {
              key: 'FIELD_MAPPINGS',
              value: {
                full_name: 'NAME',
                email: 'EMAIL',
                phone: 'PHONE',
              },
            };
          }
          if (where?.key === 'DEAL_RULES') {
            return {
              key: 'DEAL_RULES',
              value: [{ id: 'rule-e2e', name: 'Rule 1' }],
            };
          }
          return null;
        },
        findMany: async () => [
          {
            key: 'FIELD_MAPPINGS',
            value: {
              full_name: 'NAME',
              email: 'EMAIL',
              phone: 'PHONE',
            },
          },
          {
            key: 'DEAL_RULES',
            value: [{ id: 'rule-e2e', name: 'Rule 1' }],
          },
        ],
        upsert: async ({ create, update }: any) => ({ ...(create || update) }),
      },
      campaignMetric: {
        upsert: async () => ({}),
        findMany: async () => [
          {
            campaignId: 'camp-e2e',
            campaignName: 'E2E Campaign',
            totalLeads: 10,
            syncedLeads: 8,
            convertedDeals: 4,
            wonDeals: 2,
            totalRevenue: 20000000,
            estimatedCost: 5000000,
          },
        ],
      },
      auditLog: {
        create: async () => ({}),
      },
      dlqRecord: {
        create: async () => ({}),
      },
      syncJob: {
        create: async ({ data }: any) => ({ id: 'sync-job-123', ...data }),
        findUnique: async ({ where }: any) => ({
          id: where?.id || 'sync-job-123',
          jobType: 'HISTORICAL_BATCH_MIGRATION',
          status: 'completed',
          progress: 100,
          totalItems: 1,
          processedItems: 1,
          failedItems: 0,
        }),
        update: async ({ data }: any) => ({ id: 'sync-job-123', ...data }),
      },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();


    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1', {
      exclude: ['webhooks/tiktok/leads', 'webhooks/bitrix24/deals', 'metrics'],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health should return 200 OK', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.services.database).toBe('up');
  });

  it('POST /webhooks/tiktok/leads should accept valid webhook with authentic HMAC-SHA256 signature', async () => {
    const payload = {
      event: 'lead.generate',
      event_id: 'evt_e2e_test_1',
      timestamp: 1709876543,
      lead_data: {
        full_name: 'Nguyen Van E2E',
        email: 'e2e@example.com',
        phone: '+84901234567',
        city: 'Ha Noi',
      },
    };

    const secret = process.env.TIKTOK_SECRET_TOKEN || 'tiktok_secret_token_12345';
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .set('tiktok-signature', signature)
      .send(payload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.event_id).toBe('evt_e2e_test_1');
  });

  it('POST /webhooks/tiktok/leads should reject duplicate webhook event', async () => {
    const payload = {
      event: 'lead.generate',
      event_id: 'evt_existing',
      lead_data: { full_name: 'Duplicate' },
    };

    const secret = process.env.TIKTOK_SECRET_TOKEN || 'tiktok_secret_token_12345';
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .set('tiktok-signature', signature)
      .send(payload)
      .expect(201);

    expect(res.body.data.status).toBe('ignored');
    expect(res.body.data.reason).toBe('already_exists');
  });

  it('GET /api/v1/config/mappings should require x-api-key header', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/config/mappings')
      .expect(401);
  });

  it('GET /api/v1/config/mappings should succeed with valid x-api-key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/config/mappings')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('GET /api/v1/analytics/conversion-rates should return metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/conversion-rates')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.funnel).toBeDefined();
    expect(res.body.data.rates).toBeDefined();
  });

  it('POST /webhooks/bitrix24/deals should handle deal webhook and verify secret', async () => {
    const bitrixSecret =
      process.env.BITRIX_INBOUND_WEBHOOK_SECRET ||
      process.env.BITRIX_OUTBOUND_SECRET ||
      '';

    const payload = {
      event: 'ONCRMDEALUPDATE',
      data: { FIELDS: { ID: 5001, STAGE_ID: 'WON' } },
      auth: { application_token: bitrixSecret },
    };

    const res = await request(app.getHttpServer())
      .post('/webhooks/bitrix24/deals')
      .send(payload)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.dealId).toBe(5001);
  });

  it('GET /metrics should return Prometheus formatted metrics with 200 OK', async () => {
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('nodejs_');
    expect(res.text).toContain('bullmq_queue_jobs');
  });

  // Webhook Guard Rejections
  it('POST /webhooks/tiktok/leads should reject when signature is missing', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .send({ event: 'lead.generate' })
      .expect(401);
  });

  it('POST /webhooks/tiktok/leads should reject when signature is invalid', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .set('tiktok-signature', 'invalid_signature_hex')
      .send({ event: 'lead.generate' })
      .expect(401);
  });

  it('POST /webhooks/bitrix24/deals should reject when secret token is invalid', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/bitrix24/deals')
      .send({ auth: { application_token: 'wrong_secret' } })
      .expect(401);
  });

  // Leads Endpoints
  it('GET /api/v1/leads should return paginated leads list with x-api-key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/leads?page=1&limit=10&status=synced')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.meta.total).toBe(1);
  });

  it('GET /api/v1/leads/:id should return lead when found, and 404 when not found', async () => {
    const foundRes = await request(app.getHttpServer())
      .get('/api/v1/leads/lead-uuid-1')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(foundRes.body.success).toBe(true);
    expect(foundRes.body.data.id).toBe('lead-uuid-1');

    await request(app.getHttpServer())
      .get('/api/v1/leads/non-existent-lead')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(404);
  });

  it('POST /api/v1/leads/batch-migrate should enqueue migration job and return 202 Accepted', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads/batch-migrate')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .send({ date_range: '30d', dry_run: false })
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBeDefined();
    expect(['enqueued', 'in_progress']).toContain(res.body.data.status);
  });

  it('GET /api/v1/leads/batch-migrate/:jobId should return job status details', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/leads/batch-migrate/sync-job-123')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('sync-job-123');
    expect(res.body.data.status).toBe('completed');
  });

  it('POST /api/v1/leads/:id/convert-to-deal should manually convert lead into deal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads/lead-uuid-1/convert-to-deal')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .send({
        deal_title: 'Manual VIP Deal',
        opportunity: 5000000,
        stage_id: 'NEW',
        pipeline_id: '0',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.converted).toBe(true);
  });

  // Deals Endpoints
  it('GET /api/v1/deals should return paginated deals list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/deals?page=1&limit=10')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.meta.total).toBe(1);
  });

  it('GET /api/v1/deals/:id should return deal details or 404', async () => {
    const foundRes = await request(app.getHttpServer())
      .get('/api/v1/deals/deal-uuid-1')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(foundRes.body.success).toBe(true);
    expect(foundRes.body.data.id).toBe('deal-uuid-1');

    await request(app.getHttpServer())
      .get('/api/v1/deals/non-existent-deal')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(404);
  });

  // Analytics Endpoints
  it('GET /api/v1/analytics/campaign-performance should return campaign ROI metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/campaign-performance')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data[0].campaignId).toBe('camp-e2e');
    expect(res.body.data[0].metrics.qualityScore).toBeDefined();
  });

  // Reports Endpoints
  it('GET /api/v1/reports/export should export JSON format and stream CSV format', async () => {
    const jsonRes = await request(app.getHttpServer())
      .get('/api/v1/reports/export?format=json&date_range=30d')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(jsonRes.body.success).toBe(true);
    expect(jsonRes.body.data).toBeInstanceOf(Array);

    const csvRes = await request(app.getHttpServer())
      .get('/api/v1/reports/export?format=csv&date_range=7d')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('ID,External ID,Name');
  });

  // Config Endpoints
  it('PUT /api/v1/config/mappings should update field mappings', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/config/mappings')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .send({
        field_mapping: {
          full_name: 'NAME',
          email: 'EMAIL',
          phone: 'PHONE',
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('GET /api/v1/config/rules and PUT /api/v1/config/rules should manage deal rules', async () => {
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/config/rules')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .expect(200);

    expect(getRes.body.success).toBe(true);

    const putRes = await request(app.getHttpServer())
      .put('/api/v1/config/rules')
      .set('x-api-key', 'aasc-secure-api-key-2026')
      .send({
        deal_rules: [
          {
            id: 'rule-high-value',
            name: 'VIP Lead',
            enabled: true,
            priority: 1,
            conditions: [],
            actions: { pipeline_id: '0', stage_id: 'NEW', probability: 50 },
          },
        ],
      })
      .expect(200);

    expect(putRes.body.success).toBe(true);
  });
});

