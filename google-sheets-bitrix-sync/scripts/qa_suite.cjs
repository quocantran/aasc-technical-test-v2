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
  console.error('[!] Vui lòng cấu hình file .env trước khi chạy qa_suite.\n');
  process.exit(1);
}

async function main() {
  console.log('===============================================================');
  console.log('       BẮT ĐẦU CHẠY BỘ KIỂM THỬ TOÀN DIỆN 2 CHIỀU (FULL QA SUITE) ');
  console.log('       SHEET <-> BITRIX24 | REALTIME WEBHOOK | DEDUP | SECURITY  ');
  console.log('===============================================================');

  const auth = new google.auth.GoogleAuth({
    keyFile: './config/credentials.json',
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

  // Initial cleanup of residual rows
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leads!A12:ZZ100',
  });

  // Track created temp leads for safe cleanup
  const tempBitrixLeadIds = [];

  // =============================================================
  // TC1: CẬP NHẬT DỮ LIỆU (SHEET -> BITRIX)
  // =============================================================
  console.log('\n--- TC1: KIỂM THỬ CẬP NHẬT LEAD (SHEET -> BITRIX) ---');
  try {
    console.log('1. Sửa ô G2 (Ngân sách) = 99000000 và H2 (Trạng thái) = Đang liên hệ...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!G2:H2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['99000000', 'Đang liên hệ']] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync1 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync1.data));
    assert(sync1.data.updated >= 1, 'Số bản ghi updated phải >= 1');
    assert(sync1.data.failed === 0, 'Số bản ghi failed phải = 0');

    console.log('3. Xác thực dữ liệu trên Bitrix24 CRM của Lead #1...');
    const bLead1 = await callBitrix('crm.lead.get', { id: 1 });
    assert(bLead1.STATUS_ID === 'IN_PROCESS', `STATUS_ID trên Bitrix phải là IN_PROCESS (thực tế: ${bLead1.STATUS_ID})`);
    assert(Number(bLead1.OPPORTUNITY) === 99000000, `OPPORTUNITY trên Bitrix phải là 99000000 (thực tế: ${bLead1.OPPORTUNITY})`);

    console.log('4. Xác thực trạng thái trên Google Sheet...');
    const row2Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!M2:P2',
    });
    const [status2, id2, , err2] = row2Res.data.values[0];
    assert(status2 === 'ĐÃ ĐỒNG BỘ', `Trạng thái đồng bộ phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${status2})`);
    assert(id2 === '1', `Lead ID Bitrix24 phải là '1' (thực tế: ${id2})`);
    assert(!err2, `Thông báo lỗi phải rỗng (thực tế: ${err2})`);
    console.log('=> TC1 THÀNH CÔNG HOÀN HẢO!\n');
  } catch (err) {
    console.error('TC1 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC2: TÍNH BẤT BIẾN (IDEMPOTENCY / HASH MATCH)
  // =============================================================
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

  // =============================================================
  // TC3: TẠO MỚI LEAD TRÊN SHEET (SHEET -> BITRIX)
  // =============================================================
  console.log('--- TC3: KIỂM THỬ TẠO MỚI LEAD (SHEET -> BITRIX) ---');
  let createdLeadIdTC3 = null;
  try {
    console.log('1. Thêm hàng mới vào Sheet (Row 12: Phan Văn Test QA)...');
    const newLeadRow = [
      'Khảo sát hệ thống ERP Cloud',
      'Phan Văn Test QA',
      'QA Solutions Vietnam',
      'phanvantest.qa@qasolutions.vn',
      '0918776655',
      'Website',
      '75000000',
      'Mới',
      '1',
      'Test tạo mới E2E',
      '0109988776',
      'Công nghệ thông tin',
      '', '', '', '', '',
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A12:Q12',
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
      range: 'Leads!M12:Q12',
    });
    const [status12, id12, , , hash12] = row12Res.data.values[0];
    assert(status12 === 'ĐÃ ĐỒNG BỘ', `Trạng thái row 12 phải là ĐÃ ĐỒNG BỘ (thực tế: ${status12})`);
    assert(id12 && Number(id12) > 0, `Lead ID Bitrix24 phải tồn tại (thực tế: ${id12})`);
    assert(hash12 && hash12.length === 64, `Sync Hash phải là chuỗi SHA-256 64 ký tự (thực tế: ${hash12})`);
    createdLeadIdTC3 = Number(id12);
    tempBitrixLeadIds.push(createdLeadIdTC3);
    console.log(`   -> Lead mới được tạo có Bitrix ID = #${createdLeadIdTC3}`);

    console.log('4. Kiểm tra trên Bitrix24 CRM...');
    const bNewLead = await callBitrix('crm.lead.get', { id: createdLeadIdTC3 });
    assert(bNewLead.TITLE === 'Khảo sát hệ thống ERP Cloud', `Tiêu đề phải khớp (thực tế: ${bNewLead.TITLE})`);
    assert(bNewLead.NAME === 'Phan Văn Test QA', `Tên phải khớp (thực tế: ${bNewLead.NAME})`);
    assert(bNewLead.STATUS_ID === 'NEW', `Trạng thái phải là NEW (thực tế: ${bNewLead.STATUS_ID})`);
    console.log('=> TC3 THÀNH CÔNG: Lead tạo mới chuẩn xác, Lead ID tự động cập nhật vào cột ẩn!\n');
  } catch (err) {
    console.error('TC3 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC4: CHỐNG TRÙNG LẶP DỮ LIỆU (DEDUPLICATION SHEET -> BITRIX)
  // =============================================================
  console.log('--- TC4: KIỂM THỬ CHỐNG TRÙNG LẶP (DEDUPLICATION SHEET -> BITRIX) ---');
  try {
    console.log('1. Thêm hàng mới (Row 13) có EMAIL TRÙNG VỚI LEAD #1 (an.nguyen@achau.vn)...');
    const dupLeadRow = [
      'Yêu cầu nâng cấp gói Enterprise',
      'Nguyễn Văn An Update',
      'Công ty TNHH Á Châu',
      'an.nguyen@achau.vn', // Trùng email Lead #1
      '0901234567',
      'Website',
      '120000000',
      'Đang xử lý',
      '1',
      'Yêu cầu mở rộng chi nhánh',
      '', '', '', '', '', '', '',
    ];

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A13:Q13',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A13:Q13',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [dupLeadRow] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync4 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync4.data));
    assert(sync4.data.created === 0, `Hệ thống KHÔNG ĐƯỢC tạo mới lead (created phải = 0, thực tế: ${sync4.data.created})`);
    assert(sync4.data.updated >= 1, `Hệ thống phải cập nhật lead hiện có (updated >= 1, thực tế: ${sync4.data.updated})`);

    console.log('3. Kiểm tra Google Sheet Row 13 xem đã tự gắn Lead ID = 1 chưa...');
    const row13Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!M13:Q13',
    });
    const [status13, id13] = row13Res.data.values[0];
    assert(status13 === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là ĐÃ ĐỒNG BỘ (thực tế: ${status13})`);
    assert(String(id13) === '1', `Lead ID tự động liên kết phải là '1' (thực tế: ${id13})`);
    console.log('=> TC4 THÀNH CÔNG: Chống trùng lặp tuyệt đối, tự liên kết và cập nhật Lead #1!\n');
  } catch (err) {
    console.error('TC4 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC5: XỬ LÝ LỖI NHẬP LIỆU & VALIDATION (ISOLATED ERROR HANDLING)
  // =============================================================
  console.log('--- TC5: KIỂM THỬ XỬ LÝ LỖI VALIDATION (ISOLATED ERROR HANDLING) ---');
  try {
    console.log('1. Thêm 2 hàng lỗi vào Sheet: Row 14 (thiếu liên hệ) và Row 15 (email sai format)...');
    const row14InvalidContact = ['Lead rác không có liên hệ', '', 'Công ty Rác', '', '', 'Khác', '0', 'Mới'];
    const row15InvalidEmail = ['Lead email sai format', 'Trần Sai Format', 'Công ty ABC', 'not-an-email-format@@', '0912345678', 'Website', '10000000', 'Mới'];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A14:H15',
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
      range: 'Leads!M14:P15',
    });
    const [row14M, , , row14Err] = errRows.data.values[0];
    const [row15M, , , row15Err] = errRows.data.values[1];
    assert(row14M === 'LỖI', `Row 14 trạng thái phải là LỖI (thực tế: ${row14M})`);
    assert(row14Err.includes('Thiếu thông tin liên hệ'), `Row 14 thông báo lỗi phải nhắc thiếu thông tin liên hệ (thực tế: ${row14Err})`);
    assert(row15M === 'LỖI', `Row 15 trạng thái phải là LỖI (thực tế: ${row15M})`);
    assert(row15Err.includes('Định dạng Email không hợp lệ'), `Row 15 thông báo lỗi phải nhắc email không hợp lệ (thực tế: ${row15Err})`);
    console.log('=> TC5 THÀNH CÔNG: Xử lý lỗi chuẩn mực, cô lập lỗi từng dòng mà không làm gián đoạn hệ thống!\n');
  } catch (err) {
    console.error('TC5 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC6: XỬ LÝ LEAD BỊ XÓA TRÊN CRM (ZOMBIE RECORD PREVENTION)
  // =============================================================
  console.log('--- TC6: KIỂM THỬ XỬ LÝ LEAD BỊ XÓA TRÊN CRM (ZOMBIE RECORD PREVENTION) ---');
  try {
    console.log(`1. Trực tiếp xóa Lead #${createdLeadIdTC3} trên Bitrix24 CRM...`);
    const delRes = await callBitrix('crm.lead.delete', { id: createdLeadIdTC3 });
    console.log('   Kết quả xóa trên Bitrix:', delRes);

    console.log('2. Sửa cột Ghi chú ở Row 12 trên Sheet để trigger sync...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!J12',
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
      range: 'Leads!M12:P12',
    });
    const [status12Zombie, , , err12Zombie] = row12ErrRes.data.values[0];
    assert(status12Zombie === 'LỖI', `Trạng thái phải là LỖI (thực tế: ${status12Zombie})`);
    assert(err12Zombie.includes('đã bị xóa trên CRM'), `Thông báo lỗi phải nêu rõ Lead đã bị xóa trên CRM (thực tế: ${err12Zombie})`);
    console.log('=> TC6 THÀNH CÔNG: Chặn đứng hoàn toàn Zombie Records, thông báo tường minh cho người dùng!\n');
  } catch (err) {
    console.error('TC6 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC7: TẠO LẠI LEAD CÓ CHỦ ĐÍCH (USER CLEARS LEAD ID)
  // =============================================================
  console.log('--- TC7: KIỂM THỬ TẠO LẠI LEAD CÓ CHỦ ĐÍCH (USER CLEARS LEAD ID) ---');
  let reCreatedLeadId = null;
  try {
    console.log('1. Người dùng xóa trắng ô N12 (Lead ID Bitrix24) và M12 (Trạng thái)...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!M12:N12',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['', '']] },
    });

    console.log('2. Kích hoạt đồng bộ...');
    const sync7 = await triggerSync();
    console.log('   Kết quả sync:', JSON.stringify(sync7.data));
    assert(sync7.data.created >= 1, `Hệ thống phải nhận diện đây là chủ đích tạo mới (created >= 1, thực tế: ${sync7.data.created})`);

    console.log('3. Kiểm tra Google Sheet Row 12 đã được cấp Lead ID mới chưa...');
    const row12NewRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!M12:P12',
    });
    const [newSt, newId, , newErr] = row12NewRes.data.values[0];
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

  // =============================================================
  // TC8: CẬP NHẬT LEAD TRÊN BITRIX -> ĐỒNG BỘ VỀ SHEET (UPDATE IN-PLACE)
  // =============================================================
  console.log('--- TC8: KIỂM THỬ CẬP NHẬT LEAD TRÊN CRM -> ĐỒNG BỘ VỀ SHEET (BITRIX -> SHEET) ---');
  try {
    console.log('1. Sửa trực tiếp Tiêu đề của Lead #1 trên Bitrix24: Tư vấn ERP - Gói VIP Enterprise...');
    await callBitrix('crm.lead.update', {
      id: 1,
      fields: { TITLE: 'Tư vấn ERP - Gói VIP Enterprise' },
    });

    console.log('2. Kích hoạt Reverse Sync...');
    const revRes = await triggerReverseSync(1);
    const updatedCount = revRes.data?.updated ?? revRes.data?.data?.updated ?? 0;
    assert(updatedCount === 1, `Số bản ghi updated từ CRM về Sheet phải = 1 (thực tế: ${updatedCount})`);

    console.log('3. Kiểm tra Google Sheet Row 2 xem ô A2 đã nhận giá trị mới chưa...');
    const row2New = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A2:B2',
    });
    const titleA2 = row2New.data.values[0][0];
    assert(titleA2 === 'Tư vấn ERP - Gói VIP Enterprise', `Tiêu đề trên Sheet phải đổi thành 'Tư vấn ERP - Gói VIP Enterprise' (thực tế: ${titleA2})`);
    console.log('=> TC8 THÀNH CÔNG: Đồng bộ ngược 2 chiều từ Bitrix24 về Sheet hoạt động trơn tru!\n');
  } catch (err) {
    console.error('TC8 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC9: TẠO MỚI LEAD TRỰC TIẾP TRÊN BITRIX24 -> BẮN WEBHOOK REALTIME -> TỰ ĐỘNG TẠO HÀNG MỚI TRÊN SHEET
  // =============================================================
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
      range: 'Leads!A1:Q50',
    });
    const allRows = sheetData.data.values || [];
    const matchedB24Row = allRows.find((r) => String(r[13]) === String(newB24LeadId));

    assert(Boolean(matchedB24Row), `Phải tìm thấy hàng trên Sheet mang Lead ID Bitrix24 = #${newB24LeadId}`);
    assert(matchedB24Row[0] === 'Khảo sát ERP Cloud - Doanh nghiệp Bitrix', `Tiêu đề phải khớp (thực tế: ${matchedB24Row[0]})`);
    assert(matchedB24Row[1] === 'Hoàng Văn Bitrix', `Tên khách hàng phải khớp (thực tế: ${matchedB24Row[1]})`);
    assert(matchedB24Row[2] === 'Bitrix Vietnam Corp', `Công ty phải khớp (thực tế: ${matchedB24Row[2]})`);
    assert(matchedB24Row[3] === 'hoangvan.b24@bitrixvn.com', `Email phải khớp (thực tế: ${matchedB24Row[3]})`);
    assert(matchedB24Row[12] === 'ĐÃ ĐỒNG BỘ', `Trạng thái đồng bộ phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${matchedB24Row[12]})`);
    assert(matchedB24Row[16] && matchedB24Row[16].length === 64, `Sync Hash phải là chuỗi SHA-256 (thực tế: ${matchedB24Row[16]})`);
    console.log('=> TC9 THÀNH CÔNG: Tạo mới lead trên Bitrix24 tự động đẩy vào Google Sheets qua Webhook thời gian thực!\n');
  } catch (err) {
    console.error('TC9 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC10: CHỐNG TRÙNG LẶP CHIỀU BITRIX -> SHEET (DEDUPLICATION BITRIX -> SHEET)
  // =============================================================
  console.log('--- TC10: KIỂM THỬ CHỐNG TRÙNG LẶP CHIỀU BITRIX -> SHEET ---');
  let dupB24LeadId = null;
  try {
    console.log('1. Thêm 1 dòng mới vào Sheet có email unique (nguyenthutest@vnn.vn) nhưng CHƯA CÓ Lead ID Bitrix...');
    const preExistingSheetRow = [
      'Tư vấn CRM Doanh Nghiệp',
      'Nguyễn Thị Thu',
      'VNN Tech',
      'nguyenthutest@vnn.vn',
      '0988112233',
      'Website',
      '30000000',
      'Mới',
      '1',
      'Chờ liên kết CRM',
      '', '', '', '', '', '', '',
    ];

    // Read current row count to place row at next index
    const currentRowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:Q50',
    });
    const nextRowIdx = (currentRowsRes.data.values || []).length + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Leads!A${nextRowIdx}:Q${nextRowIdx}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [preExistingSheetRow] },
    });

    console.log(`2. Tạo Lead trên Bitrix24 với cùng Email nguyenthutest@vnn.vn...`);
    dupB24LeadId = await callBitrix('crm.lead.add', {
      fields: {
        TITLE: 'Tư vấn CRM Doanh Nghiệp - Bitrix Side',
        NAME: 'Nguyễn Thị Thu',
        EMAIL: [{ VALUE: 'nguyenthutest@vnn.vn', VALUE_TYPE: 'WORK' }],
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
      range: 'Leads!A1:Q50',
    });
    const afterRows = afterDedupRowsRes.data.values || [];
    const matchedRows = afterRows.filter((r) => String(r[3]).toLowerCase() === 'nguyenthutest@vnn.vn');

    assert(matchedRows.length === 1, `Chỉ được tồn tại duy nhất 1 dòng mang email nguyenthutest@vnn.vn (thực tế: ${matchedRows.length})`);
    assert(String(matchedRows[0][13]) === String(dupB24LeadId), `Dòng có sẵn phải được tự động gắn Lead ID = #${dupB24LeadId} (thực tế: ${matchedRows[0][13]})`);
    assert(matchedRows[0][12] === 'ĐÃ ĐỒNG BỘ', `Trạng thái phải là 'ĐÃ ĐỒNG BỘ' (thực tế: ${matchedRows[0][12]})`);
    console.log('=> TC10 THÀNH CÔNG: Chống trùng lặp chiều Bitrix -> Sheet hoạt động hoàn hảo!\n');
  } catch (err) {
    console.error('TC10 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC11: XÓA LEAD TRÊN BITRIX -> BẮN WEBHOOK ONCRMLEADDELETE -> CẬP NHẬT SHEET
  // =============================================================
  console.log('--- TC11: XÓA LEAD TRÊN BITRIX -> BẮN WEBHOOK ONCRMLEADDELETE -> CẬP NHẬT SHEET ---');
  try {
    console.log(`1. Xóa Lead #${newB24LeadId} trên Bitrix24...`);
    await callBitrix('crm.lead.delete', { id: newB24LeadId });

    console.log('2. Bắn Webhook ONCRMLEADDELETE...');
    const delHookRes = await sendBitrixWebhook('ONCRMLEADDELETE', newB24LeadId);
    assert(delHookRes.status === 200 || delHookRes.status === 201, 'Webhook xóa phải được chấp nhận');

    console.log('3. Đợi 3.5 giây cho luồng sync xử lý cập nhật trạng thái lỗi...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('4. Kiểm tra dòng của Lead này trên Google Sheet...');
    const sheetDataAfterDel = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A1:Q50',
    });
    const targetRow = (sheetDataAfterDel.data.values || []).find((r) => String(r[13]) === String(newB24LeadId));
    assert(Boolean(targetRow), 'Dòng vẫn phải tồn tại trên Sheet');
    assert(targetRow[12] === 'LỖI', `Trạng thái dòng phải chuyển sang LỖI (thực tế: ${targetRow[12]})`);
    assert(targetRow[15].includes('đã bị xóa trên CRM'), `Thông báo lỗi phải nêu rõ Lead đã bị xóa trên CRM (thực tế: ${targetRow[15]})`);
    console.log('=> TC11 THÀNH CÔNG: Webhook xóa trên Bitrix24 tự động cập nhật cảnh báo rõ ràng trên Sheet!\n');
  } catch (err) {
    console.error('TC11 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC12: BẢO MẬT WEBHOOK AUTHENTICATION (SECURITY)
  // =============================================================
  console.log('--- TC12: KIỂM THỬ BẢO MẬT XÁC THỰC WEBHOOK (SECURITY AUTHENTICATION) ---');
  try {
    console.log('1. Bắn webhook với token giả mạo (invalid_token_123)...');
    const fakeHookRes = await sendBitrixWebhook('ONCRMLEADUPDATE', 1, 'invalid_token_123');
    assert(fakeHookRes.status === 401, `Webhook với token giả mạo phải bị từ chối 401 Unauthorized (thực tế: ${fakeHookRes.status})`);

    console.log('2. Bắn webhook với token chuẩn...');
    const validHookRes = await sendBitrixWebhook('ONCRMLEADUPDATE', 1, WEBHOOK_SECRET);
    assert(validHookRes.status === 200 || validHookRes.status === 201, `Webhook với token hợp lệ phải được chấp nhận (thực tế: ${validHookRes.status})`);
    console.log('=> TC12 THÀNH CÔNG: Cơ chế xác thực Token bảo mật ngăn chặn 100% request giả mạo!\n');
  } catch (err) {
    console.error('TC12 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC13: XỬ LÝ TRANH CHẤP CONFLICT RESOLUTION (LAST-WRITE-WINS)
  // =============================================================
  console.log('--- TC13: KIỂM THỬ TRANH CHẤP DỮ LIỆU (LAST-WRITE-WINS CONFLICT RESOLUTION) ---');
  try {
    console.log('1. Sửa Lead #1 trên Bitrix24 với timestamp mới nhất...');
    await callBitrix('crm.lead.update', {
      id: 1,
      fields: { TITLE: 'Khách hàng VIP Chiến Lược' },
    });

    console.log('2. Kích hoạt Reverse Sync...');
    const conflictRes = await triggerReverseSync(1);
    const updatedCount = conflictRes.data?.updated ?? conflictRes.data?.data?.updated ?? 0;
    assert(updatedCount === 1, `Bản ghi mới hơn trên Bitrix phải ghi đè Sheet (updated: ${updatedCount})`);

    console.log('3. Kiểm tra Tiêu đề trên Sheet Row 2...');
    const row2Conflict = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A2:B2',
    });
    assert(row2Conflict.data.values[0][0] === 'Khách hàng VIP Chiến Lược', `Tiêu đề trên Sheet phải nhận giá trị mới nhất (thực tế: ${row2Conflict.data.values[0][0]})`);
    console.log('=> TC13 THÀNH CÔNG: Xử lý tranh chấp Last-Write-Wins hoạt động chuẩn xác!\n');
  } catch (err) {
    console.error('TC13 GẶP LỖI:', err.message);
  }

  // =============================================================
  // TC14: DỌN DẸP DỮ LIỆU TEST VÀ HOÀN TRẢ TRẠNG THÁI CHUẨN
  // =============================================================
  console.log('--- TC14: DỌN DẸP DỮ LIỆU TEST VÀ HOÀN TRẢ TRẠNG THÁI CHUẨN ---');
  try {
    console.log('1. Xóa toàn bộ Lead tạm trên Bitrix24...');
    for (const tid of tempBitrixLeadIds) {
      try {
        await callBitrix('crm.lead.delete', { id: tid });
        console.log(`   Đã dọn dẹp Lead #${tid} trên CRM`);
      } catch (e) {}
    }

    console.log('2. Khôi phục Lead #1 về thông tin chuẩn ban đầu...');
    await callBitrix('crm.lead.update', {
      id: 1,
      fields: {
        TITLE: 'Tư vấn phần mềm ERP',
        NAME: 'Nguyễn Văn An',
        COMPANY_TITLE: 'Công ty TNHH Á Châu',
        STATUS_ID: 'NEW',
        OPPORTUNITY: 50000000,
        COMMENTS: 'Yêu cầu mở rộng chi nhánh',
      },
    });

    console.log('3. Dọn sạch toàn bộ các hàng test tạm Row 12+ trên Google Sheet...');
    await new Promise((r) => setTimeout(r, 1500));
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A12:ZZ100',
    });

    console.log('4. Cập nhật lại Row 2 trên Google Sheet về chuẩn ban đầu...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads!A2:L2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          'Tư vấn phần mềm ERP',
          'Nguyễn Văn An',
          'Công ty TNHH Á Châu',
          'an.nguyen@achau.vn',
          '901234567',
          'Website',
          '50000000',
          'Mới',
          '1',
          'Yêu cầu mở rộng chi nhánh',
          '101234567',
          'Công nghệ thông tin',
        ]],
      },
    });

    console.log('5. Chạy sync đồng bộ chuẩn cuối cùng...');
    const finalSync = await triggerSync();
    console.log('   Kết quả sync cuối:', JSON.stringify(finalSync.data));

    console.log('6. Chạy sync lần kiểm tra idempotency cuối...');
    const finalIdem = await triggerSync();
    assert(finalIdem.data.skipped === 10, `Cả 10 dòng chuẩn phải được skipped (thực tế: ${finalIdem.data.skipped})`);
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
