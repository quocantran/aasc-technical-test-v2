# TikTok Lead Generation ↔ Bitrix24 CRM Integration Service (NestJS v12)

> Integration Service xây dựng bằng **NestJS 12 + TypeScript**, tự động thu thập và đồng bộ dữ liệu khách hàng tiềm năng (Leads) thời gian thực từ **TikTok Lead Generation Ads** vào **Bitrix24 CRM** với kiến trúc hướng sự kiện (**Event-Driven Architecture**), hàng đợi **BullMQ/Redis**, cơ chế **Database-First Idempotency**, chống trùng lặp đa tiêu chí (**Deduplication**), **Token Bucket Rate Limiter (2 req/s)**, **Exponential Backoff Jitter Retry**, **Dynamic Rule Engine** tự động chuyển đổi Deal, đồng bộ sự kiện chuyển đổi ngược về **TikTok Events API** (bảo mật băm SHA-256 PII), **Batch Historical Data Migration** và **Scheduled Reports & Alerts**.

---

## 🌟 Tính Năng Cốt Lõi & Kiến Trúc (Key Features)

1. **Tiếp Nhận Webhook An Toàn & Database-First Idempotency:**
   - **Xác thực chữ ký HMAC-SHA256:** Kiểm định nghiêm ngặt header `TikTok-Signature` với secret key theo chuẩn bảo mật TikTok Ads API, loại bỏ ngay các request giả mạo hoặc sai lệch payload.
   - **Đảm bảo Idempotency tầng Database:** Lưu trữ trực tiếp payload vào bảng `webhook_events` với ràng buộc `UNIQUE (event_id)`. Xử lý triệt để race condition, tự động loại bỏ duplicate webhook khi TikTok retry mà không sinh thêm job rác.
2. **Xử Lý & Chuẩn Hóa Dữ Liệu Quốc Tế (Data Normalization):**
   - **Chuẩn hóa SĐT E.164:** Tự động nhận diện và chuyển đổi mọi định dạng SĐT Việt Nam (`090x`, `8490x`, `008490x`, có khoảng trắng/dấu gạch ngang) về định dạng chuẩn quốc tế `+84xxxxxxxxx`.
   - **Chuẩn hóa Email & Định danh:** Làm sạch khoảng trắng thừa, đưa về chữ thường (`lowercase`), bóc tách chính xác các tham số nguồn `campaign_id`, `ad_id`, `form_id`, `ttclid` và UTM tracking.
3. **Chống Trùng Lặp Thông Minh (Deduplication) & Hợp Nhất (Merge Strategy):**
   - **Tra cứu kép (Local DB + Bitrix CRM):** Quét trùng lặp đồng thời theo cả Email và SĐT đã chuẩn hóa trên PostgreSQL và qua API `crm.duplicate.findbycomm` của Bitrix24.
   - **Chiến lược hợp nhất linh hoạt (Configurable Merge Strategy):** Hỗ trợ 3 chiến lược cấu hình động (`OVERWRITE_EMPTY` - chỉ điền trường còn trống; `ALWAYS_OVERWRITE` - luôn cập nhật mới; `PRESERVE_EXISTING` - giữ nguyên thông tin cũ), ghi vết lịch sử hợp nhất vào `audit_logs`.
4. **Đồng Bộ Dữ Liệu Vào Bitrix24 CRM (Bitrix24 Sync Engine):**
   - **Tự động tạo/cập nhật Lead:** Tự động gọi `crm.lead.add` / `crm.lead.update` với cấu trúc đa trường (Multifield format `PHONE`, `EMAIL`) và các trường tuỳ biến (`UF_CRM_*`).
   - **Ghi log Timeline & Nguồn:** Tự động gắn bình luận lịch sử (`crm.timeline.comment.add`) ghi rõ chiến dịch, mẫu form và quảng cáo TikTok gốc phục vụ đội ngũ Sales tra cứu.
5. **Động Cơ Luật Chuyển Đổi Deal Tự Động (Dynamic Rule Engine):**
   - **Đánh giá biểu thức điều kiện linh hoạt:** Hỗ trợ các toán tử `CONTAINS`, `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN`, kết hợp logic `AND` / `OR` trên dữ liệu chiến dịch hoặc câu hỏi khảo sát (`custom_questions`).
   - **Tự động cấu hình Pipeline & Xác suất:** Thiết lập `CATEGORY_ID`, `STAGE_ID`, `OPPORTUNITY`, `PROBABILITY` và tự động phân bổ nhân viên phụ trách (`ASSIGNED_BY_ID`).
   - **Hệ thống thông báo tức thì:** Gửi tin nhắn thông báo nội bộ qua Bitrix24 Chat (`im.notify.system.add`) cho nhân viên kinh doanh ngay khi Deal được tạo mới.
6. **Đồng Bộ Ngược Sự Kiện Chuyển Đổi Về TikTok (TikTok Offline Conversion Events API):**
   - **Vòng lặp đóng (Closed-Loop Attribution):** Lắng nghe Outbound Webhook `ONCRMDEALUPDATE` từ Bitrix24; khi Deal đạt trạng thái `WON`, tự động gửi tín hiệu chuyển đổi (`CompletePayment`) về TikTok Events API.
   - **Bảo mật PII chuẩn quốc tế:** Tự động băm **SHA-256** thông tin cá nhân (`email`, `phone`) theo yêu cầu bảo mật quyền riêng tư GDPR và TikTok Marketing API.
7. **Kiểm Soát Lưu Lượng & Khả Năng Tự Hồi Phục (Resilience & Rate Limiter):**
   - **Token Bucket Rate Limiter:** Giới hạn nghiêm ngặt tối đa **2 requests/giây** cho Bitrix24 REST API qua BullMQ limiter và Promise queue, loại bỏ hoàn toàn lỗi HTTP 429.
   - **Exponential Backoff & Full Jitter Retry:** Thử lại tự động khi gặp lỗi mạng tạm thời hoặc CRM downtime với công thức: $\text{delay} = \text{baseDelay} \times 2^{\text{attempt}} \pm 25\% \text{ Jitter}$.
   - **Dead Letter Queue (DLQ):** Tự động ghi nhận các job vượt quá số lần retry vào bảng `dlq_records` để theo dõi và xử lý thủ công.
   - **Chống vòng lặp Webhook (Anti-Echo Guard):** Bộ nhớ đệm TTL 15s ghi nhận các Deal vừa được hệ thống cập nhật để bỏ qua webhook phản hồi dội lại từ Bitrix24.
   - **Hòa giải lỗi Timeout (Timeout Reconciliation Pattern):** Tự động truy vấn `findDealByTitle` khi gặp sự cố timeout mạng lúc tạo Deal, tránh tạo trùng lặp bản ghi.
8. **Batch Processing Cho Historical Data Migration:**
   - Hỗ trợ endpoint migration `POST /api/v1/leads/batch-migrate` nạp toàn bộ leads lịch sử chưa đồng bộ theo từng batch có kiểm soát pacing, theo dõi tiến độ qua `sync_jobs`.
9. **Analytics, Lead Quality Scoring & Báo Cáo Scheduled/Alerts:**
   - **Phân tích Phễu Chuyển Đổi:** Thống kê tỷ lệ chuyển đổi từ Lead $\rightarrow$ Lead Synced $\rightarrow$ Deal Created $\rightarrow$ Deal Won theo thời gian thực.
   - **ROI & CPL:** Tính toán Cost Per Lead và tỷ suất sinh lời ROI dựa trên chi phí ước tính và doanh thu thực tế theo từng chiến dịch.
   - **Chấm Điểm Chất Lượng Lead (Quality Scoring):** Thuật toán chấm điểm 0 - 100 dựa trên mức độ hoàn thiện thông tin và tỷ lệ chốt deal của chiến dịch.
   - **Scheduled Reports & Alerts:** Tự động chạy báo cáo định kỳ mỗi ngày lúc 00:00 và giám sát ngưỡng lỗi hàng giờ (`@Cron`), gửi cảnh báo tự động khi phát hiện bất thường.
   - **Xuất Dữ Liệu Chuẩn UTF-8 BOM Cho Excel:** Hỗ trợ xuất báo cáo định dạng CSV/Excel (`\uFEFF`) hiển thị tiếng Việt có dấu chuẩn xác 100% trên Microsoft Excel.
