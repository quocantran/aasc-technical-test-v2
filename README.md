# AASC Technical Assessment Suite - Phase 2 (V2)

> Hướng dẫn điều hướng các bài kiểm tra đánh giá năng lực lập trình Backend, Tích hợp hệ thống đa nền tảng và Xây dựng Quy trình tự động hóa (Workflow) tại **AASC**. Chi tiết hướng dẫn cài đặt, cấu hình, kiến trúc kỹ thuật và kết quả kiểm thử vui lòng xem trực tiếp tại file `README.md` hoặc tài liệu bên trong từng thư mục tương ứng.

---

## 📑 Danh Sách & Ánh Xạ Bài Test (Project Mapping)

### 1. [Ứng Dụng Tích Hợp TikTok Lead Generation Với Bitrix24 CRM](./tiktok-bitrix-sync)

- **Thư mục dự án:** [`tiktok-bitrix-sync/`](./tiktok-bitrix-sync)
- **File đề bài gốc:** `V2 - Bai Tich hop Tiktok voi Bitrix24 - Version 1.pdf`
- **Công nghệ cốt lõi:** NestJS 12, TypeScript, PostgreSQL (Prisma ORM), BullMQ + Redis, Pino Structured Logger, Swagger/OpenAPI, Jest + SWC, Docker Compose, Prometheus & Grafana.
- **Mô tả giải pháp:**
  - **Module 1 (TikTok Lead Collection):** Webhook Ingestion endpoint bảo mật cao với chữ ký HMAC-SHA256 (`TikTok-Signature`), tiếp nhận đa dạng sự kiện (`lead.generate`, `form.complete`, `user.interaction`), lưu trữ Raw Data audit, chuẩn hóa số điện thoại E.164 & email RFC 5322, Database-First Idempotency và Deduplication thông minh (Merge Strategy).
  - **Module 2 (Bitrix24 CRM Integration):** Tự động đồng bộ Lead sang Bitrix24 có Token Bucket Rate Limiting (2 RPS) & Exponential Backoff Jitter Retry; Deal Conversion Rule Engine (JSON Logic) tự động chuyển đổi Lead sang Deal với pipeline stages, xác suất và phân bổ sales person; đồng bộ hai chiều qua Bitrix24 Outbound Webhook.
  - **Module 3 (Analytics & Reporting):** Phễu chuyển đổi thời gian thực (Funnel), tính ROI/CPL chiến dịch, Lead Quality Scoring (0-100), xuất báo cáo đa định dạng (Excel `.xlsx` chuẩn styling, CSV stream chống tràn RAM cho tập dữ liệu lớn, JSON) có sắp xếp thời gian giảm dần (mới nhất $\rightarrow$ cũ nhất).
  - **Chất lượng kiểm thử & Hiệu năng:** **50 test suites / 295 unit tests (100% Pass, 100% file đạt > 70% branch, 88.75% branch toàn dự án)**, **41 E2E tests**, Live Benchmark tải cao 200 requests đồng thời đạt **94.43 req/giây** (p95 latency 281ms).
- **Chi tiết & Hướng dẫn chạy:** Xem tại [tiktok-bitrix-sync/README.md](./tiktok-bitrix-sync/README.md).

---

### 2. [Tích Hợp Google Sheets Với Bitrix24 CRM Leads](./google-sheets-bitrix-sync)

