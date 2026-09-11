/**
 * Google Sheets <-> Bitrix24 Management Dashboard Controller
 * Clean, efficient, and deduplicated field mapping management
 */

// Shared constants for UI mappings and intervals
const DEFAULT_STATUS_MAPPINGS = {
  'Mới': 'NEW',
  'Chưa xử lý': 'NEW',
  'Chưa giao người xử lý': 'NEW',
  'Đang liên hệ': 'IN_PROCESS',
  'Đang xử lý': 'IN_PROCESS',
  'Trong tiến trình': 'IN_PROCESS',
  'Đã xử lý': 'PROCESSED',
  'Hoàn thành': 'CONVERTED',
  'Thành công': 'CONVERTED',
  'Khách hàng tiềm năng tốt': 'CONVERTED',
  'Không tiềm năng': 'JUNK',
  'Khách hàng tiềm năng kém chất lượng': 'JUNK',
};

const DEFAULT_SOURCE_MAPPINGS = {
  'Cuộc gọi': 'CALL',
  'Call': 'CALL',
  'Website': 'WEB',
  'Email': 'EMAIL',
  'E-mail': 'EMAIL',
  'Facebook': 'FACEBOOK',
  'Quảng cáo': 'ADVERTISING',
  'Đối tác': 'PARTNER',
  'Khách hàng Hiện có': 'PARTNER',
  'Sự kiện': 'TRADE_SHOW',
  'Hiển thị/Trưng bày': 'TRADE_SHOW',
  'Giới thiệu': 'RECOMMENDATION',
  'Theo Khuyến nghị': 'RECOMMENDATION',
  'Biểu mẫu CRM': 'WEBFORM',
  'Gọi lại': 'CALLBACK',
  'Tăng cường doanh số': 'RC_GENERATOR',
  'Cửa hàng Trực tuyến': 'STORE',
  'Đặt chỗ': 'BOOKING',
  'Bán hàng lặp lại': 'REPEAT_SALE',
  'Khác': 'OTHER',
};

const SYNC_STATUS_POLL_INTERVAL_MS = 30000;
const ALERT_DISMISS_DELAY_MS = 6000;
const MAX_HISTORY_LOGS_QUERY = 20;

let availableBitrixFields = [];
let bitrixFieldsMap = new Map();
let currentMappingConfig = { fields: [] };

// Fetches Bitrix Lead fields catalog from server
async function loadBitrixFields() {
  const select = document.getElementById('mapBitrixField');
  if (!select) return;

  try {
    const res = await fetch('/api/bitrix/lead-fields');
    const json = await res.json();

    if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
      availableBitrixFields = json.data;
      bitrixFieldsMap.clear();

      for (const field of availableBitrixFields) {
        bitrixFieldsMap.set(field.field, field);
      }

      renderBitrixFieldSelect();
    }
  } catch (err) {
    console.error('Failed to load Bitrix24 fields:', err);
    select.innerHTML = '<option value="">(Lỗi tải danh mục trường, vui lòng làm mới)</option>';
  }
}