10. **Hệ Thống Giả Lập Toàn Diện (Mock Services & CLI Simulators):**
    - Hỗ trợ chế độ giả lập độc lập `USE_MOCK_BITRIX=true` và `USE_MOCK_TIKTOK_EVENTS=true` không phụ thuộc tài khoản thật, đi kèm các công cụ CLI mô phỏng gửi webhook và kiểm thử chữ ký.
11. **Hệ Thống Giám Sát Metrics (Prometheus & Grafana Observability):**
    - Cung cấp endpoint chuẩn `/metrics` trích xuất các chỉ số quan trọng: Queue Lag (độ trễ hàng đợi BullMQ), HTTP Request Duration Histogram, Redis Lock Contention, và Lead Conversion Counter. Cấu hình tự động nạp sẵn (provisioning) Prometheus (`:9090`) và Grafana Dashboard (`:3001`) trực quan trong thư mục `monitoring/`.

---

## 🏛️ Kiến Trúc Hệ Thống (System Design & Clean Architecture)

### 1. Sơ Đồ Kiến Trúc Luồng Xử Lý (Data Pipeline Architecture)

```mermaid
flowchart TD
    subgraph INGESTION["1. Ingestion Layer"]
        A["TikTok Lead Ad / User Form"] -->|"POST /webhooks/tiktok/leads"| B["TikTokSignatureGuard<br/>HMAC-SHA256"]
        B -->|"Valid Signature"| C["TikTokWebhookService"]
        B -->|"Invalid"| B1["Reject 401 Unauthorized"]
        C --> D[("PostgreSQL: webhook_events<br/>UNIQUE event_id")]
        D -->|"New Record"| E["Enqueue BullMQ<br/>queue: lead-processing"]
        D -->|"Duplicate P2002"| E1["Return 200/201 Ignored"]
    end

    subgraph WORKERS["2. Asynchronous Queue Processing (BullMQ & Redis)"]
        E --> F["LeadProcessingWorker"]
        F --> G["Normalizer: Phone E.164 & Email"]
        G --> H["LeadDeduplicationService<br/>Local DB + CRM Check"]
        H --> I[("PostgreSQL: leads")]
        I --> J["Enqueue BullMQ<br/>queue: bitrix-sync"]

        J --> K["BitrixSyncWorker<br/>Token Bucket 2 RPS Limiter"]
        K --> L["RetryService<br/>Exponential Backoff + Jitter"]
        L --> M["Bitrix24 REST API<br/>crm.lead.add / update"]
        M --> N["crm.timeline.comment.add"]
        N --> O["Enqueue BullMQ<br/>queue: deal-conversion"]

        O --> P["DealConversionWorker"]
        P --> Q["RuleEvaluatorService<br/>JSON Conditions"]
        Q -->|"Matched"| R["Bitrix24 REST API<br/>crm.deal.add"]
        R --> S["Bitrix24 Chat Notification<br/>im.notify.system.add"]
        S --> T[("PostgreSQL: deals")]
    end

    subgraph CLOSED_LOOP["3. Closed-Loop Attribution & TikTok Events"]
        U["Sales Updates Deal: WON"] -->|"Outbound Webhook"| V["POST /webhooks/bitrix24/deals"]
        V --> W{"Anti-Echo Guard<br/>Recently Modified?"}
        W -->|"Yes"| W1["Ignore Self-Echo"]
        W -->|"No"| X["Update Deal: WON in DB"]
        X --> Y["Enqueue BullMQ<br/>queue: tiktok-events-sync"]
        Y --> Z["TikTokEventsSyncWorker"]
        Z --> AA["SHA-256 PII Hashing<br/>Phone & Email"]
        AA --> AB["TikTok Events API<br/>Track Offline Conversion"]
    end
```

---

### 2. Sơ Đồ Thực Thể Cơ Sở Dữ Liệu (Database ERD)

```mermaid
erDiagram
    WebhookEvent {
        uuid id PK
        string eventId UK
        string eventType
        string source
        jsonb payload
        string status
        text errorMessage
        datetime processedAt
        datetime createdAt
    }

    Lead {
        uuid id PK
        string externalId UK
        string source
        string name
        string email
        string phone
        string campaignId
        string campaignName
        string adId
        string adName
        string formId
        string formName
        string city
        jsonb interests
        jsonb customQuestions
        string ttclid
        string utmSource
        string utmCampaign
        jsonb rawData
        int bitrix24Id
        string status
        int syncVersion
        text syncError
        datetime createdAt
        datetime updatedAt
    }

    Deal {
        uuid id PK
        uuid leadId FK
        string ruleId
        int bitrix24Id
        string title
        string pipelineId
        string stage
        decimal amount
        string currency
        int probability
        string assignedTo
        jsonb conversionMetadata
        string status
        datetime createdAt
        datetime updatedAt
    }

    Configuration {
        int id PK
        string key UK
        jsonb value
        datetime updatedAt
    }

    AuditLog {
        uuid id PK
        uuid leadId FK
        string action
        string entityType
        string entityId
        jsonb details
        datetime createdAt
    }

    CampaignMetric {
        uuid id PK
        string campaignId UK
        string campaignName
        int totalLeads
        int syncedLeads
        int convertedDeals
        int wonDeals
        decimal totalRevenue
        decimal estimatedCost
        datetime updatedAt
    }

    SyncJob {
        uuid id PK
        string jobType
        string status
        int progress
        int totalItems
        int processedItems
        int failedItems
        jsonb metadata
        datetime startedAt
        datetime completedAt
        datetime createdAt
    }

    DlqRecord {
        uuid id PK
        string queueName
        string jobId
        string jobName
        jsonb payload
        text errorMessage
        text stackTrace
        int attempts
        boolean resolved
        datetime createdAt
    }

    Lead ||--o{ Deal : "creates"
    Lead ||--o{ AuditLog : "tracks"
```

---

### 3. Cấu Trúc Mã Nguồn (NestJS Monorepo MVC Structure)

Toàn bộ nghiệp vụ được cấu trúc module hoá theo chuẩn Clean Architecture trong thư mục `src/modules/`:

