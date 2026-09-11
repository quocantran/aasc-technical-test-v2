process.env.BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL || 'https://test.bitrix24.vn/rest/1/test/';
process.env.GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || 'test_sheet_id';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('Application Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL || 'https://test.bitrix24.vn/rest/1/test/';
    process.env.GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || 'test_sheet_id';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health (GET) should return 200 and health info', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'google-sheets-bitrix-sync');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('/api/sync/status (GET) should return sync state', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/sync/status')
      .expect(200);

    expect(response.body).toHaveProperty('isRunning');
    expect(response.body).toHaveProperty('lastRunTime');
    expect(response.body).toHaveProperty('lastResult');
  });

  it('/api/mapping (GET) should return field mapping configurations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/mapping')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body.data).toHaveProperty('fields');
    expect(Array.isArray(response.body.data.fields)).toBe(true);
  });

  it('/api/sync/logs (GET) should return sync logs array', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/sync/logs')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'success');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('/ (GET) should redirect to /admin', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(302)
      .expect('Location', '/admin');
  });

  it('/admin (GET) should serve the Web Management Dashboard HTML', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin')
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toContain('Quản Trị Đồng Bộ Google Sheets');
  });

  it('/api/webhook/bitrix (POST) should accept webhook payloads', async () => {
    const secret = process.env.BITRIX_INBOUND_WEBHOOK_SECRET || '';
    const payload: any = {
      event: 'ONCRMLEADUPDATE',
      data: {
        FIELDS: {
          ID: 999,
        },
      },
    };
    if (secret) {
      payload.auth = { application_token: secret };
    }

    const response = await request(app.getHttpServer())
      .post('/api/webhook/bitrix')
      .send(payload)
      .expect(201);

    expect(response.body).toHaveProperty('status', 'accepted');
    expect(response.body).toHaveProperty('leadId', 999);
  });

  it('/api/auth/google/url (GET) should return Google OAuth consent URL', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/google/url')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body.data).toHaveProperty('url');
    expect(response.body.data.url).toContain('accounts.google.com');
  });
});