// Renders Bitrix field selector with only unmapped fields and valid categories
function renderBitrixFieldSelect() {
  const select = document.getElementById('mapBitrixField');
  if (!select) return;

  // Set of currently mapped Bitrix fields
  const mappedBitrixFields = new Set(
    (currentMappingConfig.fields || []).map((f) => f.bitrixField),
  );

  // Filters out already mapped fields and uncategorized groups
  const unmappedFields = availableBitrixFields.filter((f) => {
    // Skip fields already present in mapping
    if (mappedBitrixFields.has(f.field)) return false;

    // Exclude other or internal field groups
    const group = (f.group || '').trim().toLowerCase();
    if (group.includes('khác') || group.includes('other')) return false;

    return true;
  });

  select.innerHTML = '<option value="">-- Chọn trường Bitrix24 CRM --</option>';

  // Groups unmapped fields by category
  const grouped = {};
  for (const f of unmappedFields) {
    const gName = f.group || 'Thông tin chung';
    if (!grouped[gName]) grouped[gName] = [];
    grouped[gName].push(f);
  }

  for (const [groupName, fields] of Object.entries(grouped)) {
    if (!fields || fields.length === 0) continue;
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupName;

    for (const f of fields) {
      const opt = document.createElement('option');
      opt.value = f.field;
      const reqStar = f.isRequired ? ' *' : '';
      opt.textContent = `${f.label || f.field} [${f.field}]${reqStar}`;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }

  // Option for custom user fields (UF_CRM_*)
  const customGroup = document.createElement('optgroup');
  customGroup.label = 'Trường tùy biến';
  const customOpt = document.createElement('option');
  customOpt.value = '__CUSTOM__';
  customOpt.textContent = '+ Nhập mã trường tùy biến (UF_CRM_...)';
  customGroup.appendChild(customOpt);
  select.appendChild(customGroup);

  if (unmappedFields.length === 0) {
    const infoOpt = document.createElement('option');
    infoOpt.disabled = true;
    infoOpt.textContent = '(Tất cả trường CRM chuẩn đã được ánh xạ)';
    select.appendChild(infoOpt);
  }
}

// Automatically updates field types and defaults upon selection
function onBitrixFieldChange() {
  const select = document.getElementById('mapBitrixField');
  const customGroup = document.getElementById('customFieldGroup');
  const typeSelect = document.getElementById('mapType');
  const defaultInput = document.getElementById('mapDefault');

  const selectedValue = select.value;

  if (selectedValue === '__CUSTOM__') {
    customGroup.style.display = 'block';
    typeSelect.value = 'string';
    return;
  }

  customGroup.style.display = 'none';
  if (!selectedValue) return;

  const meta = bitrixFieldsMap.get(selectedValue);
  if (!meta) return;

  if (meta.type) {
    typeSelect.value = meta.type;
  }

  if (meta.defaultValue !== undefined && !defaultInput.value) {
    defaultInput.value = meta.defaultValue;
  }
}

// Fetches sync metrics and updates dashboard cards
async function fetchStatus() {
  try {
    const res = await fetch('/api/sync/status');
    const json = await res.json();

    const displayTotal = json.currentTotalRows !== undefined ? json.currentTotalRows : json.lastResult?.totalRows;
    if (displayTotal !== undefined && displayTotal !== null) {
      document.getElementById('statTotalRows').innerText = displayTotal;
    }

    if (json.lastResult) {
      const { created = 0, updated = 0, skipped = 0, failed = 0, durationMs = 0, timestamp } = json.lastResult;

      document.getElementById('statCreated').innerText = created;
      document.getElementById('statUpdated').innerText = updated;
      document.getElementById('statSkipped').innerText = skipped;
      document.getElementById('statFailed').innerText = failed;

      if (timestamp) {
        const timeFormatted = new Date(timestamp).toLocaleString('vi-VN');
        document.getElementById('metaLastRun').innerText = `Lần chạy gần nhất: ${timeFormatted}`;
      }
      if (durationMs !== undefined) {
        document.getElementById('metaDuration').innerText = `Thời lượng: ${durationMs}ms`;
      }
    }

    await fetchLogs();
    await checkGoogleAuthStatus();
  } catch (error) {
    console.error('Failed to fetch sync status:', error);
  }
}

// Triggers forward sync from Google Sheets to Bitrix24 CRM
async function triggerSync() {
  const btn = document.getElementById('btnTriggerSync');
  const force = false;

  btn.disabled = true;
  btn.innerText = '⏳ Đang đồng bộ...';
  showAlert('info', 'Tiến trình đồng bộ đang chạy, vui lòng chờ...');

  try {
    const res = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();

    if (data.status === 'success') {
      const { totalRows = 0, created = 0, updated = 0, skipped = 0, failed = 0, durationMs = 0 } = data.data || {};
      if (totalRows !== undefined) document.getElementById('statTotalRows').innerText = totalRows;
      document.getElementById('statCreated').innerText = created;
      document.getElementById('statUpdated').innerText = updated;
      document.getElementById('statSkipped').innerText = skipped;
      document.getElementById('statFailed').innerText = failed;

      document.getElementById('metaDuration').innerText = `Thời lượng: ${durationMs}ms`;
      document.getElementById('metaLastRun').innerText = `Lần chạy gần nhất: ${new Date().toLocaleString('vi-VN')}`;

      showAlert(
        'success',
        `Hoàn tất: Tạo mới ${created}, Cập nhật ${updated}, Giữ nguyên ${skipped}, Lỗi ${failed}.`,
      );
    } else {
      showAlert('error', data.message || 'Tiến trình đồng bộ trả về cảnh báo');
    }
  } catch (error) {
    showAlert('error', `Lỗi kết nối: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '▶ Đồng bộ sang CRM';
    await fetchStatus();
  }
}

// Triggers reverse sync from Bitrix24 to Google Sheets
async function triggerTwoWay() {
  const btn = document.getElementById('btnTriggerTwoWay');

  btn.disabled = true;
  btn.innerText = '⏳ Đang kéo dữ liệu...';
  showAlert('info', 'Đang đọc dữ liệu từ Bitrix24 để cập nhật về Google Sheets...');

  try {
    const res = await fetch('/api/sync/two-way', { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success') {
      const { totalRows = 0, created = 0, updated = 0, skipped = 0, failed = 0, durationMs = 0 } = data.data || {};
      if (totalRows !== undefined) document.getElementById('statTotalRows').innerText = totalRows;
      document.getElementById('statCreated').innerText = created;
      document.getElementById('statUpdated').innerText = updated;
      document.getElementById('statSkipped').innerText = skipped;
      document.getElementById('statFailed').innerText = failed;

      document.getElementById('metaDuration').innerText = `Thời lượng: ${durationMs}ms`;
      document.getElementById('metaLastRun').innerText = `Lần chạy gần nhất: ${new Date().toLocaleString('vi-VN')}`;

      showAlert(
        'success',
        `Hoàn tất kéo dữ liệu: Bổ sung ${created} dòng mới, Cập nhật ${updated} dòng.`,
      );
    } else {
      showAlert('error', data.message || 'Lỗi khi thực hiện kéo dữ liệu về Google Sheets');
    }
  } catch (error) {
    showAlert('error', `Lỗi kết nối: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '🔄 Kéo dữ liệu về Sheet';
    await fetchStatus();
  }
}

// Toggles mapping rule creation form visibility
function toggleMappingForm(forceState) {
  const container = document.getElementById('mappingFormContainer');
  if (!container) return;

  if (typeof forceState === 'boolean') {
    container.style.display = forceState ? 'block' : 'none';
  } else {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  }

  if (container.style.display === 'block') {
    renderBitrixFieldSelect();
    document.getElementById('mapSheetCol')?.focus();
  }
}

// Persists a newly configured mapping rule to backend
async function saveNewMappingRule() {
  const sheetCol = document.getElementById('mapSheetCol').value.trim();
  const bitrixFieldSelect = document.getElementById('mapBitrixField').value.trim();
  const customFieldName = document.getElementById('mapCustomFieldName')?.value.trim();
  const type = document.getElementById('mapType').value;
  const defVal = document.getElementById('mapDefault').value.trim();

  if (!sheetCol) {
    showAlert('error', 'Vui lòng nhập tên cột trên Google Sheets!');
    document.getElementById('mapSheetCol')?.focus();
    return;
  }

  let finalBitrixField = bitrixFieldSelect;
  if (bitrixFieldSelect === '__CUSTOM__') {
    if (!customFieldName) {
      showAlert('error', 'Vui lòng nhập mã trường tùy biến (ví dụ: UF_CRM_TAX_ID)!');
      document.getElementById('mapCustomFieldName')?.focus();
      return;
    }
    finalBitrixField = customFieldName;
  }

  if (!finalBitrixField) {
    showAlert('error', 'Vui lòng chọn trường Bitrix24 CRM!');
    document.getElementById('mapBitrixField')?.focus();
    return;
  }

  // Prevents creating duplicate rules for the same Bitrix field
  const alreadyMapped = currentMappingConfig.fields.some(
    (f) => f.bitrixField.toUpperCase() === finalBitrixField.toUpperCase(),
  );
  if (alreadyMapped) {
    showAlert('error', `Trường CRM "${finalBitrixField}" đã được cấu hình trong bảng quy tắc!`);
    return;
  }

  const newField = {
    sheetColumn: sheetCol,
    bitrixField: finalBitrixField,
    type: type,
  };

  if (defVal) newField.defaultValue = defVal;
  if (type === 'multifield') newField.valueType = 'WORK';

  // Automatically sets enum value mappings for standard status and source fields
  if (finalBitrixField === 'STATUS_ID') {
    newField.type = 'enum';
    newField.valueMapping = { ...DEFAULT_STATUS_MAPPINGS };
    if (!defVal) newField.defaultValue = 'NEW';
  } else if (finalBitrixField === 'SOURCE_ID') {
    newField.type = 'enum';
    newField.valueMapping = { ...DEFAULT_SOURCE_MAPPINGS };
    if (!defVal) newField.defaultValue = 'OTHER';
  }

  currentMappingConfig.fields.push(newField);

  try {
    const res = await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentMappingConfig),
    });
    const result = await res.json();
    if (result.status === 'success') {
      showAlert('success', `Đã thêm quy tắc ánh xạ cho cột "${sheetCol}"!`);
      toggleMappingForm(false);
      // Reset form
      document.getElementById('mapSheetCol').value = '';
      document.getElementById('mapBitrixField').value = '';
      if (document.getElementById('mapCustomFieldName')) document.getElementById('mapCustomFieldName').value = '';
      document.getElementById('customFieldGroup').style.display = 'none';
      document.getElementById('mapDefault').value = '';

      await loadMappingTable();
    } else {
      showAlert('error', result.message || 'Lỗi khi lưu quy tắc ánh xạ');
    }
  } catch (err) {
    showAlert('error', `Lỗi kết nối: ${err.message}`);
  }
}

