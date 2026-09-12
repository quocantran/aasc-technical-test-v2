const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Auto-load environment variables from .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const TIKTOK_SECRET = process.env.TIKTOK_SECRET_TOKEN || 'tiktok_secret_token_12345';
const CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY || '20', 10);
const TOTAL_REQUESTS = parseInt(process.env.BENCHMARK_REQUESTS || '200', 10);

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  validateStatus: () => true,
});

function generateHmac(payload, secret) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('  TIKTOK LEAD GEN -> BITRIX24 CRM: HIGH-CONCURRENCY BENCHMARK');
  console.log(`  Target:       ${BASE_URL}/webhooks/tiktok/leads`);
  console.log(`  Total Leads:  ${TOTAL_REQUESTS}`);
  console.log(`  Concurrency:  ${CONCURRENCY} parallel connections`);
  console.log('================================================================\n');

  const latencies = [];
  let successCount = 0;
  let failCount = 0;

  // Prepare payload generator
  const createPayload = (i) => {
    const id = `bench_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
    const phone = `090${(1000000 + (i % 8999999)).toString().substring(0, 7)}`;
    const email = `bench_lead_${i}_${Date.now()}@testcorp.vn`;

    return {
      event: 'lead.generate',
      event_id: id,
      timestamp: Math.floor(Date.now() / 1000),
      advertiser_id: '7123456789',
      campaign: {
        campaign_id: '1234567890123456789',
        campaign_name: 'Summer Mega Sale Campaign',
        ad_id: '9876543210987654321',
        ad_name: 'Short Form Video Ad #1',
      },
      form: {
        form_id: 'form_benchmark',
        form_name: 'Registration Form',
      },
      lead_data: {
        full_name: `Benchmark Customer #${i}`,
        email,
        phone,
        city: i % 2 === 0 ? 'Ha Noi' : 'Ho Chi Minh',
        interests: ['technology', 'ecommerce'],
        utm_source: 'tiktok',
        utm_campaign: 'summer_mega_sale',
        ttclid: `TT-BENCH-${i}`,
      },
      custom_questions: [
        { question: 'Budget range', answer: '5-10 triệu VND' },
      ],
    };
  };

  const startTime = Date.now();
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < TOTAL_REQUESTS) {
      const idx = ++currentIndex;
      if (idx > TOTAL_REQUESTS) break;

      const payload = createPayload(idx);
      const signature = generateHmac(payload, TIKTOK_SECRET);
      const reqStart = Date.now();

      try {
        const res = await client.post('/webhooks/tiktok/leads', payload, {
          headers: {
            'Content-Type': 'application/json',
            'TikTok-Signature': signature,
          },
        });

        const elapsed = Date.now() - reqStart;
        latencies.push(elapsed);

        if (res.status === 200 || res.status === 201 || res.status === 202) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }
  }

  // Launch workers
  console.log(`[+] Firing ${TOTAL_REQUESTS} requests across ${CONCURRENCY} concurrent workers...`);
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalDurationSec = (Date.now() - startTime) / 1000;
  const throughput = (TOTAL_REQUESTS / totalDurationSec).toFixed(2);

  latencies.sort((a, b) => a - b);
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = (sum / (latencies.length || 1)).toFixed(2);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log('\n================================================================');
  console.log('                     BENCHMARK RESULTS REPORT                   ');
  console.log('================================================================');
  console.log(`  Total Requests:         ${TOTAL_REQUESTS}`);
  console.log(`  Successful Ingestions:  ${successCount} (${((successCount / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`  Failed Requests:        ${failCount}`);
  console.log(`  Total Time Elapsed:     ${totalDurationSec.toFixed(2)}s`);
  console.log(`  Throughput (RPS):       ${throughput} req/sec`);
  console.log('----------------------------------------------------------------');
  console.log(`  Min Latency:            ${min} ms`);
  console.log(`  Average Latency:        ${avg} ms`);
  console.log(`  50th Percentile (p50):  ${p50} ms`);
  console.log(`  95th Percentile (p95):  ${p95} ms`);
  console.log(`  99th Percentile (p99):  ${p99} ms`);
  console.log(`  Max Latency:            ${max} ms`);
  console.log('================================================================\n');
}

runBenchmark().catch((err) => {
  console.error('\nBenchmark failed:', err);
  process.exit(1);
});
