import 'dotenv/config';
import axios from 'axios';
import * as crypto from 'crypto';

/**
 * TikTok Webhook Simulator CLI
 * Generates valid HMAC-SHA256 signatures and sends sample payloads to the webhook receiver.
 *
 * Usage:
 *   npx tsx scripts/simulate-tiktok-webhook.ts [event_type]
 * Examples:
 *   npx tsx scripts/simulate-tiktok-webhook.ts lead.generate
 *   npx tsx scripts/simulate-tiktok-webhook.ts form.complete
 *   npx tsx scripts/simulate-tiktok-webhook.ts user.interaction
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/webhooks/tiktok/leads`;
const SECRET = process.env.TIKTOK_SECRET_TOKEN || process.env.TIKTOK_WEBHOOK_SECRET || 'tiktok_secret_token_12345';

const eventType = process.argv[2] || 'lead.generate';
const randomSuffix = Math.floor(1000 + Math.random() * 9000);
const timestamp = Math.floor(Date.now() / 1000);

const samplePayloads: Record<string, any> = {
  'lead.generate': {
    event: 'lead.generate',
    event_id: `evt_sim_${Date.now()}_${randomSuffix}`,
    timestamp,
    advertiser_id: '7123456789',
    campaign: {
      campaign_id: '1234567890123456789',
      campaign_name: 'Spring Sale 2026 Promo',
      ad_id: '9876543210987654321',
      ad_name: 'Product Demo Video TikTok',
    },
    form: {
      form_id: 'form_abc123',
      form_name: 'Contact & Registration Form',
    },
    lead_data: {
      full_name: 'Nguyễn Văn A',
      email: `nguyenvana_${randomSuffix}@email.com`,
      phone: `090${randomSuffix}456`,
      city: 'Hà Nội',
      interests: ['technology', 'mobile apps', 'cloud crm'],
      utm_source: 'tiktok',
      utm_campaign: 'spring_sale_2026',
      ttclid: `TT-sim-${Date.now()}-xyz`,
    },
    custom_questions: [
      {
        question: 'Budget range',
        answer: '5-10 triệu VND',
      },
      {
        question: 'Timeline',
        answer: 'Trong 1 tháng',
      },
    ],
  },
  'form.complete': {
    event: 'form.complete',
    event_id: `evt_form_${Date.now()}_${randomSuffix}`,
    timestamp,
    advertiser_id: '7123456789',
    campaign: {
      campaign_id: '1234567890123456789',
      campaign_name: 'Summer Campaign Form Completion',
      ad_id: '9876543210987654321',
      ad_name: 'Form Lead Magnet Video',
    },
    form: {
      form_id: 'form_complete_001',
      form_name: 'Brochure Download Form',
    },
    lead_data: {
      full_name: 'Trần Thị Bích',
      email: `tranthib_${randomSuffix}@gmail.com`,
      phone: `+8491${randomSuffix}78`,
      city: 'Hồ Chí Minh',
      interests: ['enterprise', 'sales automation'],
      utm_source: 'tiktok',
      utm_campaign: 'summer_promo',
      ttclid: `TT-form-${Date.now()}`,
    },
    custom_questions: [
      {
        question: 'Company size',
        answer: '50-100 employees',
      },
    ],
  },
  'user.interaction': {
    event: 'user.interaction',
    event_id: `evt_user_${Date.now()}_${randomSuffix}`,
    timestamp,
    advertiser_id: '7123456789',
    campaign: {
      campaign_id: '1234567890123456789',
      campaign_name: 'Interactive Instant Form Campaign',
      ad_id: '9876543210987654321',
      ad_name: 'Survey Ad Experience',
    },
    form: {
      form_id: 'form_instant_99',
      form_name: 'Quick Consultation Form',
    },
    lead_data: {
      full_name: 'Lê Hoàng Nam',
      email: `lenam_${randomSuffix}@outlook.com`,
      phone: `098${randomSuffix}123`,
      city: 'Đà Nẵng',
      interests: ['consulting'],
      utm_source: 'tiktok',
      utm_campaign: 'instant_consulting',
      ttclid: `TT-interact-${Date.now()}`,
    },
    custom_questions: [
      {
        question: 'Preferred contact time',
        answer: 'Afternoon (2PM - 5PM)',
      },
    ],
  },
};

async function main() {
  const payload = samplePayloads[eventType] || samplePayloads['lead.generate'];
  const rawBody = JSON.stringify(payload);

  // Compute TikTok HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  console.log('====================================================');
  console.log('⚡ SIMULATING TIKTOK LEAD WEBHOOK');
  console.log('====================================================');
  console.log(`Endpoint:    ${WEBHOOK_URL}`);
  console.log(`Event Type:  ${payload.event}`);
  console.log(`Event ID:    ${payload.event_id}`);
  console.log(`Lead Name:   ${payload.lead_data.full_name}`);
  console.log(`Email:       ${payload.lead_data.email}`);
  console.log(`Phone:       ${payload.lead_data.phone}`);
  console.log(`Signature:   ${signature}`);
  console.log('----------------------------------------------------');

  const startTime = Date.now();

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'TikTok-Signature': signature,
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ [HTTP ${response.status}] Success (${elapsed}ms)`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('====================================================');
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ [HTTP ${err?.response?.status || 'ERR'}] Failed (${elapsed}ms)`);
    console.error('Error:', err?.response?.data || err.message);
    console.log('====================================================');
    process.exit(1);
  }
}

main();