// Removes a mapping rule by its index
async function deleteMappingRule(index) {
  const fieldName = currentMappingConfig.fields[index]?.sheetColumn;
  const bitrixField = currentMappingConfig.fields[index]?.bitrixField;
  if (!confirm(`Xóa quy tắc liên kết cột "${fieldName}" [${bitrixField}]?`)) {
    return;
  }

  currentMappingConfig.fields.splice(index, 1);
  try {
    const res = await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentMappingConfig),
    });
    const result = await res.json();
    if (result.status === 'success') {
      showAlert('success', `Đã xóa quy tắc cột "${fieldName}"!`);
      await loadMappingTable();
    } else {
      showAlert('error', result.message || 'Lỗi khi cập nhật cấu hình mapping');
    }
  } catch (err) {
    showAlert('error', `Lỗi kết nối: ${err.message}`);
  }
}

// Returns formatted HTML badge for given data type
function getFriendlyTypeBadge(type, valueType) {
  switch (type) {
    case 'multifield':
      return `<span class="pill pill-multifield">Liên hệ (${valueType || 'WORK'})</span>`;
    case 'number':
      return `<span class="pill pill-number">Số</span>`;
    case 'enum':
      return `<span class="pill pill-enum">Danh mục</span>`;
    case 'date':
      return `<span class="pill pill-date">Ngày</span>`;
    case 'string':
    default:
      return `<span class="pill pill-string">Văn bản</span>`;
  }
}