```
src/
├── app.module.ts                       # Root AppModule khai báo Global Interceptors, Guards, Schedule
├── main.ts                             # Bootstrap server, Swagger OpenAPI, Global ValidationPipe
├── config/
│   └── configuration.ts                # Strongly typed env configuration & default values
├── common/
│   ├── constants/                      # API, Queue, Error Messages constants
│   ├── decorators/                     # @Public() decorator bypass API Key Guard
│   ├── filters/                        # HttpExceptionFilter, PrismaClientExceptionFilter
│   ├── guards/                         # ApiKeyGuard (x-api-key), TikTokSignatureGuard (HMAC-SHA256)
│   ├── interceptors/                   # LoggingInterceptor, TransformInterceptor (Envelope chuẩn)
│   ├── logger/                         # AppLogger (Pino structured logger)
│   └── normalizers/                    # phone.normalizer.ts (E.164), email.normalizer.ts
├── database/
│   ├── prisma.service.ts               # Prisma Client kết nối PostgreSQL với shutdown hooks
│   └── database.module.ts              # Global DatabaseModule
└── modules/
    ├── analytics/                      # Phễu chuyển đổi, CPL, ROI, Quality Score, Scheduled Reports
    │   ├── controllers/                # analytics.controller.ts, report.controller.ts
    │   └── services/                   # analytics.service.ts, report-export.service.ts, scheduled-reports.service.ts
    ├── bitrix/                         # Bitrix24 REST Client, Token Bucket Rate Limiter, Retry Service
    │   ├── constants/                  # BITRIX_API_METHODS, BITRIX_CONSTANTS
    │   ├── controllers/                # bitrix-webhook.controller.ts (nhận deal won, anti-echo)
    │   ├── interfaces/                 # IBitrixCrmAdapter, Payload interfaces
    │   └── services/                   # bitrix-real.adapter.ts, bitrix-mock.adapter.ts, retry.service.ts
    ├── config-mgmt/                    # Quản lý cấu hình Field Mapping và Deal Rules động trong DB
    │   ├── controllers/                # config.controller.ts
    │   └── services/                   # config.service.ts
    ├── deal/                           # Quản lý Deal, điều phối chuyển đổi, timeout reconciliation
    │   ├── controllers/                # deal.controller.ts
    │   └── services/                   # deal.service.ts, deal-conversion.service.ts
    ├── health/                         # Terminus Healthcheck (/api/v1/health)
    ├── lead/                           # Quản lý Lead, Deduplication, Mapping, Batch Migration
    │   ├── controllers/                # lead.controller.ts
    │   └── services/                   # lead.service.ts, lead-deduplication.service.ts, batch-migration.service.ts
    ├── queue/                          # Bộ xử lý hàng đợi BullMQ (Workers)
    │   ├── processors/                 # lead-processing.worker, bitrix-sync.worker, deal-conversion.worker, tiktok-events-sync.worker
    │   └── queue.module.ts             # Cấu hình 4 hàng đợi Redis BullMQ và retry backoff
    ├── rule-engine/                    # Động cơ đánh giá điều kiện chuyển đổi Deal (CONTAINS, >, IN...)
    │   └── services/                   # rule-evaluator.service.ts
    ├── tiktok/                         # Tiếp nhận Webhook TikTok, bảo mật signature, DB idempotency
    │   ├── controllers/                # tiktok-webhook.controller.ts
    │   └── services/                   # tiktok-webhook.service.ts
    └── tiktok-events/                  # Client TikTok Offline Conversion Events API kèm băm SHA-256 PII
        ├── interfaces/                 # ITikTokEventsAdapter
        └── services/                   # tiktok-events-real.adapter.ts, tiktok-events-mock.adapter.ts
scripts/
├── simulate-tiktok-webhook.ts          # CLI bắn Webhook TikTok kèm sinh chữ ký HMAC-SHA256 tự động
├── simulate-bitrix-webhook.ts          # CLI bắn Webhook Bitrix24 khi Deal WON
└── export-swagger.ts                   # CLI trích xuất OpenAPI Swagger schema ra docs/swagger.json
```

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack) & Kiến Trúc Lựa Chọn (Architectural Rationale)

| Thành Phần              | Công Nghệ / Thư Viện     |      Phiên Bản      | Lý Do Lựa Chọn & Phân Tích Kỹ Thuật (Architectural Rationale)                                                             |
| :---------------------- | :----------------------- | :-----------------: | :------------------------------------------------------------------------------------------------------------------------ |
| **Runtime**             | **Node.js**              |  **v20.x / v22.x**  | Non-blocking Event Loop xử lý hiệu quả lượng lớn kết nối I/O-bound webhooks đồng thời với mô hình bất đồng bộ; native crypto HMAC-SHA256 tối ưu.         |
| **Framework**           | **NestJS Core**          |     **v12.0.1**     | Clean Architecture chuẩn Enterprise, module hóa độc lập, Dependency Injection mạnh mẽ cho phép đảo ngược phụ thuộc (DIP) và tráo đổi Adapters linh hoạt. |
| **Ngôn Ngữ**            | **TypeScript**           |     **v6.0.2**      | Strict Type-Safety cấp độ biên dịch, giảm thiểu tối đa runtime bugs; decorator metadata hỗ trợ Swagger OpenAPI và DTO validation tự động.                |
| **Cơ Sở Dữ Liệu**       | **PostgreSQL**           |    **v15 / v16**    | Ràng buộc ACID nghiêm ngặt, chỉ mục độc bản (Unique index) làm nền tảng cho Database-First Idempotency; cột `JSONB` tối ưu cho dynamic schema.           |
| **ORM**                 | **Prisma ORM**           |     **v5.22.0**     | Type-safe Query Builder giảm thiểu SQL Injection, hỗ trợ migration declarative nhất quán và tích hợp transaction an toàn (`prisma.$transaction`).        |
| **Hàng Đợi & Quota**    | **BullMQ + Redis**       | **v5.34.4 / v7.x**  | In-memory message broker độ trễ thấp, tích hợp Token Bucket Rate Limiting (2 RPS cho Bitrix API), Backoff Jitter Retry và Dead Letter Queue.             |
| **Giám Sát (Metrics)**  | **Prometheus + Grafana** |  **v2.51 / v10.4**  | Thu thập real-time metrics độ trễ HTTP, Queue Lag, Rate Limit Contention qua `/metrics`; Dashboard trực quan giám sát toàn diện tại port 3001.           |
| **Tài Liệu API**        | **Swagger / OpenAPI**    |     **v12.0.1**     | Tự động sinh tài liệu tương tác chuẩn OpenAPI 3.0 tại `/docs` và xuất schema tĩnh `docs/swagger.json` cho client SDK generation.                         |
| **Lập Lịch Ngầm**       | **@nestjs/schedule**     |     **v12.0.1**     | Điều phối Cron jobs phi tập trung định kỳ: sinh báo cáo phễu chuyển đổi hàng ngày và kích hoạt giám sát cảnh báo ngưỡng lỗi hệ thống tự động.            |
| **Logging Chuẩn Hóa**   | **Pino (nestjs-pino)**   | **v10.3.1 / v5.1**  | Structured JSON Logging tốc độ vượt trội, hỗ trợ log correlation ID và trace context phân tán.                                                           |
| **Testing Framework**   | **Jest + @swc/jest**     | **v30.5 / v0.2.39** | **50 test suites / 233 unit tests + 22 E2E tests (100% Pass)**, **Coverage > 80% mọi chỉ số**; SWC tăng tốc độ chạy test suite.                          |
| **Đóng Gói Triển Khai** | **Docker & Compose**     |   **Multi-stage**   | Multi-stage build tối ưu kích thước image, cô lập môi trường chuẩn, tích hợp sẵn Healthchecks cho cả PostgreSQL, Redis và App.                           |

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy Nhanh

### 1. Cài Đặt Dependencies

```bash
npm install
```

### 2. Cấu Hình Biến Môi Trường (.env)

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Bảng mô tả các biến môi trường quan trọng:

| Biến Môi Trường                 | Giá Trị Mẫu / Mặc Định                                                            | Ý Nghĩa / Mục Đích                                                      |
| :------------------------------ | :-------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| `NODE_ENV`                      | `development`                                                                     | Môi trường chạy (`development`, `production`, `test`)                   |
| `PORT`                          | `3000`                                                                            | Cổng HTTP ứng dụng NestJS lắng nghe                                     |
| `API_KEY`                       | `aasc-secure-api-key-2026`                                                        | Khóa xác thực header `x-api-key` cho các endpoint quản trị `/api/v1/*`  |
| `DATABASE_URL`                  | `postgresql://postgres:postgres123@localhost:5432/tiktok_bitrix_db?schema=public` | Chuỗi kết nối cơ sở dữ liệu PostgreSQL                                  |
| `REDIS_HOST` / `REDIS_PORT`     | `localhost` / `6379`                                                              | Thông số kết nối Redis Server cho hàng đợi BullMQ & Cache               |
| `REDIS_PASSWORD`                | `redis123`                                                                        | Mật khẩu Redis Server (nếu có cấu hình)                                 |
| `TIKTOK_SECRET_TOKEN`           | `tiktok_secret_token_12345`                                                       | Khóa bí mật dùng để kiểm tra chữ ký HMAC-SHA256 (`TikTok-Signature`)    |
| `TIKTOK_APP_ID`                 | `7123456789`                                                                      | Định danh ứng dụng TikTok Developer Ads App                             |
| `USE_MOCK_TIKTOK_EVENTS`        | `true`                                                                            | Bật/tắt chế độ giả lập TikTok Offline Conversion Events API             |
| `TIKTOK_EVENTS_ACCESS_TOKEN`    | `mock_tiktok_events_token`                                                        | Access token gửi sự kiện chuyển đổi sang TikTok Events API              |
| `TIKTOK_PIXEL_CODE`             | `mock_pixel_code`                                                                 | Mã Pixel ID TikTok gắn với tài khoản quảng cáo                          |
| `BITRIX_WEBHOOK_URL`            | `https://b24-sample.bitrix24.vn/rest/1/sampletoken123`                            | Đường dẫn Inbound Webhook của cổng Bitrix24 CRM                         |
| `BITRIX_INBOUND_WEBHOOK_SECRET` | `sampletoken123`                                                                  | Token xác thực request webhook Outbound dội ngược từ Bitrix24           |
| `USE_MOCK_BITRIX`               | `true`                                                                            | Bật/tắt chế độ giả lập Bitrix24 (chạy local độc lập không cần CRM thật) |
| `BITRIX_RATE_LIMIT_RPS`         | `2`                                                                               | Giới hạn số lượng request tối đa mỗi giây gửi tới Bitrix24 REST API     |
| `BITRIX_MAX_RETRIES`            | `3`                                                                               | Số lần thử lại tối đa khi CRM gặp lỗi mạng tạm thời hoặc 5xx            |
| `QUEUE_CONCURRENCY`             | `5`                                                                               | Số lượng jobs xử lý đồng thời trong mỗi BullMQ Worker                   |