- **Thư mục dự án:** [`google-sheets-bitrix-sync/`](./google-sheets-bitrix-sync)
- **File đề bài gốc:** `V2 - De bai Tich hop Google Sheet voi Bitrix24 CRM - Version 2.pdf`
- **Video Demo nộp bài:** 🎬 [`google-sheets-bitrix-sync/docs/videos/Google Sheets ↔ Bitrix24 CRM Sync.mp4`](./google-sheets-bitrix-sync/docs/videos/Google%20Sheets%20%E2%86%94%20Bitrix24%20CRM%20Sync.mp4)
- **Công nghệ cốt lõi:** NestJS 12, TypeScript, Google Sheets API v4, Bitrix24 REST API (Batch Engine), SQLite persistent tokens, Web Admin Dashboard (Glassmorphism), Vitest.
- **Mô tả giải pháp:**
  - **Đồng bộ 2 chiều (Hybrid Two-Way Sync):** Chiều thuận (Google Sheets $\rightarrow$ Bitrix24) quét tự động định kỳ qua Cron hoặc trigger thủ công; chiều ngược qua Real-time Webhook Bitrix24 (`ONCRMLEADADD`, `ONCRMLEADUPDATE`, `ONCRMLEADDELETE`) kết hợp Reconciliation Engine kéo dữ liệu CRM về Sheet với cơ chế Auto-Pagination (chunk 50 leads/trang, tối đa 1.000 leads an toàn).
  - **Bitrix24 Batch API Engine (`/rest/batch.json`):** Gom cụm tối đa 50 lệnh CRUD trong 1 request, tối ưu triệt để quota 2 RPS.
  - **Idempotency & Change Detection:** Băm SHA-256 Canonical Checksum phát hiện nhanh các dòng không thay đổi (`SKIPPED`), quét cực nhanh ~600ms, chống nạp trùng.
  - **Xác thực đa chiến lược (Multi-Strategy Auth):** Google Cloud Service Account (`credentials.json`) và Google OAuth 2.0 (tự động refresh token lưu SQLite).
  - **Chống trùng lặp & Xử lý xung đột:** Deduplication đồng thời qua cả Email và SĐT (`crm.duplicate.findbycomm`), giải quyết xung đột Last-Write-Wins.
  - **Giao diện Web Quản Trị (Admin Dashboard):** Giao diện web trực quan tại `/admin` cho phép theo dõi trạng thái, kích hoạt sync 1 chạm và cấu hình ánh xạ cột linh hoạt.
  - **Video Demo Đầy Đủ:** Đã đính kèm video ghi hình trực quan toàn bộ tính năng và kịch bản nghiệp vụ theo yêu cầu đề bài.
- **Chi tiết & Hướng dẫn chạy:** Xem tại [google-sheets-bitrix-sync/README.md](./google-sheets-bitrix-sync/README.md).

---

### 3. [Xây Dựng Quy Trình Workflow Trên Nền Tảng Bitrix24](./bitrix24-workflow)

- **Thư mục dự án:** [`bitrix24-workflow/`](./bitrix24-workflow)
- **File đề bài gốc:** `V2 - Bai Kiem tra Xay dung Workflow tren Bitrix24 - Version 1.pdf`
- **Tài liệu Báo Cáo chi tiết:** 📄 [`bitrix24-workflow/DOCS.pdf`](./bitrix24-workflow/DOCS.pdf)
- **Các file nộp bài xuất từ Bitrix24 (Exported BP Files):**
  - **Quy trình 1: Nghỉ phép qua 3 cấp phê duyệt:**
    - **File Workflow:** [`bitrix24-workflow/NghiPhep_3Cap.bpt`](./bitrix24-workflow/NghiPhep_3Cap.bpt)
    - **Luồng phê duyệt:** Nhân viên gửi yêu cầu $\rightarrow$ Quản lý trực tiếp (Cấp 1) $\rightarrow$ Trưởng phòng Nhân sự (Cấp 2 - kiểm tra tính hợp lệ và số ngày phép khả dụng) $\rightarrow$ Giám đốc (Cấp 3 - phê duyệt cuối) $\rightarrow$ Thông báo kết quả qua tin nhắn/email Bitrix24 và lưu vết Audit Trail.
  - **Quy trình 2: Xin phê duyệt chi phí công tác qua 4 cấp phê duyệt:**
    - **File Workflow:** [`bitrix24-workflow/ChiPhiCongTac_4Cap.bpt`](./bitrix24-workflow/ChiPhiCongTac_4Cap.bpt)
    - **Luồng phê duyệt:** Nhân viên tạo yêu cầu công tác (đính kèm dự toán chi phí) $\rightarrow$ Quản lý trực tiếp (Cấp 1 - xét tính cần thiết) $\rightarrow$ Trưởng phòng Tài chính (Cấp 2 - kiểm tra ngân sách) $\rightarrow$ Phó Giám đốc Tài chính (Cấp 3 - tính hợp lý chi phí) $\rightarrow$ Giám đốc (Cấp 4 - phê duyệt cuối) $\rightarrow$ Thông báo chi tiết kết quả và kinh phí được duyệt.
  - **Tài liệu hướng dẫn & Báo cáo:** File `DOCS.pdf` trình bày đầy đủ sơ đồ cấu trúc quy trình, biến số (variables), điều kiện kiểm tra logic, thông báo tự động và hướng dẫn chi tiết cách import file `.bpt` vào hệ thống Bitrix24 CRM.
- **Chi tiết & Hướng dẫn triển khai:** Xem tại tài liệu [bitrix24-workflow/DOCS.pdf](./bitrix24-workflow/DOCS.pdf).

---

## 👨💻 Thông Tin Tác Giả & Nộp Bài

- **Ứng viên:** Trần Quốc An
- **GitHub Repository:** [https://github.com/quocantran/aasc-technical-test-v2.git](https://github.com/quocantran/aasc-technical-test-v2.git)
