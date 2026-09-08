// User-facing Vietnamese error messages written to Google Sheets system columns
export const ERROR_MESSAGES_VI = {
  MISSING_TITLE_OR_NAME: 'Lỗi: Thiếu trường bắt buộc (Tiêu đề hoặc Họ tên)',
  MISSING_CONTACT_INFO: 'Lỗi: Thiếu thông tin liên hệ (Email hoặc Số điện thoại)',
  INVALID_EMAIL_FORMAT: 'Lỗi: Định dạng Email không hợp lệ',
  INVALID_PHONE_FORMAT: 'Lỗi: Định dạng Số điện thoại không hợp lệ',
  DEDUP_CONFLICT: 'Lỗi: Xung đột dữ liệu - Email và SĐT thuộc về hai Lead khác nhau',
  BITRIX_API_ERROR_PREFIX: 'Lỗi Bitrix24 API: ',
  TIMEOUT_ERROR: 'Lỗi: Hết thời gian chờ phản hồi từ Bitrix24',
  UNKNOWN_ERROR: 'Lỗi hệ thống không xác định',
  LEAD_DELETED_IN_BITRIX: 'Cảnh báo: Lead đã bị xóa trên Bitrix, tiến hành tạo mới',
  MAPPING_CONFIG_ERROR: 'Lỗi: Cấu hình ánh xạ trường mapping.json không hợp lệ',
} as const;