// Loads and renders existing mapping rules table
async function loadMappingTable() {
  const tbody = document.getElementById('mappingTableBody');

  try {
    const res = await fetch('/api/mapping');
    const json = await res.json();

    tbody.innerHTML = '';

    if (json.data && Array.isArray(json.data.fields) && json.data.fields.length > 0) {
      currentMappingConfig = json.data;

      // Refreshes Bitrix field dropdown options after table reload
      renderBitrixFieldSelect();

      json.data.fields.forEach((field, index) => {
        const tr = document.createElement('tr');

        const meta = bitrixFieldsMap.get(field.bitrixField);
        const fieldDisplayName = meta ? meta.label : field.bitrixField;
        const typeBadge = getFriendlyTypeBadge(field.type, field.valueType);

        const defaultDisplay = field.defaultValue !== undefined && field.defaultValue !== ''
          ? `<code class="code-field">${field.defaultValue}</code>`
          : '<span style="color: var(--text-dim);">-</span>';

        tr.innerHTML = `
          <td><strong>${field.sheetColumn}</strong></td>
          <td style="text-align: center; color: var(--text-dim);">➔</td>
          <td>
            <div style="font-weight: 600; font-size: 13px;">${fieldDisplayName}</div>
            <span class="code-field">${field.bitrixField}</span>
          </td>
          <td>${typeBadge}</td>
          <td>${defaultDisplay}</td>
          <td style="text-align: right;">
            <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteMappingRule(${index})">
              Xóa
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có quy tắc nào.</td></tr>';
      renderBitrixFieldSelect();
    }
  } catch (error) {
    console.error('Failed to load mapping configuration table:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 20px;">Lỗi tải dữ liệu mapping.</td></tr>';
  }
}

// Fetches recent execution history logs from SQLite database
async function fetchLogs() {
  const container = document.getElementById('logsContainer');
  const counter = document.getElementById('logsCounter');

  try {
    const res = await fetch(`/api/sync/logs?limit=${MAX_HISTORY_LOGS_QUERY}`);
    const json = await res.json();

    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      container.innerHTML = '';
      if (counter) counter.innerText = `${json.data.length} lần gần nhất (SQLite)`;

      json.data.forEach((log, index) => {
        const div = document.createElement('div');
        div.className = 'log-item';
        const isTwoWay = log.direction === 'BITRIX_TO_SHEETS';
        const directionLabel = isTwoWay ? '🔄 Kéo về Sheet' : '▶ Đẩy sang CRM';
        const directionColor = isTwoWay ? 'var(--primary)' : 'var(--success)';
        const timeFormatted = new Date(log.timestamp).toLocaleTimeString('vi-VN') + ' - ' + new Date(log.timestamp).toLocaleDateString('vi-VN');
        const orderNumber = index + 1;

        div.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--text-dim); background: var(--border-subtle); padding: 2px 6px; border-radius: 4px;">#${orderNumber}</span>
            <strong style="color: ${directionColor};">${directionLabel}</strong>
            <span class="log-meta">
              Tạo mới: <b style="color: var(--success);">${log.created}</b> | Cập nhật: <b style="color: var(--primary);">${log.updated}</b> | Bỏ qua: ${log.skipped} | Lỗi: <b style="color: ${log.failed > 0 ? 'var(--danger)' : 'var(--text-dim)'};">${log.failed}</b> (${log.durationMs}ms)
            </span>
          </div>
          <div class="log-time">${timeFormatted}</div>
        `;
        container.appendChild(div);
      });
    } else {
      if (counter) counter.innerText = '0 lần gần nhất (SQLite)';
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px 0;">Chưa có lượt đồng bộ nào gần đây.</div>';
    }
  } catch (error) {
    console.error('Failed to fetch sync execution history:', error);
  }
}

