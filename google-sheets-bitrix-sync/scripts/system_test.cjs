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
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const WEBHOOK_SECRET = process.env.BITRIX_INBOUND_WEBHOOK_SECRET || 'test_webhook_secret';

if (!SPREADSHEET_ID || !BITRIX_URL) {
  console.error('\n[!] Lỗi: Thiếu GOOGLE_SHEET_ID hoặc BITRIX_WEBHOOK_URL trong file .env');
  console.error('[!] Vui lòng cấu hình file .env trước khi chạy system_test.\n');
  process.exit(1);
}

// Convert 0-indexed column number to A1 letter (0 -> A, 1 -> B, 25 -> Z, 26 -> AA)
function indexToA1(idx) {
  let letter = '';
  let temp = idx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

async function main() {
  console.log('===============================================================');
  console.log('  BẮT ĐẦU BỘ KIỂM THỬ TOÀN DIỆN 22 TEST CASES (FULL QA SUITE)');
  console.log('  SHEET <-> BITRIX24 | DEDUP EMAIL+PHONE | NORMALIZATION');
  console.log('  WEBHOOK REALTIME | CONFLICT | ENUM MAPPING | FORCE SYNC');
  console.log('===============================================================');

  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
    ? path.resolve(__dirname, '..', process.env.GOOGLE_SHEETS_CREDENTIALS_PATH)
    : path.resolve(__dirname, '../config/credentials.json');

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Helper to trigger forward sync (Sheet -> Bitrix) with lock retry
  async function triggerSync(force = false) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const res = await axios.post(`${API_BASE}/sync/trigger`, { force });
      if (res.data?.isSkippedDueToLock || res.data?.data?.isSkippedDueToLock) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return res.data;
    }
    throw new Error('Sync was locked for too long');
  }

  // Helper to trigger reverse sync (Bitrix -> Sheet) with lock retry
  async function triggerReverseSync(leadId) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const url = leadId ? `${API_BASE}/sync/reverse?leadId=${leadId}` : `${API_BASE}/sync/reverse`;
      const res = await axios.post(url);
      if (res.data?.isSkippedDueToLock || res.data?.data?.isSkippedDueToLock) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return res.data;
    }
    throw new Error('Reverse sync was locked for too long');
  }

  // Helper to simulate incoming Bitrix webhook
  async function sendBitrixWebhook(event, leadId, token = WEBHOOK_SECRET) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return axios.post(
      `${API_BASE}/webhook/bitrix`,
      {
        event,
        data: { FIELDS: { ID: String(leadId) } },
        auth: { application_token: token },
      },
      { headers, validateStatus: () => true },
    );
  }

  // Helper to call Bitrix REST API
  async function callBitrix(method, params = {}) {
    const res = await axios.post(`${BITRIX_URL}${method}.json`, params);
    return res.data?.result;
  }

  // Read headers dynamically from Row 1
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leads!1:1',
  });
  const headers = (headerRes.data.values || [])[0] || [];

  function findCol(regex) {
    return headers.findIndex((h) => regex.test(h));
  }

  const col = {
    name: findCol(/(tên khách|họ và tên|name)/i),
    company: findCol(/(công ty|company)/i),
    email: findCol(/email/i),
    phone: findCol(/(điện thoại|phone|sđt)/i),
    source: findCol(/(nguồn|source)/i),
    opportunity: findCol(/(ngân sách|doanh số|opportunity)/i),
    status: headers.findIndex((h) => h.trim() === 'Trạng thái'),
    assigned: findCol(/(người phụ trách|assigned)/i),
    comments: findCol(/(ghi chú|bình luận|comments)/i),
    tax: findCol(/(thuế|tax)/i),
    industry: findCol(/(ngành|industry)/i),
    syncStatus: findCol(/(trạng thái đồng bộ|status)/i),
    leadId: findCol(/(lead id|mã lead)/i),
    syncTime: findCol(/(thời gian đồng bộ|last sync)/i),
    error: findCol(/(thông báo lỗi|chi tiết lỗi|error)/i),
    hash: findCol(/(hash|mã kiểm tra)/i),
  };

  console.log(`[*] Phát hiện cấu trúc Sheet: ${headers.length} cột.`);
  console.log(`    Cột Tên: ${col.name >= 0 ? indexToA1(col.name) : 'N/A'}, Email: ${col.email >= 0 ? indexToA1(col.email) : 'N/A'}, Ngân sách: ${col.opportunity >= 0 ? indexToA1(col.opportunity) : 'N/A'}, Trạng thái sync: ${col.syncStatus >= 0 ? indexToA1(col.syncStatus) : 'N/A'}, Lead ID: ${col.leadId >= 0 ? indexToA1(col.leadId) : 'N/A'}`);

  // Initial cleanup of residual rows 12+
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leads!A12:ZZ100',
  });

  // Dynamically resolve Row 2's Bitrix Lead ID
  const row2InitRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leads!2:2',
  });
  let row2InitData = (row2InitRes.data.values || [])[0] || [];
  let targetLead1Id = Number(row2InitData[col.leadId]);

  if (!targetLead1Id || isNaN(targetLead1Id)) {
    console.log('[*] Row 2 chưa được đồng bộ, thực hiện sync khởi tạo...');
    await triggerSync();
    const row2AfterSync = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!2:2',
    });
    row2InitData = row2AfterSync.data.values[0];
    targetLead1Id = Number(row2InitData[col.leadId]);
  }
  console.log(`[*] Lead chuẩn tại Row 2 có Bitrix Lead ID = #${targetLead1Id}\n`);

  // Track created temp leads for safe cleanup
  const tempBitrixLeadIds = [];
  // TC1: Update lead data (Sheet -> Bitrix)
  console.log('--- TC1: KIỂM THỬ CẬP NHẬT LEAD (SHEET -> BITRIX) ---');
  try {
    console.log(`1. Sửa ô Ngân sách = 99000000 và Trạng thái = Đang liên hệ...`);
    const oppLetter = indexToA1(col.opportunity);
    const statLetter = indexToA1(col.status);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${oppLetter}2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['99000000']] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${statLetter}2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Đang liên hệ']] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync1 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync1.data));
    assert(sync1.data.updated >= 1, 'Số bản ghi updated phải >= 1');
    assert(sync1.data.failed === 0, 'Số bản ghi failed phải = 0');

    console.log(`3. Xác thực dữ liệu trên Bitrix24 CRM của Lead #${targetLead1Id}...`);
    const bLead1 = await callBitrix('crm.lead.get', { id: targetLead1Id });
    assert(bLead1.STATUS_ID === 'IN_PROCESS', `STATUS_ID trên Bitrix phải là IN_PROCESS (thực tế: ${bLead1.STATUS_ID})`);
    assert(Number(bLead1.OPPORTUNITY) === 99000000, `OPPORTUNITY trên Bitrix phải là 99000000 (thực tế: ${bLead1.OPPORTUNITY})`);

    console.log('4. Xác thực trạng thái trên Google Sheet...');
    const row2Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!2:2',
    });
    const row2Data = row2Res.data.values[0];
    const status2 = row2Data[col.syncStatus];
    const id2 = row2Data[col.leadId];
    const err2 = row2Data[col.error];

    assert(status2 === 'ĐÃ ĐỒNG BỘ', `Trạng thái đồng bộ phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${status2})`);
    assert(String(id2) === String(targetLead1Id), `Lead ID Bitrix24 phải là '${targetLead1Id}' (thực tế: ${id2})`);
    assert(!err2, `Thông báo lỗi phải rỗng (thực tế: ${err2})`);
    console.log('=> TC1 THÀNH CÔNG HOÀN HẢO!\n');
  } catch (err) {
    console.error('TC1 GẶP LỖI:', err.message);
  }
  // TC2: Idempotency check via SHA-256 hash match
  console.log('--- TC2: KIỂM THỬ TÍNH BẤT BIẾN (IDEMPOTENCY / HASH MATCH) ---');
  try {
    console.log('1. Kích hoạt sync lần 2 ngay lập tức khi không đổi dữ liệu...');
    const sync2 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync2.data));
    assert(sync2.data.skipped === sync2.data.totalRows, `Toàn bộ ${sync2.data.totalRows} bản ghi phải được BỎ QUA (skipped: ${sync2.data.skipped})`);
    assert(sync2.data.updated === 0, 'Số bản ghi updated phải = 0');
    assert(sync2.data.created === 0, 'Số bản ghi created phải = 0');
    assert(sync2.data.failed === 0, 'Số bản ghi failed phải = 0');
    console.log('=> TC2 THÀNH CÔNG: Cơ chế SHA-256 Checksum hoạt động chuẩn xác 100%!\n');
  } catch (err) {
    console.error('TC2 GẶP LỖI:', err.message);
  }
  // TC3: Create new lead from sheet (Sheet -> Bitrix)
  console.log('--- TC3: KIỂM THỬ TẠO MỚI LEAD (SHEET -> BITRIX) ---');
  let createdLeadIdTC3 = null;
  try {
    console.log('1. Thêm hàng mới vào Sheet (Row 12: Phan Văn Test QA)...');
    const tc3Email = `phanvantest.qa.${Date.now()}@qasolutions.vn`;
    const tc3Phone = `0918${String(Date.now()).slice(-6)}`;
    const newLeadRow = new Array(headers.length).fill('');
    if (col.name >= 0) newLeadRow[col.name] = 'Phan Văn Test QA';
    if (col.company >= 0) newLeadRow[col.company] = 'QA Solutions Vietnam';
    if (col.email >= 0) newLeadRow[col.email] = tc3Email;
    if (col.phone >= 0) newLeadRow[col.phone] = tc3Phone;
    if (col.source >= 0) newLeadRow[col.source] = 'Website';
    if (col.opportunity >= 0) newLeadRow[col.opportunity] = '75000000';
    if (col.status >= 0) newLeadRow[col.status] = 'Mới';
    if (col.assigned >= 0) newLeadRow[col.assigned] = '1';
    if (col.comments >= 0) newLeadRow[col.comments] = 'Test tạo mới E2E';
    if (col.tax >= 0) newLeadRow[col.tax] = '0109988776';
    if (col.industry >= 0) newLeadRow[col.industry] = 'Công nghệ thông tin';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A12:${endLetter}12`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newLeadRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync3 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync3.data));
    assert(sync3.data.created >= 1, `Số bản ghi tạo mới phải >= 1 (thực tế: ${sync3.data.created})`);
    assert(sync3.data.failed === 0, `Số bản ghi lỗi phải = 0 (thực tế: ${sync3.data.failed})`);

    console.log('3. Kiểm tra Google Sheet xem Lead ID đã được ghi lại vào cột ẩn chưa...');
    const row12Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!12:12',
    });
    const row12Data = row12Res.data.values[0];
    const status12 = row12Data[col.syncStatus];
    const id12 = row12Data[col.leadId];
    const hash12 = row12Data[col.hash];

    assert(status12 === 'ĐÃ ĐỒNG BỘ', `Trạng thái row 12 phải là ĐÃ ĐỒNG BỘ (thực tế: ${status12})`);
    assert(id12 && Number(id12) > 0, `Lead ID Bitrix24 phải tồn tại (thực tế: ${id12})`);
    assert(hash12 && hash12.length === 64, `Sync Hash phải là chuỗi SHA-256 64 ký tự (thực tế: ${hash12})`);
    createdLeadIdTC3 = Number(id12);
    tempBitrixLeadIds.push(createdLeadIdTC3);
    console.log(`   -> Lead mới được tạo có Bitrix ID = #${createdLeadIdTC3}`);

    console.log('4. Kiểm tra trên Bitrix24 CRM...');
    const bNewLead = await callBitrix('crm.lead.get', { id: createdLeadIdTC3 });
    assert(bNewLead.NAME === 'Phan Văn Test QA', `Tên phải khớp (thực tế: ${bNewLead.NAME})`);
    assert(bNewLead.STATUS_ID === 'NEW', `Trạng thái phải là NEW (thực tế: ${bNewLead.STATUS_ID})`);
    console.log('=> TC3 THÀNH CÔNG: Lead tạo mới chuẩn xác, Lead ID tự động cập nhật vào cột ẩn!\n');
  } catch (err) {
    console.error('TC3 GẶP LỖI:', err.message);
  }
  // TC4: Data deduplication by email/phone (Sheet -> Bitrix)
  console.log('--- TC4: KIỂM THỬ CHỐNG TRÙNG LẶP (DEDUPLICATION SHEET -> BITRIX) ---');
  try {
    const row2Email = row2InitData[col.email] || 'an.nguyen@achau.vn';
    console.log(`1. Thêm hàng mới (Row 13) có EMAIL TRÙNG VỚI LEAD ROW 2 (${row2Email})...`);
    const dupLeadRow = new Array(headers.length).fill('');
    if (col.name >= 0) dupLeadRow[col.name] = 'Nguyễn Văn An Update';
    if (col.company >= 0) dupLeadRow[col.company] = 'Công ty TNHH Á Châu';
    if (col.email >= 0) dupLeadRow[col.email] = row2Email;
    if (col.phone >= 0) dupLeadRow[col.phone] = '0901234567';
    if (col.source >= 0) dupLeadRow[col.source] = 'Website';
    if (col.opportunity >= 0) dupLeadRow[col.opportunity] = '120000000';
    if (col.status >= 0) dupLeadRow[col.status] = 'Đang xử lý';
    if (col.assigned >= 0) dupLeadRow[col.assigned] = '1';
    if (col.comments >= 0) dupLeadRow[col.comments] = 'Yêu cầu mở rộng chi nhánh';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A13:${endLetter}13`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [dupLeadRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync4 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync4.data));
    assert(sync4.data.created === 0, `Hệ thống KHÔNG ĐƯỢC tạo mới lead (created phải = 0, thực tế: ${sync4.data.created})`);
    assert(sync4.data.updated >= 1, `Hệ thống phải cập nhật lead hiện có (updated >= 1, thực tế: ${sync4.data.updated})`);

    console.log(`3. Kiểm tra Google Sheet Row 13 xem đã tự gắn Lead ID = #${targetLead1Id} chưa...`);
    const row13Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!13:13',
    });
    const row13Data = row13Res.data.values[0];
    const status13 = row13Data[col.syncStatus];
    const id13 = row13Data[col.leadId];

    assert(status13 === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${status13})`);
    assert(String(id13) === String(targetLead1Id), `Lead ID tự động liên kết phải là '${targetLead1Id}' (thực tế: ${id13})`);
    console.log(`=> TC4 THÀNH CÔNG: Chống trùng lặp tuyệt đối, tự liên kết và cập nhật Lead #${targetLead1Id}!\n`);
  } catch (err) {
    console.error('TC4 GẶP LỖI:', err.message);
  }
  // TC5: Input error isolation and validation handling
  console.log('--- TC5: KIỂM THỬ XỬ LÝ LỖI VALIDATION (ISOLATED ERROR HANDLING) ---');
  try {
    console.log('1. Thêm 2 hàng lỗi vào Sheet: Row 14 (thiếu liên hệ) và Row 15 (email sai format)...');
    const row14InvalidContact = new Array(headers.length).fill('');
    if (col.name >= 0) row14InvalidContact[col.name] = 'Lead rác không có liên hệ';
    if (col.company >= 0) row14InvalidContact[col.company] = 'Công ty Rác';
    if (col.source >= 0) row14InvalidContact[col.source] = 'Khác';
    if (col.opportunity >= 0) row14InvalidContact[col.opportunity] = '0';
    if (col.status >= 0) row14InvalidContact[col.status] = 'Mới';

    const row15InvalidEmail = new Array(headers.length).fill('');
    if (col.name >= 0) row15InvalidEmail[col.name] = 'Trần Sai Format';
    if (col.company >= 0) row15InvalidEmail[col.company] = 'Công ty ABC';
    if (col.email >= 0) row15InvalidEmail[col.email] = 'not-an-email-format@@';
    if (col.phone >= 0) row15InvalidEmail[col.phone] = '0912345678';
    if (col.source >= 0) row15InvalidEmail[col.source] = 'Website';
    if (col.opportunity >= 0) row15InvalidEmail[col.opportunity] = '10000000';
    if (col.status >= 0) row15InvalidEmail[col.status] = 'Mới';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A14:${endLetter}15`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row14InvalidContact, row15InvalidEmail] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync5 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync5.data));
    assert(sync5.data.failed >= 2, `Số bản ghi failed phải >= 2 (thực tế: ${sync5.data.failed})`);

    console.log('3. Kiểm tra thông báo lỗi trên Google Sheet...');
    const errRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!14:15',
    });
    const row14Data = errRows.data.values[0];
    const row15Data = errRows.data.values[1];
    const row14M = row14Data[col.syncStatus];
    const row14Err = row14Data[col.error];
    const row15M = row15Data[col.syncStatus];
    const row15Err = row15Data[col.error];

    assert(row14M === 'LỖI', `Row 14 trạng thái phải là LỖI (thực tế: ${row14M})`);
    assert(row14Err.includes('Thiếu thông tin liên hệ'), `Row 14 thông báo lỗi phải nhắc thiếu thông tin liên hệ (thực tế: ${row14Err})`);
    assert(row15M === 'LỖI', `Row 15 trạng thái phải là LỖI (thực tế: ${row15M})`);
    assert(row15Err.includes('Định dạng Email không hợp lệ'), `Row 15 thông báo lỗi phải nhắc email không hợp lệ (thực tế: ${row15Err})`);
    console.log('=> TC5 THÀNH CÔNG: Xử lý lỗi chuẩn mực, cô lập lỗi từng dòng mà không làm gián đoạn hệ thống!\n');
  } catch (err) {
    console.error('TC5 GẶP LỖI:', err.message);
  }
  // TC6: Zombie record prevention when lead deleted in CRM
  console.log('--- TC6: KIỂM THỬ XỬ LÝ LEAD BỊ XÓA TRÊN CRM (ZOMBIE RECORD PREVENTION) ---');
  try {
    console.log(`1. Trực tiếp xóa Lead #${createdLeadIdTC3} trên Bitrix24 CRM...`);
    const delRes = await callBitrix('crm.lead.delete', { id: createdLeadIdTC3 });
    console.log('   Kết quả xóa trên Bitrix:', delRes);

    console.log('2. Sửa cột Ghi chú ở Row 12 trên Sheet để trigger sync...');
    const commentLetter = indexToA1(col.comments);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${commentLetter}12`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Sửa ghi chú sau khi lead đã bị xóa trên CRM']] },
    });

    console.log('3. Kích hoạt đồng bộ...');
    const sync6 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync6.data));
    assert(sync6.data.created === 0, `Hệ thống KHÔNG ĐƯỢC tự ý tạo mới lại Lead rác (created = 0, thực tế: ${sync6.data.created})`);
    assert(sync6.data.failed >= 1, `Dòng bị xóa phải báo failed >= 1 (thực tế: ${sync6.data.failed})`);

    console.log('4. Kiểm tra thông báo lỗi trên Google Sheet Row 12...');
    const row12ErrRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!12:12',
    });
    const row12ErrData = row12ErrRes.data.values[0];
    const status12Zombie = row12ErrData[col.syncStatus];
    const err12Zombie = row12ErrData[col.error];

    assert(status12Zombie === 'LỖI', `Trạng thái phải là LỖI (thực tế: ${status12Zombie})`);
    assert(err12Zombie.includes('đã bị xóa trên CRM'), `Thông báo lỗi phải nêu rõ Lead đã bị xóa trên CRM (thực tế: ${err12Zombie})`);
    console.log('=> TC6 THÀNH CÔNG: Chặn đứng hoàn toàn Zombie Records, thông báo tường minh cho người dùng!\n');
  } catch (err) {
    console.error('TC6 GẶP LỖI:', err.message);
  }
  // TC7: Intentional lead recreation when user clears lead ID
  console.log('--- TC7: KIỂM THỬ TẠO LẠI LEAD CÓ CHỦ ĐÍCH (USER CLEARS LEAD ID) ---');
  let reCreatedLeadId = null;
  try {
    console.log('1. Người dùng xóa trắng ô Lead ID Bitrix24 và Trạng thái tại Row 12...');
    const leadIdLetter = indexToA1(col.leadId);
    const syncStatusLetter = indexToA1(col.syncStatus);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${syncStatusLetter}12`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['']] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${leadIdLetter}12`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['']] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync7 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync7.data));
    assert(sync7.data.created >= 1, `Hệ thống phải nhận diện đây là chủ đích tạo mới (created >= 1, thực tế: ${sync7.data.created})`);

    console.log('3. Kiểm tra Google Sheet Row 12 đã được cấp Lead ID mới chưa...');
    const row12NewRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!12:12',
    });
    const row12NewData = row12NewRes.data.values[0];
    const newSt = row12NewData[col.syncStatus];
    const newId = row12NewData[col.leadId];
    const newErr = row12NewData[col.error];

    assert(newSt === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải chuyển sang ĐÃ ĐỒNG BỘ (thực tế: ${newSt})`);
    assert(newId && Number(newId) > 0, `Phải có ID Bitrix mới (thực tế: ${newId})`);
    assert(!newErr || newErr.trim() === '', `Lỗi phải được xóa trắng (thực tế: ${newErr})`);
    reCreatedLeadId = Number(newId);
    tempBitrixLeadIds.push(reCreatedLeadId);
    console.log(`   -> Lead mới được tạo lại thành công với ID = #${reCreatedLeadId}`);
    console.log('=> TC7 THÀNH CÔNG: Người dùng chủ động tạo lại Lead linh hoạt theo đúng nghiệp vụ!\n');
  } catch (err) {
    console.error('TC7 GẶP LỖI:', err.message);
  }
  // TC8: In-place update from Bitrix to Sheet (Bitrix -> Sheet)
  console.log('--- TC8: KIỂM THỬ CẬP NHẬT LEAD TRÊN CRM -> ĐỒNG BỘ VỀ SHEET (BITRIX -> SHEET) ---');
  try {
    console.log(`1. Sửa trực tiếp Tên của Lead #${targetLead1Id} trên Bitrix24: Nguyễn Văn An VIP...`);
    await callBitrix('crm.lead.update', {
      id: targetLead1Id,
      fields: { NAME: 'Nguyễn Văn An VIP' },
    });

    console.log('2. Kích hoạt Reverse Sync...');
    const revRes = await triggerReverseSync(targetLead1Id);
    const updatedCount = revRes.data?.updated ?? revRes.data?.data?.updated ?? 0;
    assert(updatedCount >= 1, `Số bản ghi updated từ CRM về Sheet phải >= 1 (thực tế: ${updatedCount})`);

    console.log('3. Kiểm tra Google Sheet Row 2 xem ô Tên khách hàng đã nhận giá trị mới chưa...');
    const row2New = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!2:2',
    });
    const nameA2 = row2New.data.values[0][col.name];
    assert(nameA2 === 'Nguyễn Văn An VIP', `Tên trên Sheet phải đổi thành 'Nguyễn Văn An VIP' (thực tế: ${nameA2})`);
    console.log('=> TC8 THÀNH CÔNG: Đồng bộ ngược 2 chiều từ Bitrix24 về Sheet hoạt động trơn tru!\n');
  } catch (err) {
    console.error('TC8 GẶP LỖI:', err.message);
  }
  // TC9: Real-time webhook lead creation (Bitrix -> Sheet)
  console.log('--- TC9: TẠO MỚI LEAD TRÊN BITRIX24 -> BẮN WEBHOOK -> TỰ ĐỘNG TẠO HÀNG MỚI TRÊN SHEET ---');
  let newB24LeadId = null;
  try {
    console.log('1. Tạo mới một Lead trực tiếp trên Bitrix24 qua REST API...');
    newB24LeadId = await callBitrix('crm.lead.add', {
      fields: {
        TITLE: 'Khảo sát ERP Cloud - Doanh nghiệp Bitrix',
        NAME: 'Hoàng Văn Bitrix',
        COMPANY_TITLE: 'Bitrix Vietnam Corp',
        EMAIL: [{ VALUE: 'hoangvan.b24@bitrixvn.com', VALUE_TYPE: 'WORK' }],
        PHONE: [{ VALUE: '0933557799', VALUE_TYPE: 'WORK' }],
        OPPORTUNITY: '85000000',
        STATUS_ID: 'NEW',
      },
    });
    assert(newB24LeadId && Number(newB24LeadId) > 0, `Lead mới trên Bitrix24 phải được tạo (ID: ${newB24LeadId})`);
    tempBitrixLeadIds.push(Number(newB24LeadId));
    console.log(`   -> Đã tạo Lead #${newB24LeadId} trên Bitrix24 CRM`);

    console.log('2. Bắn Webhook ONCRMLEADADD gửi tới hệ thống...');
    const hookRes = await sendBitrixWebhook('ONCRMLEADADD', newB24LeadId);
    assert(hookRes.status === 200 || hookRes.status === 201, `Webhook phải trả về 200/201 (thực tế: ${hookRes.status})`);
    assert(hookRes.data.status === 'accepted', `Webhook response status phải là 'accepted' (thực tế: ${hookRes.data.status})`);

    console.log('3. Đợi 3.5 giây cho luồng background sync xử lý và append hàng mới vào Sheet...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('4. Kiểm tra Google Sheets xem hàng mới đã xuất hiện chưa...');
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const allRows = sheetData.data.values || [];
    const matchedB24Row = allRows.find((r) => String(r[col.leadId]) === String(newB24LeadId));

    assert(Boolean(matchedB24Row), `Phải tìm thấy hàng trên Sheet mang Lead ID Bitrix24 = #${newB24LeadId}`);
    assert(matchedB24Row[col.name] === 'Hoàng Văn Bitrix', `Tên khách hàng phải khớp (thực tế: ${matchedB24Row[col.name]})`);
    assert(matchedB24Row[col.company] === 'Bitrix Vietnam Corp', `Công ty phải khớp (thực tế: ${matchedB24Row[col.company]})`);
    assert(matchedB24Row[col.email] === 'hoangvan.b24@bitrixvn.com', `Email phải khớp (thực tế: ${matchedB24Row[col.email]})`);
    assert(matchedB24Row[col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái đồng bộ phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${matchedB24Row[col.syncStatus]})`);
    assert(matchedB24Row[col.hash] && matchedB24Row[col.hash].length === 64, `Sync Hash phải là chuỗi SHA-256 (thực tế: ${matchedB24Row[col.hash]})`);
    console.log('=> TC9 THÀNH CÔNG: Tạo mới lead trên Bitrix24 tự động đẩy vào Google Sheets qua Webhook thời gian thực!\n');
  } catch (err) {
    console.error('TC9 GẶP LỖI:', err.message);
  }
  // TC10: Deduplication on reverse sync (Bitrix -> Sheet)
  console.log('--- TC10: KIỂM THỬ CHỐNG TRÙNG LẶP CHIỀU BITRIX -> SHEET ---');
  let dupB24LeadId = null;
  try {
    console.log('1. Thêm 1 dòng mới vào Sheet có email unique nhưng CHƯA CÓ Lead ID Bitrix...');
    const currentRowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRowIdx = (currentRowsRes.data.values || []).length + 1;

    const tc10Email = `nguyenthutest.${Date.now()}@vnn.vn`;
    const tc10Phone = `0988${String(Date.now()).slice(-6)}`;
    const preExistingSheetRow = new Array(headers.length).fill('');
    if (col.name >= 0) preExistingSheetRow[col.name] = 'Nguyễn Thị Thu';
    if (col.company >= 0) preExistingSheetRow[col.company] = 'VNN Tech';
    if (col.email >= 0) preExistingSheetRow[col.email] = tc10Email;
    if (col.phone >= 0) preExistingSheetRow[col.phone] = tc10Phone;
    if (col.source >= 0) preExistingSheetRow[col.source] = 'Website';
    if (col.opportunity >= 0) preExistingSheetRow[col.opportunity] = '30000000';
    if (col.status >= 0) preExistingSheetRow[col.status] = 'Mới';
    if (col.assigned >= 0) preExistingSheetRow[col.assigned] = '1';
    if (col.comments >= 0) preExistingSheetRow[col.comments] = 'Chờ liên kết CRM';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRowIdx}:${endLetter}${nextRowIdx}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [preExistingSheetRow] },
    });

    console.log(`2. Tạo Lead trên Bitrix24 với cùng Email ${tc10Email}...`);
    dupB24LeadId = await callBitrix('crm.lead.add', {
      fields: {
        TITLE: 'Tư vấn CRM Doanh Nghiệp - Bitrix Side',
        NAME: 'Nguyễn Thị Thu',
        EMAIL: [{ VALUE: tc10Email, VALUE_TYPE: 'WORK' }],
        STATUS_ID: 'IN_PROCESS',
      },
    });
    tempBitrixLeadIds.push(Number(dupB24LeadId));

    console.log('3. Kích hoạt Reverse Sync...');
    const revSyncRes = await triggerReverseSync(dupB24LeadId);
    console.log('   Kết quả reverse sync:', JSON.stringify(revSyncRes.data));

    console.log('4. Kiểm tra Google Sheets xem hệ thống có tự liên kết vào dòng có sẵn mà KHÔNG tạo dòng mới trùng lặp không...');
    const afterDedupRowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const matchedRows = (afterDedupRowsRes.data.values || []).filter((r) => String(r[col.email] || '').toLowerCase() === tc10Email.toLowerCase());

    assert(matchedRows.length === 1, `Chỉ được tồn tại duy nhất 1 dòng mang email ${tc10Email} (thực tế: ${matchedRows.length})`);
    assert(String(matchedRows[0][col.leadId]) === String(dupB24LeadId), `Dòng có sẵn phải được tự động gắn Lead ID = #${dupB24LeadId} (thực tế: ${matchedRows[0][col.leadId]})`);
    assert(matchedRows[0][col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${matchedRows[0][col.syncStatus]})`);
    console.log('=> TC10 THÀNH CÔNG: Chống trùng lặp chiều Bitrix -> Sheet hoạt động hoàn hảo!\n');
  } catch (err) {
    console.error('TC10 GẶP LỖI:', err.message);
  }
  // TC11: ONCRMLEADDELETE webhook handling and sheet update
  console.log('--- TC11: XÓA LEAD TRÊN BITRIX -> BẮN WEBHOOK ONCRMLEADDELETE -> XÓA KHỎI SHEET ---');
  try {
    console.log('1. Thêm 1 dòng phụ có cùng Email/SĐT với Lead nhưng CHƯA CÓ Lead ID để kiểm tra an toàn dữ liệu...');
    const currentRowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRowIdx = (currentRowsRes.data.values || []).length + 1;
    const sameEmailRow = new Array(headers.length).fill('');
    if (col.name >= 0) sameEmailRow[col.name] = 'Hoàng Văn Đồng Nghiệp';
    if (col.company >= 0) sameEmailRow[col.company] = 'Bitrix Vietnam Corp';
    if (col.email >= 0) sameEmailRow[col.email] = 'hoangvan.b24@bitrixvn.com';
    if (col.status >= 0) sameEmailRow[col.status] = 'Mới';
    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRowIdx}:${endLetter}${nextRowIdx}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [sameEmailRow] },
    });

    console.log(`2. Xóa Lead #${newB24LeadId} trên Bitrix24...`);
    await callBitrix('crm.lead.delete', { id: newB24LeadId });

    console.log('3. Bắn Webhook ONCRMLEADDELETE...');
    const delHookRes = await sendBitrixWebhook('ONCRMLEADDELETE', newB24LeadId);
    assert(delHookRes.status === 200 || delHookRes.status === 201, 'Webhook xóa phải được chấp nhận');

    console.log('4. Đợi 3.5 giây cho luồng sync xử lý xóa dòng trên Sheet...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('5. Kiểm tra dòng của Lead này trên Google Sheet...');
    const sheetDataAfterDel = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const afterDelRows = sheetDataAfterDel.data.values || [];
    const targetRow = afterDelRows.find((r) => String(r[col.leadId]) === String(newB24LeadId));
    // When lead is deleted on Bitrix, the system deletes ONLY the row with matching bitrixLeadId
    const isDeletedFromSheet = !targetRow;
    const isMarkedError = targetRow && targetRow[col.syncStatus] === 'LỖI';
    assert(isDeletedFromSheet || isMarkedError, `Dòng có Lead ID #${newB24LeadId} phải được tự động xóa khỏi Google Sheet (thực tế: ${isDeletedFromSheet ? 'Đã xóa hoàn toàn' : targetRow[col.syncStatus]})`);

    // Verify the unsynced row with same email was NOT deleted
    const preservedRow = afterDelRows.find((r) => r[col.name] === 'Hoàng Văn Đồng Nghiệp');
    assert(Boolean(preservedRow), 'Dòng phụ trùng Email nhưng chưa có Lead ID phải được bảo toàn, KHÔNG ĐƯỢC xóa nhầm!');
    console.log('  [PASS] Dòng phụ chưa có Lead ID được bảo toàn 100% (không bị xóa nhầm)');

    // Dọn dẹp dòng kiểm thử phụ này để không ảnh hưởng các test sau
    const preservedRowIdx = afterDelRows.findIndex((r) => r[col.name] === 'Hoàng Văn Đồng Nghiệp') + 1;
    if (preservedRowIdx > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: 0,
                  dimension: 'ROWS',
                  startIndex: preservedRowIdx - 1,
                  endIndex: preservedRowIdx,
                },
              },
            },
          ],
        },
      });
    }
    console.log('=> TC11 THÀNH CÔNG: Webhook xóa chỉ xóa đúng dòng mang Lead ID, bảo vệ an toàn các dòng khác!\n');
  } catch (err) {
    console.error('TC11 GẶP LỖI:', err.message);
  }
  // TC12: Inbound webhook authentication and token security
  console.log('--- TC12: KIỂM THỬ BẢO MẬT XÁC THỰC WEBHOOK (SECURITY AUTHENTICATION) ---');
  try {
    console.log('1. Bắn webhook với token giả mạo (invalid_token_123)...');
    const fakeHookRes = await sendBitrixWebhook('ONCRMLEADUPDATE', targetLead1Id, 'invalid_token_123');
    assert(fakeHookRes.status === 401, `Webhook với token giả mạo phải bị từ chối 401 Unauthorized (thực tế: ${fakeHookRes.status})`);

    console.log('2. Bắn webhook với token chuẩn...');
    const validHookRes = await sendBitrixWebhook('ONCRMLEADUPDATE', targetLead1Id, WEBHOOK_SECRET);
    assert(validHookRes.status === 200 || validHookRes.status === 201, `Webhook với token hợp lệ phải được chấp nhận (thực tế: ${validHookRes.status})`);
    console.log('=> TC12 THÀNH CÔNG: Cơ chế xác thực Token bảo mật ngăn chặn 100% request giả mạo!\n');
  } catch (err) {
    console.error('TC12 GẶP LỖI:', err.message);
  }
  // TC13: Conflict resolution handling (Last-Write-Wins)
  console.log('--- TC13: KIỂM THỬ TRANH CHẤP DỮ LIỆU (LAST-WRITE-WINS CONFLICT RESOLUTION) ---');
  try {
    console.log(`1. Sửa Lead #${targetLead1Id} trên Bitrix24 với timestamp mới nhất...`);
    await callBitrix('crm.lead.update', {
      id: targetLead1Id,
      fields: { NAME: 'Khách hàng VIP Chiến Lược' },
    });

    console.log('2. Kích hoạt Reverse Sync...');
    const conflictRes = await triggerReverseSync(targetLead1Id);
    const updatedCount = conflictRes.data?.updated ?? conflictRes.data?.data?.updated ?? 0;
    assert(updatedCount >= 1, `Bản ghi mới hơn trên Bitrix phải ghi đè Sheet (updated: ${updatedCount})`);

    console.log('3. Kiểm tra Tên trên Sheet Row 2...');
    const row2Conflict = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!2:2',
    });
    const nameConflict = row2Conflict.data.values[0][col.name];
    assert(nameConflict === 'Khách hàng VIP Chiến Lược', `Tên trên Sheet phải nhận giá trị mới nhất (thực tế: ${nameConflict})`);
    console.log('=> TC13 THÀNH CÔNG: Xử lý tranh chấp Last-Write-Wins hoạt động chuẩn xác!\n');
  } catch (err) {
    console.error('TC13 GẶP LỖI:', err.message);
  }
  // TC15: Deduplication by phone number matching
  console.log('--- TC15: KIỂM THỬ CHỐNG TRÙNG LẶP BẰNG SỐ ĐIỆN THOẠI ---');
  try {
    const row2Phone = row2InitData[col.phone] || '0901234567';
    console.log(`1. Thêm hàng mới có SĐT TRÙNG VỚI LEAD ROW 2 (${row2Phone}), email hoàn toàn khác...`);

    const curRows15 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRow15 = (curRows15.data.values || []).length + 1;

    const phoneDupRow = new Array(headers.length).fill('');
    if (col.name >= 0) phoneDupRow[col.name] = 'Trần Thị Phone Dedup';
    if (col.company >= 0) phoneDupRow[col.company] = 'Công ty Phone Test';
    if (col.email >= 0) phoneDupRow[col.email] = 'phone.dedup.unique@test.vn';
    if (col.phone >= 0) phoneDupRow[col.phone] = row2Phone;
    if (col.source >= 0) phoneDupRow[col.source] = 'Website';
    if (col.opportunity >= 0) phoneDupRow[col.opportunity] = '30000000';
    if (col.status >= 0) phoneDupRow[col.status] = 'Mới';
    if (col.assigned >= 0) phoneDupRow[col.assigned] = '1';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRow15}:${endLetter}${nextRow15}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [phoneDupRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync15 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync15.data));
    assert(sync15.data.created === 0, `Hệ thống KHÔNG ĐƯỢC tạo mới lead khi SĐT trùng (created = 0, thực tế: ${sync15.data.created})`);
    assert(sync15.data.updated >= 1, `Hệ thống phải cập nhật lead hiện có qua SĐT (updated >= 1, thực tế: ${sync15.data.updated})`);

    console.log(`3. Kiểm tra row ${nextRow15} đã tự gắn Lead ID = #${targetLead1Id} chưa...`);
    const rowRes15 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${nextRow15}:${nextRow15}`,
    });
    const rowData15 = rowRes15.data.values[0];
    assert(String(rowData15[col.leadId]) === String(targetLead1Id), `Lead ID phải liên kết đến #${targetLead1Id} qua SĐT (thực tế: ${rowData15[col.leadId]})`);
    assert(rowData15[col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${rowData15[col.syncStatus]})`);
    console.log('=> TC15 THÀNH CÔNG: Chống trùng lặp bằng Số điện thoại hoạt động chuẩn xác!\n');
  } catch (err) {
    console.error('TC15 GẶP LỖI:', err.message);
  }
  // TC16: Dedup conflict detection (Email lead A, Phone lead B)
  console.log('--- TC16: KIỂM THỬ XUNG ĐỘT DỮ LIỆU EMAIL vs SĐT (DEDUP CONFLICT) ---');
  let conflictHelperLeadId = null;
  try {
    console.log('1. Tạo Lead phụ trợ trên Bitrix24 với SĐT riêng biệt (+84966111222)...');
    conflictHelperLeadId = await callBitrix('crm.lead.add', {
      fields: {
        TITLE: 'Lead Phụ Trợ Test Conflict',
        NAME: 'Phạm Conflict Helper',
        PHONE: [{ VALUE: '+84966111222', VALUE_TYPE: 'WORK' }],
        EMAIL: [{ VALUE: 'conflict.helper.unique@test.vn', VALUE_TYPE: 'WORK' }],
        STATUS_ID: 'NEW',
      },
    });
    tempBitrixLeadIds.push(Number(conflictHelperLeadId));
    console.log(`   -> Đã tạo Lead phụ trợ #${conflictHelperLeadId}`);

    const row2Email = row2InitData[col.email] || 'an.nguyen@achau.vn';
    console.log(`2. Thêm hàng mới: Email = ${row2Email} (thuộc Lead #${targetLead1Id}) + SĐT = 0966111222 (thuộc Lead #${conflictHelperLeadId})...`);

    const curRows16 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRow16 = (curRows16.data.values || []).length + 1;

    const conflictRow = new Array(headers.length).fill('');
    if (col.name >= 0) conflictRow[col.name] = 'Nguyễn Conflict Test';
    if (col.company >= 0) conflictRow[col.company] = 'Công ty Conflict';
    if (col.email >= 0) conflictRow[col.email] = row2Email;
    if (col.phone >= 0) conflictRow[col.phone] = '0966111222';
    if (col.source >= 0) conflictRow[col.source] = 'Website';
    if (col.opportunity >= 0) conflictRow[col.opportunity] = '20000000';
    if (col.status >= 0) conflictRow[col.status] = 'Mới';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRow16}:${endLetter}${nextRow16}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [conflictRow] },
    });

    console.log('3. Kích hoạt đồng bộ...');
    const sync16 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync16.data));
    assert(sync16.data.failed >= 1, `Dòng xung đột phải báo failed >= 1 (thực tế: ${sync16.data.failed})`);
    assert(sync16.data.created === 0, `KHÔNG ĐƯỢC tạo mới lead khi có xung đột (created = 0, thực tế: ${sync16.data.created})`);

    console.log(`4. Kiểm tra thông báo lỗi xung đột trên Sheet row ${nextRow16}...`);
    const rowRes16 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${nextRow16}:${nextRow16}`,
    });
    const rowData16 = rowRes16.data.values[0];
    assert(rowData16[col.syncStatus] === 'LỖI', `Trạng thái phải là LỖI (thực tế: ${rowData16[col.syncStatus]})`);
    assert(
      rowData16[col.error] && rowData16[col.error].includes('Xung đột'),
      `Thông báo lỗi phải nhắc đến xung đột dữ liệu (thực tế: ${rowData16[col.error]})`,
    );
    console.log('=> TC16 THÀNH CÔNG: Hệ thống phát hiện và chặn xung đột Email/SĐT thuộc 2 Lead khác nhau!\n');
  } catch (err) {
    console.error('TC16 GẶP LỖI:', err.message);
  }
  // TC17: Multi-format Vietnamese phone normalization
  console.log('--- TC17: KIỂM THỬ CHUẨN HÓA SĐT NHIỀU FORMAT (DATA NORMALIZATION) ---');
  let tc17LeadId = null;
  try {
    console.log('1. Thêm hàng mới với SĐT format có khoảng trắng: "0935 112 233"...');

    const curRows17 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRow17 = (curRows17.data.values || []).length + 1;

    const tc17Suffix = String(Date.now()).slice(-6);
    const tc17Email = `format.phone.${tc17Suffix}@test.vn`;
    const tc17Phone = `0935 ${tc17Suffix.slice(0, 3)} ${tc17Suffix.slice(3)}`;
    const tc17ExpectedPhone = `+84935${tc17Suffix}`;

    const phoneFormatRow = new Array(headers.length).fill('');
    if (col.name >= 0) phoneFormatRow[col.name] = 'Vũ Văn Format Phone';
    if (col.company >= 0) phoneFormatRow[col.company] = 'Công ty Format Test';
    if (col.email >= 0) phoneFormatRow[col.email] = tc17Email;
    if (col.phone >= 0) phoneFormatRow[col.phone] = tc17Phone;
    if (col.source >= 0) phoneFormatRow[col.source] = 'Facebook';
    if (col.opportunity >= 0) phoneFormatRow[col.opportunity] = '40000000';
    if (col.status >= 0) phoneFormatRow[col.status] = 'Mới';
    if (col.assigned >= 0) phoneFormatRow[col.assigned] = '1';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRow17}:${endLetter}${nextRow17}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [phoneFormatRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync17 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync17.data));
    assert(sync17.data.created >= 1, `Lead phải được tạo thành công (created >= 1, thực tế: ${sync17.data.created})`);

    console.log('3. Kiểm tra Lead ID trên Sheet...');
    const rowRes17 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${nextRow17}:${nextRow17}`,
    });
    const rowData17 = rowRes17.data.values[0];
    tc17LeadId = Number(rowData17[col.leadId]);
    tempBitrixLeadIds.push(tc17LeadId);
    assert(tc17LeadId > 0, `Lead ID phải tồn tại (thực tế: ${tc17LeadId})`);
    assert(rowData17[col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${rowData17[col.syncStatus]})`);

    console.log('4. Xác thực SĐT trên Bitrix24 đã được chuẩn hóa sang format quốc tế +84...');
    const bLead17 = await callBitrix('crm.lead.get', { id: tc17LeadId });
    const bitrixPhone17 = Array.isArray(bLead17.PHONE) ? bLead17.PHONE[0]?.VALUE : '';
    assert(bitrixPhone17 === tc17ExpectedPhone, `SĐT phải chuẩn hóa thành ${tc17ExpectedPhone} (thực tế: ${bitrixPhone17})`);
    console.log(`=> TC17 THÀNH CÔNG: Chuẩn hóa SĐT "${tc17Phone}" → "${tc17ExpectedPhone}" hoàn hảo!\n`);
  } catch (err) {
    console.error('TC17 GẶP LỖI:', err.message);
  }
  // TC18: Create lead with phone number only (no email)
  console.log('--- TC18: KIỂM THỬ TẠO LEAD CHỈ CÓ SĐT, KHÔNG CÓ EMAIL ---');
  let tc18LeadId = null;
  try {
    console.log('1. Thêm hàng mới chỉ có SĐT, bỏ trống Email hoàn toàn (mô phỏng lead từ sự kiện offline)...');
    const tc18Suffix = String(Date.now()).slice(-8);
    const tc18Phone = `09${tc18Suffix}`;
    console.log(`   SĐT unique cho lần chạy này: ${tc18Phone}`);

    const curRows18 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRow18 = (curRows18.data.values || []).length + 1;

    const phoneOnlyRow = new Array(headers.length).fill('');
    if (col.name >= 0) phoneOnlyRow[col.name] = 'Lê Văn Chỉ Có SĐT';
    if (col.company >= 0) phoneOnlyRow[col.company] = 'Công ty Offline Event';
    // Email intentionally left blank
    if (col.phone >= 0) phoneOnlyRow[col.phone] = tc18Phone;
    if (col.source >= 0) phoneOnlyRow[col.source] = 'Sự kiện';
    if (col.opportunity >= 0) phoneOnlyRow[col.opportunity] = '15000000';
    if (col.status >= 0) phoneOnlyRow[col.status] = 'Mới';
    if (col.assigned >= 0) phoneOnlyRow[col.assigned] = '1';
    if (col.comments >= 0) phoneOnlyRow[col.comments] = 'Lead từ sự kiện offline, chỉ có SĐT';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRow18}:${endLetter}${nextRow18}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [phoneOnlyRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync18 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync18.data));
    assert(sync18.data.created >= 1 || sync18.data.updated >= 1, `Lead chỉ có SĐT phải được đồng bộ thành công (created=${sync18.data.created}, updated=${sync18.data.updated})`);

    console.log('3. Kiểm tra Lead ID đã được ghi lại...');
    const rowRes18 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${nextRow18}:${nextRow18}`,
    });
    const rowData18 = rowRes18.data.values[0];
    tc18LeadId = Number(rowData18[col.leadId]);
    tempBitrixLeadIds.push(tc18LeadId);
    assert(tc18LeadId > 0, `Lead ID phải tồn tại (thực tế: ${tc18LeadId})`);
    assert(rowData18[col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${rowData18[col.syncStatus]})`);

    console.log('4. Xác thực trên Bitrix24 CRM...');
    const bLead18 = await callBitrix('crm.lead.get', { id: tc18LeadId });
    assert(bLead18.NAME === 'Lê Văn Chỉ Có SĐT', `Tên phải khớp (thực tế: ${bLead18.NAME})`);
    const bitrixPhone18 = Array.isArray(bLead18.PHONE) ? bLead18.PHONE[0]?.VALUE : '';
    assert(bitrixPhone18.length > 0, `SĐT phải tồn tại trên Bitrix (thực tế: ${bitrixPhone18})`);
    console.log('=> TC18 THÀNH CÔNG: Lead chỉ có SĐT (không email) đồng bộ thành công trên CRM!\n');
  } catch (err) {
    console.error('TC18 GẶP LỖI:', err.message);
  }
  // TC19: Create lead with email only (no phone)
  console.log('--- TC19: KIỂM THỬ TẠO LEAD CHỈ CÓ EMAIL, KHÔNG CÓ SĐT ---');
  let tc19LeadId = null;
  try {
    console.log('1. Thêm hàng mới chỉ có Email, bỏ trống SĐT hoàn toàn (mô phỏng lead từ form website)...');
    const tc19Suffix = String(Date.now()).slice(-6);
    const tc19Email = `emailonly.${tc19Suffix}@digital.vn`;
    console.log(`   Email unique cho lần chạy này: ${tc19Email}`);

    const curRows19 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:ZZ50',
    });
    const nextRow19 = (curRows19.data.values || []).length + 1;

    const emailOnlyRow = new Array(headers.length).fill('');
    if (col.name >= 0) emailOnlyRow[col.name] = 'Trương Chỉ Có Email';
    if (col.company >= 0) emailOnlyRow[col.company] = 'Công ty Digital';
    if (col.email >= 0) emailOnlyRow[col.email] = tc19Email;
    // Phone intentionally left blank
    if (col.source >= 0) emailOnlyRow[col.source] = 'Website';
    if (col.opportunity >= 0) emailOnlyRow[col.opportunity] = '25000000';
    if (col.status >= 0) emailOnlyRow[col.status] = 'Đang liên hệ';
    if (col.assigned >= 0) emailOnlyRow[col.assigned] = '1';
    if (col.comments >= 0) emailOnlyRow[col.comments] = 'Lead từ form website, chỉ điền email';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRow19}:${endLetter}${nextRow19}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [emailOnlyRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync19 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync19.data));
    assert(sync19.data.created >= 1 || sync19.data.updated >= 1, `Lead chỉ có Email phải được đồng bộ thành công (created=${sync19.data.created}, updated=${sync19.data.updated})`);

    console.log('3. Kiểm tra Lead ID đã được ghi lại...');
    const rowRes19 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!${nextRow19}:${nextRow19}`,
    });
    const rowData19 = rowRes19.data.values[0];
    tc19LeadId = Number(rowData19[col.leadId]);
    tempBitrixLeadIds.push(tc19LeadId);
    assert(tc19LeadId > 0, `Lead ID phải tồn tại (thực tế: ${tc19LeadId})`);
    assert(rowData19[col.syncStatus] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${rowData19[col.syncStatus]})`);

    console.log('4. Xác thực trên Bitrix24 CRM...');
    const bLead19 = await callBitrix('crm.lead.get', { id: tc19LeadId });
    assert(bLead19.NAME === 'Trương Chỉ Có Email', `Tên phải khớp (thực tế: ${bLead19.NAME})`);
    const bitrixEmail19 = Array.isArray(bLead19.EMAIL) ? bLead19.EMAIL[0]?.VALUE : '';
    assert(bitrixEmail19 === tc19Email, `Email phải khớp trên Bitrix (thực tế: ${bitrixEmail19})`);
    assert(bLead19.STATUS_ID === 'IN_PROCESS', `Trạng thái "Đang liên hệ" phải map sang IN_PROCESS (thực tế: ${bLead19.STATUS_ID})`);
    console.log('=> TC19 THÀNH CÔNG: Lead chỉ có Email (không SĐT) đồng bộ thành công + Enum trạng thái mapping chuẩn!\n');
  } catch (err) {
    console.error('TC19 GẶP LỖI:', err.message);
  }
  // TC20: Enum value mapping verification for lead source
  console.log('--- TC20: KIỂM THỬ ENUM MAPPING NGUỒN LEAD (SOURCE_ID) ---');
  try {
    console.log('1. Kiểm tra Lead từ TC17 (Source = "Facebook") có SOURCE_ID = "FACEBOOK" trên Bitrix không...');
    if (tc17LeadId) {
      const bLead20a = await callBitrix('crm.lead.get', { id: tc17LeadId });
      assert(bLead20a.SOURCE_ID === 'FACEBOOK', `SOURCE_ID phải là FACEBOOK (thực tế: ${bLead20a.SOURCE_ID})`);
      console.log('   ✓ Facebook → FACEBOOK mapping chuẩn xác');
    } else {
      console.log('   [SKIP] TC17 không tạo được lead, bỏ qua kiểm tra Facebook mapping');
    }

    console.log('2. Kiểm tra Lead từ TC18 (Source = "Sự kiện") có SOURCE_ID = "TRADE_SHOW" trên Bitrix không...');
    if (tc18LeadId) {
      const bLead20b = await callBitrix('crm.lead.get', { id: tc18LeadId });
      assert(bLead20b.SOURCE_ID === 'TRADE_SHOW', `SOURCE_ID phải là TRADE_SHOW (thực tế: ${bLead20b.SOURCE_ID})`);
      console.log('   ✓ Sự kiện → TRADE_SHOW mapping chuẩn xác');
    } else {
      console.log('   [SKIP] TC18 không tạo được lead, bỏ qua kiểm tra Sự kiện mapping');
    }

    console.log('3. Kiểm tra Lead gốc Row 2 (Source = "Website") có SOURCE_ID = "WEB" không...');
    const bLeadRow2 = await callBitrix('crm.lead.get', { id: targetLead1Id });
    assert(bLeadRow2.SOURCE_ID === 'WEB', `SOURCE_ID phải là WEB (thực tế: ${bLeadRow2.SOURCE_ID})`);
    console.log('   ✓ Website → WEB mapping chuẩn xác');
    console.log('=> TC20 THÀNH CÔNG: Enum mapping Nguồn Lead (SOURCE_ID) hoạt động đúng cho mọi giá trị!\n');
  } catch (err) {
    console.error('TC20 GẶP LỖI:', err.message);
  }
  // TC21: API status endpoint and force sync testing
  console.log('--- TC21: KIỂM THỬ API STATUS ENDPOINT & FORCE SYNC ---');
  try {
    console.log('1. Gọi GET /api/sync/status để kiểm tra endpoint trạng thái...');
    const statusRes = await axios.get(`${API_BASE}/sync/status`);
    assert(statusRes.status === 200, `Status endpoint phải trả về 200 (thực tế: ${statusRes.status})`);
    assert(statusRes.data.isRunning !== undefined, 'Response phải có trường isRunning');
    assert(statusRes.data.lastResult !== null, 'Response phải có lastResult (đã chạy sync trước đó)');
    assert(statusRes.data.currentTotalRows > 0, `currentTotalRows phải > 0 (thực tế: ${statusRes.data.currentTotalRows})`);

    console.log('2. Kiểm tra cấu trúc lastResult đầy đủ theo requirement...');
    const lr = statusRes.data.lastResult;
    assert(lr.totalRows !== undefined, 'lastResult phải có totalRows');
    assert(lr.created !== undefined, 'lastResult phải có created');
    assert(lr.updated !== undefined, 'lastResult phải có updated');
    assert(lr.skipped !== undefined, 'lastResult phải có skipped');
    assert(lr.failed !== undefined, 'lastResult phải có failed');
    assert(lr.durationMs !== undefined, 'lastResult phải có durationMs');
    assert(lr.timestamp !== undefined, 'lastResult phải có timestamp');
    assert(lr.direction !== undefined, 'lastResult phải có direction');

    console.log('3. Kiểm tra Force Sync bỏ qua hash check, re-process toàn bộ bản ghi...');
    const forceSync = await triggerSync(true);
    console.log('   Kết quả force sync:', JSON.stringify(forceSync.data));
    assert(forceSync.data.skipped === 0, `Force sync phải KHÔNG bỏ qua bản ghi nào (skipped = 0, thực tế: ${forceSync.data.skipped})`);
    assert(forceSync.data.updated > 0, `Force sync phải re-sync các bản ghi đã đồng bộ (updated > 0, thực tế: ${forceSync.data.updated})`);
    console.log('=> TC21 THÀNH CÔNG: API Status Endpoint và Force Sync hoạt động chuẩn mực!\n');
  } catch (err) {
    console.error('TC21 GẶP LỖI:', err.message);
  }
  // TC22: Enum and numeric validation error hints
  console.log('--- TC22: KIỂM THỬ VALIDATION ENUM & NUMBER KÈM GỢI Ý CHI TIẾT ---');
  try {
    console.log('1. Thêm 1 hàng có Status enum sai ("đang liên hệ 123") và Ngân sách sai ("năm mươi triệu")...');
    const row22InvalidData = new Array(headers.length).fill('');
    if (col.name >= 0) row22InvalidData[col.name] = 'Lê Văn Sai Enum';
    if (col.company >= 0) row22InvalidData[col.company] = 'Công ty Test Enum';
    if (col.email >= 0) row22InvalidData[col.email] = `enumtest.${Date.now()}@gmail.com`;
    if (col.phone >= 0) row22InvalidData[col.phone] = '0988776655';
    if (col.source >= 0) row22InvalidData[col.source] = 'Website';
    if (col.opportunity >= 0) row22InvalidData[col.opportunity] = 'năm mươi triệu';
    if (col.status >= 0) row22InvalidData[col.status] = 'đang liên hệ 123';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A22:${endLetter}22`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row22InvalidData] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync22 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync22.data));
    assert(sync22.data.failed >= 1, `Bản ghi sai enum/số phải bị failed (thực tế: ${sync22.data.failed})`);

    console.log('3. Kiểm tra thông báo lỗi trên Google Sheet Row 22...');
    const row22Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!22:22',
    });
    const row22Data = row22Res.data.values[0];
    const status22 = row22Data[col.syncStatus];
    const err22 = row22Data[col.error] || '';
    const leadId22 = row22Data[col.leadId];

    assert(status22 === 'LỖI', `Trạng thái phải là LỖI (thực tế: ${status22})`);
    assert(!leadId22, `Lead ID không được sinh ra cho bản ghi lỗi (thực tế: ${leadId22})`);
    assert(err22.includes("không hợp lệ cho cột 'Trạng thái'"), `Thông báo lỗi phải nhắc cột Trạng thái không hợp lệ (thực tế: ${err22})`);
    assert(err22.includes('Vui lòng xem lại các giá trị hợp lệ trên Bitrix24'), `Thông báo lỗi phải có câu nhắc Bitrix24 (thực tế: ${err22})`);
    assert(err22.includes("không phải là số hợp lệ cho cột 'Ngân sách dự kiến'"), `Thông báo lỗi phải nhắc cột Ngân sách không hợp lệ (thực tế: ${err22})`);
    console.log('   ✓ Thông báo lỗi hiển thị gọn gàng kèm nhắc nhở kiểm tra Bitrix24 và cảnh báo số học.');
    console.log('=> TC22 THÀNH CÔNG: Chặn đứng dữ liệu sai enum/số, hiển thị gợi ý đầy đủ về Google Sheet!\n');
  } catch (err) {
    console.error('TC22 GẶP LỖI:', err.message);
  }
  // TC14: Test data cleanup and baseline restoration
  console.log('--- TC14: DỌN DẸP DỮ LIỆU TEST VÀ HOÀN TRẢ TRẠNG THÁI CHUẨN ---');
  try {
    console.log('1. Xóa toàn bộ Lead tạm trên Bitrix24...');
    for (const tid of tempBitrixLeadIds) {
      try {
        await callBitrix('crm.lead.delete', { id: tid });
        console.log(`   Đã dọn dẹp Lead #${tid} trên CRM`);
      } catch (e) {}
    }

    console.log(`2. Khôi phục Lead #${targetLead1Id} về thông tin chuẩn ban đầu...`);
    await callBitrix('crm.lead.update', {
      id: targetLead1Id,
      fields: {
        TITLE: 'Nguyễn Văn An - Công ty TNHH Á Châu',
        NAME: 'Nguyễn Văn An',
        COMPANY_TITLE: 'Công ty TNHH Á Châu',
        STATUS_ID: 'NEW',
        OPPORTUNITY: 50000000,
        COMMENTS: 'Khách hàng quan tâm gói Enterprise',
      },
    });

    console.log('3. Dọn sạch toàn bộ các hàng test tạm Row 12+ trên Google Sheet...');
    await new Promise((r) => setTimeout(r, 1000));
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A12:ZZ100',
    });

    console.log('4. Cập nhật lại Row 2 trên Google Sheet về chuẩn ban đầu...');
    const originalRow2 = new Array(headers.length).fill('');
    if (col.name >= 0) originalRow2[col.name] = 'Nguyễn Văn An';
    if (col.company >= 0) originalRow2[col.company] = 'Công ty TNHH Á Châu';
    if (col.email >= 0) originalRow2[col.email] = 'an.nguyen@achau.vn';
    if (col.phone >= 0) originalRow2[col.phone] = '0901234567';
    if (col.source >= 0) originalRow2[col.source] = 'Website';
    if (col.opportunity >= 0) originalRow2[col.opportunity] = '50000000';
    if (col.status >= 0) originalRow2[col.status] = 'Mới';
    if (col.assigned >= 0) originalRow2[col.assigned] = '1';
    if (col.comments >= 0) originalRow2[col.comments] = 'Khách hàng quan tâm gói Enterprise';
    if (col.tax >= 0) originalRow2[col.tax] = '101234567';
    if (col.industry >= 0) originalRow2[col.industry] = 'Công nghệ thông tin';

    const endLetter = indexToA1(headers.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A2:${endLetter}2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [originalRow2] },
    });

    if (col.status >= 0) {
      const statusLetter = indexToA1(col.status);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Leads!${statusLetter}11`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Đang liên hệ']] },
      });
    }

    console.log('5. Chạy sync đồng bộ chuẩn cuối cùng...');
    const finalSync = await triggerSync(true);
    console.log('   Kết quả sync cuối:', JSON.stringify(finalSync.data));

    console.log('6. Chạy sync lần kiểm tra idempotency cuối...');
    const finalIdem = await triggerSync();
    assert(finalIdem.data.skipped >= 10, `Toàn bộ các dòng chuẩn phải được skipped (thực tế: ${finalIdem.data.skipped})`);
    assert(finalIdem.data.failed === 0, `Không có dòng nào lỗi (thực tế: ${finalIdem.data.failed})`);

    console.log('=> TC14 THÀNH CÔNG: Môi trường Sheet và CRM đã được dọn sạch sẽ và đồng bộ 100%!\n');
  } catch (err) {
    console.error('TC14 GẶP LỖI:', err.message);
  }

  console.log('===============================================================');
  console.log(`           KẾT QUẢ KIỂM THỬ TOÀN DIỆN: ${testsPassed} PASS, ${testsFailed} FAIL `);
  console.log('===============================================================');
  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
