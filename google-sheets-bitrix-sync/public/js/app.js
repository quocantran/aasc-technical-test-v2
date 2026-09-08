/**
 * Google Sheets <-> Bitrix24 Management Dashboard Frontend Controller
 * Thiết kế chuẩn UI/UX cho người dùng Non-Tech (Kinh doanh & Marketing)
 */

let availableBitrixFields = [];
let bitrixFieldsMap = new Map();
let currentMappingConfig = { fields: [] };

// Tải danh mục trường Bitrix Lead từ máy chủ và khởi tạo dropdown phân nhóm
async function loadBitrixFields() {
  const select = document.getElementById('mapBitrixField');
  if (!select) return;

  try {
    const res = await fetch('/api/bitrix/lead-fields');
    const json = await res.json();

    if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
      availableBitrixFields = json.data;
      bitrixFieldsMap.clear();

      // Gom nhóm theo trường group
      const grouped = {};
      for (const field of availableBitrixFields) {
        bitrixFieldsMap.set(field.field, field);
        const gName = field.group || 'Thông tin chung';
        if (!grouped[gName]) grouped[gName] = [];
        grouped[gName].push(field);
      }

      select.innerHTML = '<option value="">-- Chọn trường lưu trữ trên Bitrix24 CRM --</option>';

      for (const [groupName, fields] of Object.entries(grouped)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;

        for (const f of fields) {
          const opt = document.createElement('option');
          opt.value = f.field;
          const reqStar = f.isRequired ? ' (* Bắt buộc)' : '';
          opt.textContent = `${f.label} [${f.field}]${reqStar}`;
          optgroup.appendChild(opt);
        }
        select.appendChild(optgroup);
      }

      // Thêm tùy chọn tự gõ mã trường tùy biến khác nếu cần
      const customGroup = document.createElement('optgroup');
      customGroup.label = '➕ Tùy chọn nâng cao';
      const customOpt = document.createElement('option');
      customOpt.value = '__CUSTOM__';
      customOpt.textContent = '➕ Nhập mã trường tùy biến khác (UF_CRM_...)';
      customGroup.appendChild(customOpt);
      select.appendChild(customGroup);
    }
  } catch (err) {
    console.error('Không thể tải danh sách trường Bitrix24:', err);
    select.innerHTML = '<option value="">(Lỗi tải danh mục trường, vui lòng làm mới)</option>';
  }
}

// Xử lý tự động khi người dùng chọn một trường Bitrix trong dropdown
function onBitrixFieldChange() {
  const select = document.getElementById('mapBitrixField');
  const customGroup = document.getElementById('customFieldGroup');
  const typeSelect = document.getElementById('mapType');
  const descEl = document.getElementById('typeDescription');
  const reqCheckbox = document.getElementById('mapRequired');
  const defaultInput = document.getElementById('mapDefault');

  const selectedValue = select.value;

  if (selectedValue === '__CUSTOM__') {
    customGroup.style.display = 'block';
    typeSelect.value = 'string';
    descEl.innerHTML = '<span>ℹ️</span> Nhập mã trường bắt đầu bằng <code>UF_CRM_</code> đã tạo trên CRM.';
    return;
  }

  customGroup.style.display = 'none';

  if (!selectedValue) {
    descEl.innerHTML = '<span>ℹ️</span> Tự động điều chỉnh theo trường CRM bạn đã chọn';
    return;
  }

  const meta = bitrixFieldsMap.get(selectedValue);
  if (!meta) return;

  // 1. Tự động gán kiểu dữ liệu phù hợp, người dùng không cần bối rối chọn
  if (meta.type) {
    typeSelect.value = meta.type;
  }

  // 2. Gợi ý mô tả dễ hiểu
  const descriptions = {
    multifield: '<span>📞</span> Kênh liên lạc: Tự động chuẩn hóa số điện thoại quốc tế (+84) hoặc Email công việc.',
    number: '<span>💰</span> Số tiền / Số lượng: Tự động lọc bỏ ký tự phẩy, chấm để lưu thành số hợp lệ.',
    enum: '<span>📋</span> Danh mục chọn: Tự động chuyển đổi tiếng Việt (Mới, Đang xử lý...) thành mã chuẩn CRM.',
    date: '<span>📅</span> Ngày tháng: Tự động nhận diện định dạng DD/MM/YYYY hoặc YYYY-MM-DD.',
    string: '<span>📝</span> Văn bản thông thường: Lưu giữ nguyên nội dung chữ từ ô bảng tính.',
  };
  descEl.innerHTML = descriptions[meta.type] || descriptions.string;

  // 3. Tự động tích nếu là trường bắt buộc (ví dụ TITLE)
  if (meta.isRequired) {
    reqCheckbox.checked = true;
  }

  // 4. Gợi ý giá trị mặc định nếu có
  if (meta.defaultValue !== undefined && !defaultInput.value) {
    defaultInput.value = meta.defaultValue;
  }
}

