const { Queue } = require('bullmq');
const fs = require('fs');
const path = require('path');

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
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const QUEUE_NAMES = [
  'lead-processing',
  'bitrix-sync',
  'deal-conversion',
  'tiktok-events-sync',
];

async function checkQueues() {
  console.log('====================================================');
  console.log('            BULLMQ QUEUE STATUS REPORT             ');
  console.log('====================================================');

  let totalActive = 0;
  let totalWaiting = 0;
  let totalDelayed = 0;
  let totalFailed = 0;
  let totalCompleted = 0;

  for (const qName of QUEUE_NAMES) {
    const queue = new Queue(qName, { connection });
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed', 'paused');
    console.log(`Queue [${qName.padEnd(19)}]:`);
    console.log(`  - Active (đang chạy)  : ${counts.active}`);
    console.log(`  - Waiting (đang đợi)  : ${counts.waiting}`);
    console.log(`  - Delayed (hoãn lại)  : ${counts.delayed}`);
    console.log(`  - Failed (thất bại)   : ${counts.failed}`);
    console.log(`  - Completed (đã xong) : ${counts.completed}`);
    console.log(`  - Paused (tạm dừng)   : ${counts.paused}`);

    totalActive += counts.active;
    totalWaiting += counts.waiting;
    totalDelayed += counts.delayed;
    totalFailed += counts.failed;
    totalCompleted += counts.completed;

    if (counts.active > 0 || counts.waiting > 0 || counts.delayed > 0) {
      const jobs = await queue.getJobs(['active', 'waiting', 'delayed'], 0, 5);
      for (const j of jobs) {
        console.log(`    * Job #${j.id} [${j.name}]: state=${await j.getState()}, attempts=${j.attemptsMade}`);
      }
    }

    await queue.close();
  }

  console.log('----------------------------------------------------');
  console.log(`TỔNG SỐ MSG ĐANG CHẠY / ĐỢI (Pending): ${totalActive + totalWaiting + totalDelayed}`);
  console.log(`  - Active : ${totalActive}`);
  console.log(`  - Waiting: ${totalWaiting}`);
  console.log(`  - Delayed: ${totalDelayed}`);
  console.log(`  - Failed : ${totalFailed}`);
  console.log(`  - Done   : ${totalCompleted}`);
  console.log('====================================================');
}

checkQueues()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error checking queues:', err);
    process.exit(1);
  });