### 3. Khởi Tạo Cơ Sở Dữ Liệu & Seed Data

```bash
# Sinh Prisma Client
npx prisma generate

# Đồng bộ schema vào PostgreSQL
npx prisma db push

# Nạp cấu hình mẫu (Field mappings & Deal rules)
npm run prisma:seed
```

### 4. Khởi Chạy Ứng Dụng

#### Cách A: Chạy với Docker Compose (Khuyên dùng)

```bash
docker-compose up -d --build
```

_Tự động khởi chạy 5 containers hoàn chỉnh: PostgreSQL 16, Redis 7, NestJS App, Prometheus 2.51 (`:9090`), và Grafana 10.4 (`:3001`)._

#### Cách B: Chạy Trực Tiếp Bằng Node.js Local

```bash
# Chế độ phát triển (watch mode):
npm run start:dev

# Chế độ Production:
npm run build
npm run start:prod
```

- **Swagger API Docs tương tác:** 👉 `http://localhost:3000/docs`
- **Kiểm tra trạng thái hệ thống (Healthcheck):** 👉 `http://localhost:3000/api/v1/health`
- **Prometheus Metrics Scrape:** 👉 `http://localhost:3000/metrics`
- **Grafana Observability Dashboard:** 👉 `http://localhost:3001` (Tài khoản: `admin` / Mật khẩu: `admin`)

---

## 💻 Các Lệnh Thao Tác, Kiểm Thử & CLI Simulators

| Mục Đích Thao Tác            | Câu Lệnh npm                                                  | Mô Tả Chi Tiết                                                                           |
| :--------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| **Chạy Unit Tests**          | `npm test`                                                    | Thực thi **233 unit tests** trên toàn bộ **50 test suites** bằng Jest + SWC (100% Pass). |
| **Đo Độ Phủ Coverage**       | `npm run test:cov`                                            | Đo độ phủ mã nguồn: **96.27% Lines, 95.45% Statements, 82.45% Branches, 95.85% Funcs**.  |
| **Chạy E2E Tests**           | `npm run test:e2e`                                            | Kiểm thử độc lập toàn trình **22 kịch bản E2E** bằng Jest + Supertest (100% Pass).       |
| **Chạy System QA Tests**     | `npm run test:system`                                         | Chạy bộ 25 bài kiểm thử hệ thống tự động kiểm tra toàn bộ luồng tích hợp thực tế.        |
| **Dọn Dẹp Dữ Liệu Test**     | `npm run clean:test-data`                                     | Tự động dọn dẹp sạch sẽ dữ liệu test trên Bitrix24 CRM, PostgreSQL và Redis.             |
| **Kiểm Tra ESLint**          | `npm run lint`                                                | Kiểm tra chất lượng mã nguồn bằng ESLint (0 errors, 0 warnings).                         |
| **Xuất OpenAPI Swagger**     | `npm run swagger:export`                                      | Trích xuất OpenAPI JSON schema lưu vào file `docs/swagger.json`.                         |
| **Giả Lập TikTok Webhook**   | `npm run simulate:tiktok`                                     | Tự động sinh payload chuẩn và chữ ký HMAC-SHA256 gửi tới webhook receiver.               |
| **Test Event Form Hoàn Tất** | `npx tsx scripts/simulate-tiktok-webhook.ts form.complete`    | Giả lập sự kiện form submission brochure download.                                       |
| **Test Event Tương Tác**     | `npx tsx scripts/simulate-tiktok-webhook.ts user.interaction` | Giả lập sự kiện người dùng điền khảo sát trên TikTok.                                    |
| **Giả Lập Bitrix Deal WON**  | `npm run simulate:bitrix 5001 WON`                            | Giả lập webhook Bitrix khi Deal đạt trạng thái WON để kích hoạt TikTok Events.           |
| **Biên Dịch Dự Án**          | `npm run build`                                               | Biên dịch toàn bộ mã nguồn TypeScript sang thư mục `dist/`.                              |

---

## 📡 Danh Sách API Endpoints Hoàn Chỉnh

> **Ghi chú bảo mật:** Các endpoint bắt đầu bằng `/api/v1/*` yêu cầu header `x-api-key: aasc-secure-api-key-2026`. Các endpoint `/webhooks/*`, `/api/v1/health` và `/metrics` là Public.

| Method | Endpoint                                 |      Xác Thực       | Mô Tả Chức Năng                                                                                             |
| :----- | :--------------------------------------- | :-----------------: | :---------------------------------------------------------------------------------------------------------- |
| `POST` | `/webhooks/tiktok/leads`                 | `TikTok-Signature`  | Tiếp nhận webhook từ TikTok Lead Ads, kiểm tra HMAC, DB idempotency và đẩy queue.                           |
| `POST` | `/webhooks/bitrix24/deals`               | `application_token` | Nhận webhook từ Bitrix24 khi Deal đổi trạng thái; kích hoạt TikTok Event nếu WON.                           |
| `GET`  | `/metrics`                               |       Public        | Expose metrics Prometheus (Queue Lag, HTTP Latency Histogram, Redis Lock, Conversion Counters).             |
| `GET`  | `/api/v1/leads`                          |     `x-api-key`     | Truy vấn danh sách Leads có phân trang, lọc theo `source`, `campaign_id`, `status`.                         |
| `GET`  | `/api/v1/leads/:id`                      |     `x-api-key`     | Xem thông tin chi tiết một Lead, kèm danh sách Deal và lịch sử Audit Log.                                   |
| `POST` | `/api/v1/leads/:id/convert-to-deal`      |     `x-api-key`     | Chuyển đổi thủ công một Lead thành Deal trên Bitrix24 với tham số ghi đè.                                   |
| `POST` | `/api/v1/leads/batch-migrate`            |     `x-api-key`     | Kích hoạt tác vụ di chuyển dữ liệu lịch sử hàng loạt vào Bitrix24 có rate limiting.                         |
| `GET`  | `/api/v1/leads/batch-migrate/:jobId`     |     `x-api-key`     | Tra cứu trạng thái và tiến độ xử lý của tác vụ batch migration.                                             |
| `GET`  | `/api/v1/deals`                          |     `x-api-key`     | Lấy danh sách Deals có phân trang, lọc theo `status`, `stage`, `assigned_to`.                               |
| `GET`  | `/api/v1/config/mappings`                |     `x-api-key`     | Lấy cấu hình ánh xạ trường TikTok $\rightarrow$ Bitrix24 (`field_mapping`) hiện tại.                        |
| `PUT`  | `/api/v1/config/mappings`                |     `x-api-key`     | Cập nhật cấu hình ánh xạ trường mới và chiến lược merge (`merge_strategy`).                                 |
| `GET`  | `/api/v1/config/rules`                   |     `x-api-key`     | Lấy danh sách các luật chuyển đổi Deal tự động (`deal_rules`).                                              |
| `PUT`  | `/api/v1/config/rules`                   |     `x-api-key`     | Cập nhật hoặc bổ sung các điều kiện chuyển đổi Deal tự động mới.                                            |
| `GET`  | `/api/v1/analytics/conversion-rates`     |     `x-api-key`     | Báo cáo tỷ lệ chuyển đổi phễu toàn diện (Leads $\rightarrow$ Synced $\rightarrow$ Deals $\rightarrow$ Won). |
| `GET`  | `/api/v1/analytics/campaign-performance` |     `x-api-key`     | Báo cáo hiệu năng từng chiến dịch: CPL, Doanh thu, ROI, Điểm chất lượng (0-100).                            |
| `GET`  | `/api/v1/reports/export`                 |     `x-api-key`     | Xuất dữ liệu ra file CSV/Excel (UTF-8 BOM) hoặc JSON (`?format=csv&date_range=30d`).                        |
| `GET`  | `/api/v1/health`                         |       Public        | Kiểm tra trạng thái hoạt động của Service và kết nối cơ sở dữ liệu PostgreSQL.                              |