// Tải trạng thái đồng bộ và cập nhật các thẻ thống kê
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
        document.getElementById('metaLastRun').innerText = `⏱ Lần chạy gần nhất: ${timeFormatted}`;
      }
      if (durationMs !== undefined) {
        document.getElementById('metaDuration').innerText = `⏳ Thời lượng xử lý: ${durationMs}ms`;
      }
    }

    await fetchLogs();
  } catch (error) {
    console.error('Lỗi khi tải trạng thái đồng bộ:', error);
  }
}

// Thực hiện đẩy dữ liệu từ Google Sheets sang Bitrix24 CRM
async function triggerSync() {
  const btn = document.getElementById('btnTriggerSync');
  const force = document.getElementById('forceSync').checked;

  btn.disabled = true;
  btn.innerText = '⏳ Đang đẩy dữ liệu sang CRM...';
  showAlert('info', 'Tiến trình đồng bộ đang đọc dữ liệu từ Google Sheets và xử lý trên CRM, vui lòng chờ giây lát...');

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

      document.getElementById('metaDuration').innerText = `⏳ Thời lượng xử lý: ${durationMs}ms`;
      document.getElementById('metaLastRun').innerText = `⏱ Lần chạy gần nhất: ${new Date().toLocaleString('vi-VN')}`;

      let msg = `🎉 Đồng bộ sang CRM hoàn tất! Đã kiểm tra ${totalRows} dòng: Tạo mới ${created}, Cập nhật ${updated}, Giữ nguyên ${skipped}`;
      if (failed > 0) {
        msg += `, Gặp lỗi ${failed} bản ghi (vui lòng xem cột Báo Lỗi trên Sheet)`;
      }
      showAlert('success', msg);
    } else {
      showAlert('error', data.message || 'Hệ thống đang bận hoặc gặp lỗi khi đồng bộ');
    }
  } catch (error) {
    showAlert('error', `Lỗi kết nối máy chủ: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '▶ Đẩy Dữ Liệu Sang Bitrix24 CRM';
    await fetchStatus();
  }
}

// Thực hiện kéo dữ liệu ngược từ Bitrix24 về Google Sheets
async function triggerTwoWay() {
  const btn = document.getElementById('btnTriggerTwoWay');

  btn.disabled = true;
  btn.innerText = '⏳ Đang kéo dữ liệu về Sheet...';
  showAlert('info', 'Đang đọc danh sách khách hàng mới và cập nhật từ CRM Bitrix24 để điền về Google Sheets...');

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

      document.getElementById('metaDuration').innerText = `⏳ Thời lượng xử lý: ${durationMs}ms`;
      document.getElementById('metaLastRun').innerText = `⏱ Lần chạy gần nhất: ${new Date().toLocaleString('vi-VN')}`;

      showAlert(
        'success',
        `🎉 Đồng bộ về Google Sheets hoàn tất: Đã bổ sung ${created} dòng mới, cập nhật ${updated} dòng (Tổng: ${totalRows} dòng).`,
      );
    } else {
      showAlert('error', data.message || 'Lỗi khi thực hiện kéo dữ liệu về Google Sheets');
    }
  } catch (error) {
    showAlert('error', `Lỗi kết nối máy chủ: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '🔄 Kéo Dữ Liệu Về Google Sheets';
    await fetchStatus();
  }
}

// Bật / tắt mở form tạo quy tắc ánh xạ
function toggleMappingForm(forceState) {
  const container = document.getElementById('mappingFormContainer');
  if (!container) return;

  if (typeof forceState === 'boolean') {
    container.style.display = forceState ? 'block' : 'none';
  } else {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  }

  if (container.style.display === 'block') {
    document.getElementById('mapSheetCol')?.focus();
  }
}