// Checks Google Auth callback query parameters in URL and displays toast notification
function checkGoogleAuthRedirect() {
  const urlParams = new URLSearchParams(window.location.search);
  const authStatus = urlParams.get('auth') || urlParams.get('google_auth');
  if (authStatus === 'success') {
    showAlert('success', '🎉 Kết nối Google Sheets thành công! Hệ thống đã sẵn sàng đồng bộ.');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (authStatus === 'error') {
    const msg = urlParams.get('msg') || 'Lỗi không xác định khi ủy quyền Google OAuth';
    showAlert('danger', `❌ Lỗi cấp quyền Google OAuth: ${decodeURIComponent(msg)}`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Queries backend to check Google authentication mode and OAuth status
async function checkGoogleAuthStatus() {
  const container = document.getElementById('googleAuthContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/auth/google/status');
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      const { isOAuth, isConnected } = json.data;
      if (!isOAuth) {
        // SERVICE_ACCOUNT: Hiển thị huy hiệu tự động, không xuất hiện nút OAuth
        container.innerHTML = `
          <div class="auth-status-badge badge-sa" title="Đang sử dụng Google Cloud Service Account qua credentials.json">
            <span class="badge-dot dot-green"></span>
            <span>✓ Kết nối: Service Account (Tự động)</span>
          </div>
        `;
      } else {
        // OAUTH2
        if (isConnected) {
          container.innerHTML = `
            <div class="auth-status-badge badge-oauth-ok" title="Đã lưu cặp token bền vững trong SQLite và tự động gia hạn">
              <span class="badge-dot dot-green"></span>
              <span>✓ Google Sheets: Đã kết nối</span>
            </div>
            <button id="btnConnectGoogle" class="btn-google-oauth btn-google-oauth-switch" onclick="connectGoogleOAuth()" title="Đăng nhập tài khoản Google khác hoặc cấp lại quyền">
              <svg width="15" height="15" viewBox="0 0 24 24" style="flex-shrink: 0;">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
                <path fill="#FBBC05" d="M5.28 14.27a7.13 7.13 0 0 1 0-4.54V6.58H1.25a11.97 11.97 0 0 0 0 10.84l4.03-3.15Z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
              </svg>
              <span>Đổi tài khoản khác</span>
            </button>
          `;
        } else {
          container.innerHTML = `
            <button id="btnConnectGoogle" class="btn-google-oauth" onclick="connectGoogleOAuth()" title="Đăng nhập Google để cấp quyền đọc/ghi Google Sheets">
              <svg width="15" height="15" viewBox="0 0 24 24" style="flex-shrink: 0;">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
                <path fill="#FBBC05" d="M5.28 14.27a7.13 7.13 0 0 1 0-4.54V6.58H1.25a11.97 11.97 0 0 0 0 10.84l4.03-3.15Z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
              </svg>
              <span>Kết nối Google với OAUTH2</span>
            </button>
          `;
        }
      }
    }
  } catch (err) {
    console.warn('Could not check Google Auth status:', err);
  }
}

// Initiates Google OAuth consent flow for non-tech users
async function connectGoogleOAuth() {
  const btn = document.getElementById('btnConnectGoogle');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Đang chuyển hướng...</span>';
  }

  try {
    const res = await fetch('/api/auth/google/url');
    const json = await res.json();
    if (json.status === 'success' && json.data?.url) {
      window.location.href = json.data.url;
    } else {
      showAlert('danger', 'Không thể tạo đường dẫn xác thực Google OAuth 2.0.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  } catch (err) {
    showAlert('danger', `Lỗi kết nối máy chủ: ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Displays toast notification alert in dashboard
function showAlert(type, message) {
  const el = document.getElementById('statusAlert');
  if (!el) return;
  el.className = `status-alert active alert-${type}`;
  el.innerHTML = `<span>${message}</span><span style="cursor: pointer; opacity: 0.7; font-size: 16px;" onclick="this.parentElement.className='status-alert'">&times;</span>`;

  setTimeout(() => {
    if (el.className.includes('active')) {
      el.className = 'status-alert';
    }
  }, ALERT_DISMISS_DELAY_MS);
}

// Initializes dashboard when DOM content is loaded
document.addEventListener('DOMContentLoaded', async () => {
  checkGoogleAuthRedirect();
  await checkGoogleAuthStatus();
  await loadBitrixFields();
  await loadMappingTable();
  await fetchStatus();
  setInterval(fetchStatus, SYNC_STATUS_POLL_INTERVAL_MS);
});