---

## 🛡️ Xử Lý Lỗi, Quota & Tối Ưu Hiệu Năng (Resilience Architecture)

### 1. Bảng Tổng Hợp Cơ Chế Chịu Lỗi & Tối Ưu

| Thách Thức Kỹ Thuật                             | Giải Pháp Kiến Trúc Triển Khai                                                                                                                                                         | Kiểm Chứng Thực Tế                                                                                                         |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Race Condition Webhook**                      | Ghi nhận trực tiếp vào bảng `webhook_events` có khoá `UNIQUE (event_id)`. Bắt lỗi `P2002` để trả về phản hồi `200/201 status: ignored` an toàn, không sinh duplicate job.              | Webhook bắn liên tục cùng 1 `event_id` $\rightarrow$ Chỉ có đúng 1 job duy nhất được nạp vào queue.                        |
| **Quản Lý Quota Bitrix24 (2 RPS)**              | Triển khai **Token Bucket Rate Limiter** kết hợp BullMQ queue limiter (`limiter: { max: 2, duration: 1000 }`), phân phối đều nhịp độ gọi API.                                          | Điều phối nhịp độ gọi API tuần tự, triệt tiêu lỗi **HTTP 429 Too Many Requests** khi có đợt dồn tải.                       |
| **Khóa Phân Tán (Distributed Locking)**         | `RedisService.acquireLock` sử dụng atomic `SET NX PX` với Owner UUID độc bản và Lua script giải phóng lock an toàn, chống ghi đè dữ liệu khi nhiều worker xử lý song song.             | 100% thread-safe trong môi trường xử lý bất đồng bộ đa luồng.                                                              |
| **Khả Năng Chịu Lỗi Mạng (Fault Tolerance)**    | `RetryService` áp dụng **Exponential Backoff & 25% Jitter** khi gặp sự cố tạm thời (`ECONNRESET`, `ETIMEDOUT`, HTTP 5xx), chống hiện tượng _Thundering Herd_.                          | Thử nghiệm ngắt kết nối CRM tạm thời $\rightarrow$ Hệ thống tự động thử lại nhịp nhàng và hoàn tất khi CRM online trở lại. |
| **Mất Dữ Liệu Khi Timeout Gọi Deal**            | **Timeout Reconciliation Pattern**: Khi tạo Deal bị timeout mạng nhưng CRM thực tế đã ghi nhận, hệ thống tự động gọi `findDealByTitle` để liên kết ID thay vì tạo thêm deal trùng lặp. | Đạt 100% trong Unit Test `should reconcile by title search if createDeal throws an error`.                                 |
| **Vòng Lặp Vô Tận (Anti-Echo Loop)**            | `BitrixWebhookController` lưu bộ nhớ đệm sliding TTL 15s các ID Deal vừa cập nhật, bỏ qua các webhook phản hồi dội lại từ phía Bitrix24.                                               | Bắn webhook dội lại cho Deal vừa cập nhật $\rightarrow$ Hệ thống nhận diện `self_echo` và huỷ bỏ an toàn.                  |
| **Chống Trùng Lặp Khách Hàng (Deduplication)**  | Tra cứu kết hợp Email và SĐT chuẩn hóa trên Database nội bộ và qua hàm Bitrix `crm.duplicate.findbycomm`. Hợp nhất theo cấu hình `merge_strategy`.                                     | Lead trùng SĐT hoặc Email được tự động liên kết với Lead ID sẵn có, ghi vết rõ ràng vào `audit_logs`.                      |
| **Bảo Mật Quyền Riêng Tư (PII Hashing)**        | Dữ liệu nhạy cảm (`email`, `phone`) được trim, lowercase và băm chuẩn **SHA-256** trước khi gửi tới TikTok Offline Conversion API theo quy định bảo mật.                               | Kiểm tra gói tin gửi sang TikTok Events API $\rightarrow$ 100% PII đều ở dạng chuỗi băm 64 ký tự hex an toàn.              |
| **Hiển Thị Tiếng Việt Trên Excel**              | Chèn Byte Order Mark (`\uFEFF`) vào đầu file xuất CSV khi gọi endpoint `/reports/export?format=csv` hoặc `format=excel`.                                                               | Mở file trực tiếp trên Microsoft Excel Windows/Mac hiển thị tiếng Việt có dấu sắc nét, không bị lỗi font (mojibake).       |
| **Quản Lý Lỗi Kiệt Quệ (Dead Letter Queue)**    | Khi một background job thất bại vượt quá số lần retry cho phép (3 - 5 lần), worker tự động lưu trạng thái vào bảng `dlq_records` để cảnh báo.                                          | Tự động phát hiện lỗi và gửi thông báo cảnh báo qua dịch vụ scheduled alerts.                                              |
| **Cách Ly Môi Trường Test E2E Không Cần Redis** | Test harness trong `test/app.e2e-spec.ts` tự động mock `RedisService`, loại bỏ hoàn toàn hiện tượng reconnect retry gây timeout trong môi trường CI/CD không có Redis container.       | Toàn bộ 22 bài test E2E thực thi độc lập 100%, không phụ thuộc hạ tầng bên ngoài.                                          |

### 2. Chiến Lược Caching & Phòng Chống 3 Rủi Ro Cache Kinh Điển (Cache Risks Mitigation)

Hệ thống áp dụng mô hình **Cache-Aside (Lazy Loading)** kết hợp **Write-Through Invalidation** cho cấu hình động (`field_mapping`, `deal_rules`) và các chỉ số Campaign Metrics. Dưới góc nhìn thiết kế phân tán quy mô lớn, 3 rủi ro caching kinh điển đã được triệt tiêu hoàn toàn:

```mermaid
flowchart LR
    A["Client / Worker Request"] --> B{"1. Cache Hit in Redis?"}
    B -->|"Yes"| C["Return Cached Data from Redis"]
    B -->|"No (Miss / Null Object)"| D{"Is Null Sentinel?"}
    D -->|"Yes (Penetration Guard)"| E["Return 404 Immediately (No DB Hit)"]
    D -->|"No"| F["2. Acquire Distributed Mutex Lock<br/>SET NX PX (Breakdown Guard)"]
    F -->|"Lock Acquired"| G["Query PostgreSQL DB"]
    G --> H["Write to Redis with Random Jitter TTL<br/>BaseTTL ± 10-20% (Avalanche Guard)"]
    H --> I["Release Mutex via Lua Script"]
    I --> J["Return Fresh Data"]
    F -->|"Lock Busy"| K["Sleep Backoff & Retry Cache Read"]
    K --> B
```

#### 🛡️ Rủi Ro 1: Cache Penetration (Thâm Nhập Cache)

