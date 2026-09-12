import axios from 'axios';

/**
 * Bitrix24 Webhook Simulator CLI
 * Simulates an outbound Deal webhook event from Bitrix24 (e.g. stage changed to WON)
 *
 * Usage:
 *   npx tsx scripts/simulate-bitrix-webhook.ts [deal_id] [stage_id]
 * Examples:
 *   npx tsx scripts/simulate-bitrix-webhook.ts 5001 WON
 *   npx tsx scripts/simulate-bitrix-webhook.ts 5002 EXECUTING
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/webhooks/bitrix24/deals`;
const SECRET = process.env.BITRIX_INBOUND_WEBHOOK_SECRET || 'test-secret';

const dealId = Number(process.argv[2]) || 5001;
const stageId = process.argv[3] || 'WON';

const payload = {
  event: 'ONCRMDEALUPDATE',
  data: {
    FIELDS: {
      ID: dealId,
      STAGE_ID: stageId,
    },
  },
  ts: Math.floor(Date.now() / 1000),
  auth: {
    application_token: SECRET,
  },
};

async function main() {
  console.log('====================================================');
  console.log('⚡ SIMULATING BITRIX24 DEAL WEBHOOK');
  console.log('====================================================');
  console.log(`Endpoint:    ${WEBHOOK_URL}`);
  console.log(`Deal ID:     ${dealId}`);
  console.log(`New Stage:   ${stageId} (Is Won: ${stageId === 'WON'})`);
  console.log('----------------------------------------------------');

  const startTime = Date.now();

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
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