// Lưu quy tắc ánh xạ cột mới vào backend
async function saveNewMappingRule() {
  const sheetCol = document.getElementById('mapSheetCol').value.trim();
  const bitrixFieldSelect = document.getElementById('mapBitrixField').value.trim();
  const customFieldName = document.getElementById('mapCustomFieldName')?.value.trim();
  const type = document.getElementById('mapType').value;
  const defVal = document.getElementById('mapDefault').value.trim();
  const required = document.getElementById('mapRequired').checked;

  if (!sheetCol) {
    showAlert('error', 'Vui lòng nhập tên cột trên Google Sheets của bạn!');
    document.getElementById('mapSheetCol')?.focus();
    return;
  }

  let finalBitrixField = bitrixFieldSelect;
  if (bitrixFieldSelect === '__CUSTOM__') {
    if (!customFieldName) {
      showAlert('error', 'Vui lòng nhập mã trường tùy biến (Ví dụ: UF_CRM_TAX_ID)!');
      document.getElementById('mapCustomFieldName')?.focus();
      return;
    }
    finalBitrixField = customFieldName;
  }

  if (!finalBitrixField) {
    showAlert('error', 'Vui lòng chọn trường lưu trữ trên CRM Bitrix24 trong danh sách!');
    document.getElementById('mapBitrixField')?.focus();
    return;
  }

  const newField = {
    sheetColumn: sheetCol,
    bitrixField: finalBitrixField,
    type: type,
  };

  if (defVal) newField.defaultValue = defVal;
  if (required) newField.required = true;
  if (type === 'multifield') newField.valueType = 'WORK';

  // Tự động gắn bảng chuyển đổi giá trị tiếng Việt chuẩn cho Status và Source
  if (finalBitrixField === 'STATUS_ID') {
    newField.type = 'enum';
    newField.valueMapping = {
      'Mới': 'NEW',
      'Chưa xử lý': 'NEW',
      'Đang liên hệ': 'IN_PROCESS',
      'Đang xử lý': 'IN_PROCESS',
      'Đã xử lý': 'PROCESSED',
      'Hoàn thành': 'CONVERTED',
      'Không tiềm năng': 'JUNK',
    };
    if (!defVal) newField.defaultValue = 'NEW';
  } else if (finalBitrixField === 'SOURCE_ID') {
    newField.type = 'enum';
    newField.valueMapping = {
      'Website': 'WEB',
      'Facebook': 'FACEBOOK',
      'Đối tác': 'PARTNER',
      'Sự kiện': 'TRADE_SHOW',
      'Giới thiệu': 'RECOMMENDATION',
      'Khác': 'OTHER',
    };
    if (!defVal) newField.defaultValue = 'OTHER';
  }

  // Thay thế nếu trùng tên cột, hoặc thêm mới
  const existingIdx = currentMappingConfig.fields.findIndex(
    (f) => f.sheetColumn.toLowerCase() === sheetCol.toLowerCase(),
  );
  if (existingIdx >= 0) {
    currentMappingConfig.fields[existingIdx] = newField;
  } else {
    currentMappingConfig.fields.push(newField);
  }

  try {
    const res = await fetch('/api/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentMappingConfig),
    });
    const result = await res.json();
    if (result.status === 'success') {
      showAlert('success', `Đã lưu thành công quy tắc ánh xạ cho cột "${sheetCol}"!`);
      toggleMappingForm(false);
      // Reset form
      document.getElementById('mapSheetCol').value = '';
      document.getElementById('mapBitrixField').value = '';
      if (document.getElementById('mapCustomFieldName')) document.getElementById('mapCustomFieldName').value = '';
      document.getElementById('customFieldGroup').style.display = 'none';
      document.getElementById('mapDefault').value = '';
      document.getElementById('mapRequired').checked = false;
      document.getElementById('typeDescription').innerHTML = '<span>ℹ️</span> Tự động điều chỉnh theo trường CRM bạn đã chọn';
      await loadMappingTable();
    } else {
      showAlert('error', result.message || 'Lỗi khi lưu quy tắc ánh xạ');
    }
  } catch (err) {
    showAlert('error', `Lỗi kết nối máy chủ: ${err.message}`);
  }
}

// Xóa quy tắc ánh xạ theo chỉ số mảng
async function deleteMappingRule(index) {
  const fieldName = currentMappingConfig.fields[index]?.sheetColumn;
  if (!confirm(`Bạn có chắc chắn muốn xóa quy tắc liên kết cột "${fieldName}" khỏi hệ thống không?`)) {
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
      showAlert('success', `Đã xóa quy tắc cho cột "${fieldName}"!`);
      await loadMappingTable();
    } else {
      showAlert('error', result.message || 'Lỗi khi cập nhật cấu hình mapping');
    }
  } catch (err) {
    showAlert('error', `Lỗi kết nối máy chủ: ${err.message}`);
  }
}

// Nhãn tiếng Việt dễ hiểu cho các kiểu dữ liệu
function getFriendlyTypeBadge(type, valueType) {
  switch (type) {
    case 'multifield':
      return `<span class="pill pill-multifield">Liên hệ (${valueType || 'WORK'})</span>`;
    case 'number':
      return `<span class="pill pill-number">Số tiền / Số</span>`;
    case 'enum':
      return `<span class="pill pill-enum">Danh mục chọn</span>`;
    case 'date':
      return `<span class="pill pill-date">Ngày tháng</span>`;
    case 'string':
    default:
      return `<span class="pill pill-string">Văn bản</span>`;
  }
}