- **Bản chất nguy cơ:** Truy vấn liên tục các bản ghi **không tồn tại** (ví dụ: hacker dò quét `lead_id` giả, hoặc request rác liên tục). Do Cache không có dữ liệu, mọi request đều xuyên thẳng xuống Database, làm cạn kiệt Connection Pool của PostgreSQL.
- **Biện pháp phòng chống:**
  1. **Strict DTO Validation & Sanitization:** Tầng HTTP Gateway sử dụng `ValidationPipe` với `{ whitelist: true, forbidNonWhitelisted: true }`, kiểm tra chặt chẽ định dạng UUID và regex số điện thoại/email trước khi vào controller.
  2. **Cache Null Object (Negative Caching):** Khi một truy vấn tìm kiếm (như `findById`) trả về kết quả rỗng từ Database, hệ thống vẫn lưu một sentinel value (ví dụ `"{ __null__: true }"`) vào Redis với **TTL ngắn**. Các request cùng ID kế tiếp sẽ dừng ngay tại Redis mà không đánh xuống PostgreSQL.
  3. **Bloom Filter (Production Roadmap):** Tích hợp Redis Bloom Filter (`BF.ADD` / `BF.EXISTS`) ở tầng Ingestion để lọc nhanh các ID chưa từng được sinh ra với độ phức tạp $O(1)$ và chi phí RAM tối ưu.

#### 🛡️ Rủi Ro 2: Cache Avalanche (Tuyết Lở Cache)

- **Bản chất nguy cơ:** Một số lượng lớn cache keys (như cấu hình ánh xạ, toàn bộ bảng luật chuyển đổi, campaign stats) được thiết lập cùng một mốc TTL cố định và **đồng loạt hết hạn tại cùng một thời điểm $T_0$**. Hàng ngàn requests đồng thời dội thẳng xuống DB khiến DB chịu tải đột biến (spike) dẫn đến sập hệ thống (Cascading Failure).
- **Biện pháp phòng chống:**
  1. **TTL Random Jitter:** Không bao giờ gán TTL là một hằng số cố định. Mọi key đều được áp dụng công thức ngẫu nhiên:  
     $$\text{Actual TTL} = \text{Base TTL} \pm \text{UniformRandom}(0.1 \times \text{Base TTL}, 0.2 \times \text{Base TTL})$$  
     Điều này làm phân tán mốc hết hạn của các keys trải đều theo trục thời gian, làm phẳng tải truy vấn xuống DB.
  2. **Cache Pre-warming (Làm nóng trước):** Ngay khi ứng dụng khởi động (`onApplicationBootstrap`), hệ thống tự động tải cấu hình `field_mapping` và `deal_rules` từ DB vào Redis Cache, đảm bảo hệ thống sẵn sàng phục vụ tải cao ngay từ ban đầu.
  3. **High Availability Deployment:** Cấu hình cụm Redis Sentinel / Redis Cluster nhiều nodes có Read-Replica, ngăn ngừa rủi ro sập node cache vật lý.

#### 🛡️ Rủi Ro 3: Cache Breakdown / Stampede (Đột Thủng Cache / Đám Đông Giẫm Đạp)

- **Bản chất nguy cơ:** Xảy ra với một **Hot Key** chịu tần suất truy vấn cực cao (ví dụ: luật chuyển đổi `deal_rules` toàn hệ thống hoặc metric của campaign đang chạy Flash Sale). Khi key này vừa hết hạn, hàng ngàn background workers cùng lúc nhận thấy cache miss và đồng loạt tranh nhau query DB để tính toán lại, gây nghẽn cổ chai cục bộ tại Database.
- **Biện pháp phòng chống:**
  1. **Distributed Mutex Locking (`RedisService.acquireLock`):** Khi gặp cache miss đối với hot key, worker buộc phải tranh chấp một Distributed Lock qua lệnh atomic `SET lock:key owner_uuid NX PX 5000`.
  2. **Chỉ duy nhất 1 Worker được query DB:** Worker chiếm được lock sẽ chịu trách nhiệm query PostgreSQL, cập nhật lại dữ liệu vào Redis Cache và release lock bằng **Lua script** atomic.
  3. **Non-blocking Wait & Read:** Các worker không chiếm được lock sẽ sleep ngắn bằng Exponential Backoff rồi đọc lại từ Redis Cache (lúc này đã được nạp dữ liệu mới), hoàn toàn không có thêm request nào đánh xuống DB.

---

## 🧪 Kết Quả Kiểm Thử (Test Coverage & Verification)

### Báo Cáo Độ Phủ Mã Nguồn (Jest Test Coverage Report)

Hệ thống đạt chuẩn kiểm thử toàn diện với **233 unit tests (50 suites)** và **22 E2E tests** (100% Pass), đảm bảo Code Coverage $\ge 80\%$ cho toàn bộ các tiêu chí Statements, Branches, Functions và Lines.

---

## 📊 Hệ Thống Giám Sát Metrics (Prometheus & Grafana Observability)

Hệ thống cung cấp kiến trúc **Full Observability** chuẩn Production, tự động thu thập và trực quan hóa toàn bộ chỉ số hoạt động của ứng dụng, hàng đợi và kết nối CRM bên ngoài.

```mermaid
flowchart LR
    A["NestJS Application<br/>(MetricsService)"] -->|"/metrics (Scrape 5s)"| B["Prometheus Server<br/>Port 9090"]
    B -->|"Data Source"| C["Grafana Dashboard<br/>Port 3001"]
    C --> D["Operations & DevOps Teams<br/>Alerts & Insights"]
```

### 1. Hướng Dẫn Truy Cập Dashboard Giám Sát

Toàn bộ cấu hình Prometheus và Grafana đã được đóng gói sẵn (**Provisioning tự động**) trong Docker Compose:

