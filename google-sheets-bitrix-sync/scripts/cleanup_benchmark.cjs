const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Auto-load environment variables from .env if present
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

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const BITRIX_URL = process.env.BITRIX_WEBHOOK_URL;

if (!SPREADSHEET_ID || !BITRIX_URL) {
  console.error('\n[!] Lỗi: Thiếu GOOGLE_SHEET_ID hoặc BITRIX_WEBHOOK_URL trong file .env');
  console.error('[!] Vui lòng cấu hình file .env trước khi chạy cleanup.\n');
  process.exit(1);
}

async function main() {
  console.log('\n===============================================================');
  console.log('       DỌN DẸP DỮ LIỆU TEST BENCHMARK TRÊN SHEET & BITRIX24    ');
  console.log('===============================================================\n');

  // 1. Google Sheets Auth
  const auth = new google.auth.GoogleAuth({
    keyFile: './config/credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 2. Find and delete benchmark leads on Bitrix24
  console.log('[1/2] Tìm kiếm và xóa các Lead test [BENCHMARK] trên Bitrix24 CRM...');
  let totalDeletedBitrix = 0;
  let hasMore = true;

  while (hasMore) {
    const listRes = await axios.post(`${BITRIX_URL}crm.lead.list.json`, {
      filter: { '%TITLE': 'BENCHMARK' },
      select: ['ID'],
    });

    const leads = listRes.data?.result || [];
    if (leads.length === 0) {
      hasMore = false;
      break;
    }

    const chunkSize = 50;
    for (let i = 0; i < leads.length; i += chunkSize) {
      const chunk = leads.slice(i, i + chunkSize);
      const cmd = {};
      chunk.forEach((l, idx) => {
        cmd[`del_${idx}`] = `crm.lead.delete?id=${l.ID}`;
      });
      await axios.post(`${BITRIX_URL}batch.json`, { halt: 0, cmd });
      totalDeletedBitrix += chunk.length;
    }
  }
  console.log(`      ✓ Đã xóa tổng cộng ${totalDeletedBitrix} lead benchmark trên Bitrix24 CRM.`);

  // 3. Find and delete benchmark rows on Google Sheet
  console.log('\n[2/2] Tìm kiếm và xóa các dòng test [BENCHMARK] trên Google Sheet...');
  const sheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leads!A1:ZZ',
  });
  const rows = sheetRes.data.values || [];

  const spreadsheetInfo = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const targetSheet = spreadsheetInfo.data.sheets?.find((s) => s.properties?.title === 'Leads') || spreadsheetInfo.data.sheets?.[0];
  const sheetTabId = targetSheet?.properties?.sheetId ?? 0;

  // Find contiguous benchmark row blocks to delete from bottom up
  const benchmarkRowIndices = [];
  for (let i = 1; i < rows.length; i++) {
    const rowTitle = String(rows[i][0] || '');
    if (rowTitle.includes('BENCHMARK')) {
      benchmarkRowIndices.push(i);
    }
  }

  if (benchmarkRowIndices.length > 0) {
    // Delete all benchmark rows in reverse index order
    const startIdx = benchmarkRowIndices[0];
    const endIdx = benchmarkRowIndices[benchmarkRowIndices.length - 1] + 1;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: 'ROWS',
                startIndex: startIdx,
                endIndex: endIdx,
              },
            },
          },
        ],
      },
    });
    console.log(`      ✓ Đã xóa ${benchmarkRowIndices.length} dòng test trên Google Sheet (từ dòng ${startIdx + 1} đến ${endIdx}).`);
  } else {
    console.log('      ✓ Không tìm thấy dòng test nào cần xóa trên Google Sheet.');
  }

  console.log('\n===============================================================');
  console.log('       HOÀN TẤT DỌN DẸP! HỆ THỐNG ĐÃ TRỞ VỀ NGUYÊN TRẠNG      ');
  console.log('===============================================================\n');
}

main().catch((err) => {
  console.error('Lỗi khi dọn dẹp:', err.message);
  process.exit(1);
});