// Tải và hiển thị danh sách quy tắc ánh xạ hiện tại
async function loadMappingTable() {
  const tbody = document.getElementById('mappingTableBody');

  try {
    const res = await fetch('/api/mapping');
    const json = await res.json();

    tbody.innerHTML = '';

    if (json.data && Array.isArray(json.data.fields) && json.data.fields.length > 0) {
      currentMappingConfig = json.data;

      json.data.fields.forEach((field, index) => {
        const tr = document.createElement('tr');

        // Tìm nhãn tiếng Việt của trường Bitrix nếu có
        const meta = bitrixFieldsMap.get(field.bitrixField);
        const fieldDisplayName = meta ? meta.label : field.bitrixField;

        const typeBadge = getFriendlyTypeBadge(field.type, field.valueType);
        const requiredBadge = field.required
          ? '<span style="color: var(--danger); font-weight: 700; font-size: 12px; background: rgba(239, 68, 68, 0.1); padding: 2px 8px; border-radius: 4px;">Bắt buộc</span>'
          : '<span style="color: var(--text-dim); font-size: 12px;">Tùy chọn</span>';

        const defaultDisplay = field.defaultValue !== undefined && field.defaultValue !== ''
          ? `<code>${field.defaultValue}</code>`
          : '<span style="color: var(--text-dim);">-</span>';

        tr.innerHTML = `
          <td><strong style="color: var(--text-main);">${field.sheetColumn}</strong></td>
          <td style="text-align: center;"><span class="arrow-icon">➔</span></td>
          <td>
            <div style="font-weight: 600; color: var(--text-main); font-size: 13.5px;">${fieldDisplayName}</div>
            <span class="pill pill-field" style="margin-top: 3px;">${field.bitrixField}</span>
          </td>
          <td>${typeBadge}</td>
          <td>${defaultDisplay}</td>
          <td style="text-align: center;">${requiredBadge}</td>
          <td style="text-align: right;">
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11.5px; color: var(--danger); border-color: rgba(239, 68, 68, 0.3);" onclick="deleteMappingRule(${index})" title="Xóa quy tắc này">
              ✕ Xóa
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có quy tắc ánh xạ nào. Bấm "+ Thêm Quy Tắc Mới" ở trên để bắt đầu cấu hình.</td></tr>';
    }
  } catch (error) {
    console.error('Lỗi khi tải bảng cấu hình mapping:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 24px;">Không thể tải cấu hình ánh xạ cột từ máy chủ.</td></tr>';
  }
}

// Tải lịch sử các lượt thực thi đồng bộ gần đây
async function fetchLogs() {
  const container = document.getElementById('logsContainer');

  try {
    const res = await fetch('/api/sync/logs');
    const json = await res.json();

    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      container.innerHTML = '';
      json.data.forEach((log) => {
        const div = document.createElement('div');
        div.className = 'log-item';
        const isTwoWay = log.direction === 'BITRIX_TO_SHEETS';
        const directionLabel = isTwoWay ? '🔄 Kéo Dữ Liệu Về Sheet' : '▶ Đẩy Dữ Liệu Sang CRM';
        const directionColor = isTwoWay ? 'var(--primary)' : 'var(--success)';
        const timeFormatted = new Date(log.timestamp).toLocaleTimeString('vi-VN') + ' - ' + new Date(log.timestamp).toLocaleDateString('vi-VN');

        div.innerHTML = `
          <div>
            <strong style="color: ${directionColor};">${directionLabel}</strong>
            <span class="log-meta">
              Tạo mới: <b style="color: var(--success);">${log.created}</b> | Cập nhật: <b style="color: var(--primary);">${log.updated}</b> | Giữ nguyên: ${log.skipped} | Lỗi: <b style="color: ${log.failed > 0 ? 'var(--danger)' : 'var(--text-dim)'};">${log.failed}</b> (${log.durationMs}ms)
            </span>
          </div>
          <div class="log-time">${timeFormatted}</div>
        `;
        container.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Lỗi khi tải nhật ký đồng bộ:', error);
  }
}

// Hiển thị thông báo trạng thái dạng banner nổi
function showAlert(type, message) {
  const el = document.getElementById('statusAlert');
  if (!el) return;
  el.className = `status-alert active alert-${type}`;
  el.innerHTML = `<span>${message}</span><span style="cursor: pointer; opacity: 0.7; font-size: 18px;" onclick="this.parentElement.className='status-alert'">&times;</span>`;

  setTimeout(() => {
    if (el.className.includes('active')) {
      el.className = 'status-alert';
    }
  }, 7000);
}

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', async () => {
  await loadBitrixFields();
  await loadMappingTable();
  await fetchStatus();
  setInterval(fetchStatus, 30000);
});