- **Grafana Dashboard URL:** 👉 [`http://localhost:3001`](http://localhost:3001)
  - **Tài khoản mặc định:** `admin`
  - **Mật khẩu mặc định:** `admin`
  - **Dashboard tích hợp:** Chọn mục **Dashboards** $\rightarrow$ **TikTok & Bitrix24 Sync Observability**.
- **Prometheus Metrics Server:** 👉 [`http://localhost:9090`](http://localhost:9090) (Kiểm tra Targets tại `/targets`).
- **Endpoint Metrics Thô của App:** 👉 [`http://localhost:3000/metrics`](http://localhost:3000/metrics) (Chuẩn định dạng Prometheus Text Exposition).

### 2. Các Chỉ Số Cốt Lõi Được Trực Quan Hóa Trên Dashboard

| Panel Dashboard                         | Loại Metric Prometheus                          | Ý Nghĩa Vận Hành & Giá Trị Giám Sát Thực Tiễn                                                                                       |
| :-------------------------------------- | :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **BullMQ Queue Lag & Backlog**          | `bullmq_queue_jobs_total{status="waiting"}`     | Số lượng jobs đang xếp hàng chờ xử lý trên 4 queues (`lead-processing`, `bitrix-sync`, `deal-conversion`, `tiktok-events-sync`). Cảnh báo quá tải. |
| **Bitrix24 Rate Limit Contention**      | `bitrix_rate_limit_waits_total`                 | Tần suất các request phải xếp hàng chờ trong Token Bucket (2 RPS) của Bitrix24. Giúp đánh giá áp lực lưu lượng lên CRM đối tác.                    |
| **HTTP Request Latency (p95 / p99)**    | `http_request_duration_seconds{quantile="..."}` | Phân phối độ trễ xử lý các HTTP endpoints. Đảm bảo Webhook Ingestion luôn phản hồi nhanh chóng (dưới ngưỡng timeout) để tránh bị TikTok retry spam.|
| **Dead Letter Queue (DLQ) Accumulator** | `bullmq_dlq_jobs_total`                         | Số lượng background jobs kiệt quệ retry (thất bại $\ge 3$ lần). Kích hoạt alert khẩn cấp cho đội ngũ trực On-call can thiệp.                       |
| **Lead Conversion Funnel Realtime**     | `sync_leads_total{status="won\|deal\|lead"}`    | Biểu đồ phễu kinh doanh: TikTok Leads $\rightarrow$ Leads Synced $\rightarrow$ Deals Created $\rightarrow$ Deals Won theo thời gian thực.          |
| **Distributed Lock Contention Rate**    | `redis_lock_acquire_duration_seconds`           | Đo lường độ trễ và tỷ lệ va chạm khóa phân tán giữa các worker pods song song.                                                                     |

---

## 💡 Quyết Định Kỹ Thuật (Technical Decisions & Architectural Trade-offs)

Các quyết định công nghệ trong hệ thống được cân nhắc dựa trên tính toàn vẹn dữ liệu, độ ổn định và chi phí vận hành:

1. **Database-First Idempotency thay vì Redis In-Memory**:
   - _Bối cảnh:_ TikTok Webhook có cơ chế retry liên tục khi mạng giật lag hoặc thời gian phản hồi chạm ngưỡng timeout của webhook.
   - _Trade-off:_ Cơ chế Redis `SET NX` tuy nhanh nhưng tồn tại rủi ro mất dữ liệu khi Redis restart, đầy bộ nhớ (eviction policy), hoặc trong môi trường Redis Cluster khi có network split-brain.
   - _Quyết định:_ Ghi nhận trực tiếp vào bảng `webhook_events` có ràng buộc `UNIQUE (event_id)` trên PostgreSQL trong transaction. Bắt mã lỗi Prisma `P2002` để lập tức trả về `200/201 Ignored`. Đảm bảo tính toán vẹn ACID $100\%$, triệt tiêu hoàn toàn khả năng duplicate lead.
2. **Token Bucket Rate Limiting (2 RPS) Tại Tầng Worker**:
   - _Bối cảnh:_ Bitrix24 Inbound Webhook giới hạn cứng 2 requests/giây trên toàn bộ tài khoản CRM. Bất kỳ request vượt ngưỡng nào đều bị trả về HTTP 429 Too Many Requests và có nguy cơ bị khóa tạm thời.
   - _Trade-off:_ Không thể bắn trực tiếp API ngay khi nhận webhook.
   - _Quyết định:_ Phân luồng qua hàng đợi BullMQ với bộ điều tốc kép: BullMQ queue limiter (`limiter: { max: 2, duration: 1000 }`) kết hợp Promise Queue Throttler tại adapter. Điều phối lưu lượng mượt mà, hấp thụ hoàn toàn các đợt bùng nổ traffic (traffic spikes) từ TikTok Ads mà CRM không bao giờ quá tải.
3. **Kiến Trúc Clean Architecture & Hexagonal Ports/Adapters**:
   - _Quyết định:_ Định nghĩa các interfaces độc lập (`IBitrixCrmAdapter`, `ITikTokEventsAdapter`). Khởi tạo các implementation riêng biệt (`BitrixRealAdapter` vs `BitrixMockAdapter`).
   - _Giá trị:_ Cho phép kiểm thử tự động toàn diện $100\%$ các luồng nghiệp vụ trong môi trường CI/CD không cần mạng ngoài qua biến cờ `USE_MOCK_BITRIX=true`. Dễ dàng mở rộng sang các CRM khác (Salesforce, HubSpot) trong tương lai chỉ bằng việc thêm Adapter mới mà không ảnh hưởng tới lõi nghiệp vụ.
4. **Prisma ORM & PostgreSQL JSONB Schema Dynamic Adaptability**:
   - _Quyết định:_ Sử dụng PostgreSQL 16 với các cột `JSONB` được đánh chỉ mục GIN cho các trường câu hỏi tùy biến (`custom_questions`), dữ liệu thô (`raw_data`), và bảng cấu hình (`field_mapping`, `deal_rules`).
   - _Giá trị:_ Khắc phục nhược điểm "cứng nhắc" của Relational DB. Khi Marketer tạo thêm trường câu hỏi khảo sát mới trên TikTok Lead Form, hệ thống tự động lưu trữ và cho phép cấu hình mapping động qua API mà không cần chạy lại Migration DDL, không gây downtime hệ thống.
5. **Chuẩn Hóa SĐT E.164 & Bảo Mật PII Theo Chuẩn GDPR / TikTok Ads API**:
   - _Quyết định:_ Chuẩn hóa toàn bộ số điện thoại Việt Nam về chuẩn quốc tế `+84xxxxxxxxx` trước khi deduplicate. Khi gửi sự kiện chuyển đổi ngược về TikTok Offline Events API, dữ liệu nhạy cảm (`email`, `phone`) bắt buộc phải băm **SHA-256** (lowercase, trim).
   - _Giá trị:_ Tăng độ chính xác khi đối soát lead trùng lặp giữa local DB và Bitrix CRM. Đảm bảo tuân thủ nghiêm ngặt luật an toàn thông tin và quy chuẩn bảo mật quốc tế.
6. **Distributed Lock với Unique Owner UUID & Lua Script**:
   - _Quyết định:_ Áp dụng Distributed Lock qua atomic `SET key uuid NX PX ttl`. Giải phóng lock bằng Lua Script đối chiếu đúng Owner UUID.
   - _Giá trị:_ Tránh hiện tượng race condition khi nhiều worker pods xử lý cùng một Lead. Đảm bảo giải phóng lock nguyên tử, loại trừ rủi ro worker chạy chậm xóa nhầm lock của worker khác.

---

## 🚀 Đề Xuất Cải Tiến Cho Môi Trường Production (Production Scalability)

Nhằm đảm bảo hệ thống vận hành bền bỉ khi mở rộng quy mô Enterprise, các giải pháp kiến trúc nâng cấp bao gồm:

### 1. Phân Tách Workload & Scale Độc Lập (Workload Separation)

- **Ingestion Cluster:** Các pods nhẹ chuyên trách tiếp nhận Webhooks, xác thực HMAC-SHA256 và ghi nhanh vào DB/Queue. Cấu hình Horizontal Pod Autoscaler (HPA) theo CPU/Network I/O để co giãn tức thì khi chiến dịch quảng cáo bùng nổ.
- **Worker Cluster:** Các pods chuyên sâu I/O và tính toán, chịu trách nhiệm deduplication, gọi CRM và đồng bộ TikTok Events. Cấu hình KEDA (Kubernetes Event-driven Autoscaling) scale theo độ dài hàng đợi Redis (`queue_lag`).

### 2. Tối Ưu Hóa Tầng Dữ Liệu (Database Scalability & High Availability)

- **PgBouncer Connection Pooling:** Đặt cụm PgBouncer phía trước PostgreSQL (chế độ Transaction Pooling), cho phép duy trì lượng lớn kết nối đồng thời từ worker pods mà vẫn tối ưu số lượng connection thực tế tới Postgres server, ngăn ngừa cạn kiệt connection pool.
- **Read/Write Splitting với Read Replicas:**
  - _Master Node (Write):_ Phục vụ ghi nhận Webhook Ingestion, cập nhật trạng thái Lead/Deal và Audit Log.
  - _Replica Nodes (Read):_ Phục vụ truy vấn báo cáo Analytics, Dashboard, tính toán ROI/CPL và xuất file CSV/Excel khối lượng lớn, triệt tiêu ảnh hưởng tới luồng ghi dữ liệu chính.
- **Table Partitioning (Phân Vùng Bảng Theo Thời Gian):** Phân vùng các bảng dữ liệu lớn (`webhook_events`, `audit_logs`, `leads`) theo tháng (`RANGE PARTITION BY (created_at)`), giúp duy trì tốc độ truy vấn chỉ mục index ổn định qua nhiều năm vận hành.

### 3. Cụm Cache & Queue Phân Tán (Redis Sentinel / Cluster HA)

- **Redis Sentinel HA:** Cấu hình mô hình Master - Replica với Sentinel nodes, tự động phát hiện sự cố và chuyển đổi dự phòng (Automatic Failover) khi Master gặp sự cố mà không làm gián đoạn hàng đợi BullMQ.
- **Redis Cluster Sharding:** Phân bổ các hàng đợi và cache keyspace trên nhiều shards khi dữ liệu vượt quá dung lượng RAM của một máy chủ vật lý.
- **Cấu hình Bền Vững (Persistence):** Kích hoạt chế độ `appendonly yes` với `appendfsync everysec` để đảm bảo an toàn, hạn chế thất thoát job trong queue khi container khởi động lại.

### 4. Chiến Lược Chuyển Dịch Sang Apache Kafka: Khi Nào & Tại Sao?

Hệ thống hiện tại sử dụng **BullMQ + Redis** — đây là lựa chọn phù hợp nhất cho bài toán Task Queue / CRM Rate Limiting hiện tại nhờ hỗ trợ sẵn cơ chế hoãn việc (Delayed Retries), Token Bucket Rate Limiter 2 RPS cho từng worker, quản lý trạng thái công việc chi tiết và chi phí vận hành gọn nhẹ.

Tuy nhiên, trong lộ trình phát triển hệ sinh thái dữ liệu doanh nghiệp lớn, hệ thống sẵn sàng kết hợp hoặc chuyển dịch sang **Apache Kafka** để tận dụng các thế mạnh vượt trội về kiến trúc Event Streaming:

```mermaid
flowchart TD
    subgraph KAFKA_ECOSYSTEM["Enterprise Event-Driven Architecture with Apache Kafka"]
        A["TikTok Webhooks<br/>(Ad Campaigns / Live Events)"] --> B["Ingestion Gateway"]
        B --> C["Kafka Topic: tiktok.leads.raw<br/>(Distributed Commit Log, Partitioned by form_id)"]

        C --> D["Consumer Group 1:<br/>Bitrix24 Sync Service<br/>(Rate Limited 2 RPS)"]
        C --> E["Consumer Group 2:<br/>Data Lake / Snowflake ETL<br/>(Analytics & ML Lead Scoring)"]
        C --> F["Consumer Group 3:<br/>Realtime Marketing Automation<br/>(SMS / Zalo ZNS / Push Noti)"]
        C --> G["Consumer Group 4:<br/>Fraud & Abuse Detection<br/>(Realtime Risk Engine)"]
    end
```

| Tiêu Chí So Sánh | BullMQ + Redis (Hiện Tại) | Apache Kafka (Lộ Trình Nâng Cấp Enterprise) |
| :--- | :--- | :--- |
| **Bản Chất Kiến Trúc** | In-memory Task Queue & Job Scheduler | Distributed Append-Only Commit Log & Event Streaming Platform |
| **Thế Mạnh Cốt Lõi** | Điều phối tác vụ, Delayed Jobs, Rate Limiting token bucket chính xác cho API đối tác, quản lý vòng đời job đơn giản. | Streaming dữ liệu thông lượng cực cao (High Throughput) nhờ kiến trúc Sequential Disk I/O và Zero-Copy Network Transfer, không bị giới hạn bởi RAM in-memory. |
| **Lưu Trữ & Khả Năng Replay Message** | Job bị xóa sau khi hoàn tất hoặc lưu giữ ngắn hạn. Không thiết kế cho việc phát lại luồng dữ liệu lịch sử. | **Event Replay Bất Biến:** Lưu trữ log lâu dài trên đĩa cứng. Cho phép tua lại offset (`seek to earliest`) để phát lại toàn bộ sự kiện khi CRM đối tác gặp sự cố kéo dài hoặc khi migrate sang CRM mới (Salesforce, HubSpot) mà không cần nguồn phát TikTok gửi lại webhook. |
| **Mô Hình Tiêu Thụ (Consumers)** | Point-to-Point Queue: Mỗi job chỉ được xử lý bởi một worker duy nhất trong queue. | **Multiple Independent Consumer Groups:** Cùng một sự kiện TikTok Lead, nhiều hệ thống khác nhau (CRM Sync, Data Lake ETL, Fraud Detection, Marketing SMS) có thể tiêu thụ song song độc lập với tốc độ riêng biệt mà không ảnh hưởng lẫn nhau. |
| **Quản Lý Trạng Thái Dữ Liệu** | Quản lý theo vòng đời job (waiting, active, failed). | Hỗ trợ **Log Compaction** để duy trì bản ghi trạng thái mới nhất cho mỗi Lead ID theo mô hình Event Sourcing. |
| **Kiến Trúc Tối Ưu Đề Xuất** | Độc lập đảm nhiệm toàn bộ quy trình nhận lead và sync CRM. | **Hybrid Architecture:** Kafka làm Ingestion Event Bus lưu trữ sự kiện thô bất biến $\rightarrow$ Consumer đẩy vào BullMQ để điều phối nhịp độ gọi API sang Bitrix24 theo đúng quota 2 RPS. |

### 5. Khả Năng Tự Phục Hồi & Giám Sát Nâng Cao

- **Circuit Breaker Pattern (Opossum):** Tự động ngắt kết nối tạm thời khi Bitrix24 bị gián đoạn dịch vụ kéo dài, ngăn ngừa cạn kiệt tài nguyên do thử lại liên tục.
- **OpenTelemetry Distributed Tracing:** Gắn mã định danh duy nhất `trace_id` xuyên suốt từ lúc webhook chạm Ingestion endpoint, qua các hàng đợi BullMQ, đến khi tạo Deal thành công trên CRM, giúp truy vết chính xác nút thắt cổ chai.
- **Bull-Board Management UI:** Tích hợp giao diện quản trị Bull-Board có bảo mật để đội ngũ Vận hành có thể theo dõi trạng thái các hàng đợi và kích hoạt xử lý lại Dead Letter Queue chỉ với một thao tác nhấp chuột.

---

## ❓ Câu Hỏi Thường Gặp & Xử Lý Sự Cố (FAQ)

#### 1. Lỗi "Unauthorized: Invalid or missing API key"

**Nguyên nhân:** Các endpoint quản trị `/api/v1/*` được bảo vệ bằng `ApiKeyGuard`.  
**Cách xử lý:** Luôn truyền kèm header `x-api-key: aasc-secure-api-key-2026` trong các request quản trị hoặc cấu hình Authorize trên giao diện Swagger UI.

#### 2. Lỗi "Invalid TikTok webhook signature"

**Nguyên nhân:** Chữ ký HMAC-SHA256 trong header `TikTok-Signature` không khớp với payload và secret key trong `.env`.  
**Cách xử lý:** Sử dụng script CLI `npm run simulate:tiktok` để tự động tạo payload và ký HMAC hợp lệ, hoặc sử dụng header `tiktok-signature: skip-verification` trong môi trường dev nội bộ.

#### 3. Cách truy cập và quan sát Monitoring Dashboard

**Cách xử lý:**

- Mở trình duyệt truy cập: `http://localhost:3001` (User: `admin` / Pass: `admin`).
- Chọn mục **Dashboards** $\rightarrow$ **TikTok & Bitrix24 Sync Observability** để xem toàn bộ biểu đồ Queue Lag, Bitrix Rate Limit, Latency p95, và Lead Conversion Funnel.
- Xem chỉ số Prometheus tại `http://localhost:9090` hoặc trực tiếp tại `http://localhost:3000/metrics`.

#### 4. Cách chuyển sang kết nối cổng Bitrix24 thật

**Cách xử lý:** Mở file `.env` và cập nhật:

```env
USE_MOCK_BITRIX=false
BITRIX_WEBHOOK_URL=https://ten-cong-ty-cua-ban.bitrix24.vn/rest/1/ma-token-inbound/
```

#### 5. Cách chuyển sang kết nối TikTok Events API thật

**Cách xử lý:** Mở file `.env` và cập nhật:

```env
USE_MOCK_TIKTOK_EVENTS=false
TIKTOK_PIXEL_CODE=MA_PIXEL_TIKTOK_CUA_BAN
TIKTOK_EVENTS_ACCESS_TOKEN=MA_ACCESS_TOKEN_TIKTOK_ADS
```

---
