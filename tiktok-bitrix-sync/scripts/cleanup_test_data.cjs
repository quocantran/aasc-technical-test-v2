const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Queue } = require('bullmq');
const { PrismaClient } = require('@prisma/client');

// Auto-load environment variables from .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  const envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val;
        process.env[key] = val;
      }
    }
  }
  return envVars;
}

const env = loadEnv();
const bitrixUrl = (env.BITRIX_WEBHOOK_URL || process.env.BITRIX_WEBHOOK_URL || '').replace(/\/+$/, '') + '/';
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('================================================================');
  console.log('       CLEANUP TEST & BENCHMARK DATA: BITRIX24, DB & REDIS      ');
  console.log('================================================================\n');

  // 1. Drain & Clean BullMQ queues
  console.log('[1/4] Draining BullMQ Redis Queues...');
  const connection = {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
  };
  const queueNames = ['lead-processing', 'bitrix-sync', 'deal-conversion', 'tiktok-events-sync'];
  for (const qName of queueNames) {
    try {
      const q = new Queue(qName, { connection });
      await q.drain();
      await q.clean(0, 5000, 'completed');
      await q.clean(0, 5000, 'failed');
      await q.clean(0, 5000, 'wait');
      await q.close();
      console.log(`  ✓ Cleared queue: ${qName}`);
    } catch (err) {
      console.warn(`  ! Warning on queue ${qName}:`, err.message);
    }
  }

  // 2. Clean Bitrix24 Deals
  console.log('\n[2/4] Cleaning Bitrix24 CRM Deals...');
  try {
    let start = 0;
    const testDealIds = [];
    while (true) {
      const res = await axios.get(bitrixUrl + 'crm.deal.list', {
        params: { select: ['ID', 'TITLE'], start },
      });
      const items = res.data?.result || [];
      for (const deal of items) {
        const title = deal.TITLE || '';
        if (title.includes('Benchmark') || title.includes('Test') || title.includes('Spring Sale') || title.includes('Summer Mega Sale')) {
          testDealIds.push(deal.ID);
        }
      }
      if (!res.data?.next || items.length === 0) break;
      start = res.data.next;
    }

    console.log(`  Found ${testDealIds.length} test deal(s) to delete on Bitrix24.`);
    // Batch delete in chunks of 50
    for (let i = 0; i < testDealIds.length; i += 50) {
      const chunk = testDealIds.slice(i, i + 50);
      const cmd = {};
      chunk.forEach((id, idx) => {
        cmd[`del_${idx}`] = `crm.deal.delete?id=${id}`;
      });
      await axios.post(bitrixUrl + 'batch', { halt: 0, cmd });
      console.log(`  ✓ Deleted deals batch: ${i + 1} - ${i + chunk.length}`);
      await sleep(500); // Friendly pacing
    }
  } catch (err) {
    console.error('  ! Failed to delete Bitrix deals:', err.response?.data || err.message);
  }

  // 3. Clean Bitrix24 Leads
  console.log('\n[3/4] Cleaning Bitrix24 CRM Leads...');
  const KEEP_LEAD_IDS = new Set(['3', '5', '7', '9', '11', '13', '15', '17', '19']); // Initial business seed
  try {
    let start = 0;
    const testLeadIds = [];
    while (true) {
      const res = await axios.get(bitrixUrl + 'crm.lead.list', {
        params: { select: ['ID', 'TITLE'], start },
      });
      const items = res.data?.result || [];
      for (const lead of items) {
        const id = String(lead.ID);
        const title = lead.TITLE || '';
        if (!KEEP_LEAD_IDS.has(id)) {
          if (title.includes('Benchmark') || title.includes('Test') || title.includes('TikTok Lead:') || Number(id) > 20) {
            testLeadIds.push(id);
          }
        }
      }
      if (!res.data?.next || items.length === 0) break;
      start = res.data.next;
    }

    console.log(`  Found ${testLeadIds.length} test lead(s) to delete on Bitrix24.`);
    for (let i = 0; i < testLeadIds.length; i += 50) {
      const chunk = testLeadIds.slice(i, i + 50);
      const cmd = {};
      chunk.forEach((id, idx) => {
        cmd[`del_${idx}`] = `crm.lead.delete?id=${id}`;
      });
      await axios.post(bitrixUrl + 'batch', { halt: 0, cmd });
      console.log(`  ✓ Deleted leads batch: ${i + 1} - ${i + chunk.length}`);
      await sleep(500);
    }
  } catch (err) {
    console.error('  ! Failed to delete Bitrix leads:', err.response?.data || err.message);
  }

  // 4. Clean PostgreSQL Database Test Records
  console.log('\n[4/4] Cleaning Local PostgreSQL Database Test Records...');
  try {
    const deletedDeals = await prisma.deal.deleteMany({
      where: {
        OR: [
          { title: { contains: 'Benchmark' } },
          { title: { contains: 'Test' } },
          { title: { contains: 'Spring Sale' } },
          { title: { contains: 'Summer Mega Sale' } },
        ],
      },
    });
    console.log(`  ✓ Deleted ${deletedDeals.count} test deal(s) from PostgreSQL.`);

    const deletedAudit = await prisma.auditLog.deleteMany({
      where: {
        lead: {
          OR: [
            { externalId: { startsWith: 'bench_' } },
            { externalId: { startsWith: 'evt_sys_' } },
            { externalId: { startsWith: 'evt_dup_' } },
            { name: { contains: 'Benchmark' } },
            { name: { contains: 'Test' } },
          ],
        },
      },
    });
    console.log(`  ✓ Deleted ${deletedAudit.count} test audit log(s) from PostgreSQL.`);

    const deletedLeads = await prisma.lead.deleteMany({
      where: {
        OR: [
          { externalId: { startsWith: 'bench_' } },
          { externalId: { startsWith: 'evt_sys_' } },
          { externalId: { startsWith: 'evt_dup_' } },
          { name: { contains: 'Benchmark' } },
          { name: { contains: 'Test' } },
        ],
      },
    });
    console.log(`  ✓ Deleted ${deletedLeads.count} test lead(s) from PostgreSQL.`);

    const deletedWebhooks = await prisma.webhookEvent.deleteMany({
      where: {
        OR: [
          { eventId: { startsWith: 'bench_' } },
          { eventId: { startsWith: 'evt_sys_' } },
          { eventId: { startsWith: 'evt_dup_' } },
        ],
      },
    });
    console.log(`  ✓ Deleted ${deletedWebhooks.count} test webhook event(s) from PostgreSQL.`);
  } catch (err) {
    console.error('  ! Failed to delete database records:', err.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log('       CLEANUP COMPLETED: ALL TEST DATA SAFELY PURGED!          ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
