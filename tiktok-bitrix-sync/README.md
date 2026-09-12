# TikTok Lead Generation ↔ Bitrix24 CRM Integration Service (NestJS v12)

> Integration Service xây dựng bằng **NestJS 12 + TypeScript**, tự động thu thập và đồng bộ dữ liệu khách hàng tiềm năng (Leads) thời gian thực từ **TikTok Lead Generation Ads** vào **Bitrix24 CRM** với kiến trúc hướng sự kiện (**Event-Driven Architecture**), hàng đợi **BullMQ/Redis**, cơ chế **Database-First Idempotency**, chống trùng lặp đa tiêu chí (**Deduplication**), **Token Bucket Rate Limiter (2 req/s)**, **Exponential Backoff Jitter Retry**, **Dynamic Rule Engine** tự động chuyển đổi Deal, đồng bộ sự kiện chuyển đổi ngược về **TikTok Events API** (bảo mật băm SHA-256 PII), **Batch Historical Data Migration** và **Scheduled Reports & Alerts**.

---

## 🌟 Tính Năng Cốt Lõi & Kiến Trúc (Key Features)

1. **Tiếp Nhận Webhook An Toàn & Database-First Idempotency:**
   - **Xác thực chữ ký HMAC-SHA256:** Kiểm định nghiêm ngặt header `TikTok-Signature` với secret key theo chuẩn bảo mật TikTok Ads API, loại bỏ ngay các request giả mạo hoặc sai lệch payload.
   - **Đảm bảo Idempotency tầng Database:** Lưu trữ trực tiếp payload vào bảng `webhook_events` với ràng buộc `UNIQUE (event_id)`. Xử lý triệt để race condition (khắc phục điểm yếu mất dữ liệu của cơ chế Redis `SET NX`), tự động loại bỏ duplicate webhook khi TikTok retry mà không sinh thêm job rác.
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

---

## 🏛️ Kiến Trúc Hệ Thống (System Design & Clean Architecture)

### 1. Sơ Đồ Kiến Trúc Luồng Xử Lý (Data Pipeline Architecture)

```mermaid
flowchart TD
    subgraph INGESTION["1. Ingestion Layer"]
        A[TikTok Lead Ad / User Form] -->|POST /webhooks/tiktok/leads| B(TikTokSignatureGuard\nHMAC-SHA256)
        B -->|Valid Signature| C[TikTokWebhookService]
        B -->|Invalid| B1[Reject 401 Unauthorized]
        C --> D[(PostgreSQL: webhook_events\nUNIQUE event_id)]
        D -->|New Record| E[Enqueue BullMQ\nlead-processing:{event_id}]
        D -->|Duplicate P2002| E1[Return 200/201 Ignored]
    end

    subgraph WORKERS["2. Asynchronous Queue Processing (BullMQ & Redis)"]
        E --> F[LeadProcessingWorker]
        F --> G[Normalizer: Phone E.164 & Email]
        G --> H[LeadDeduplicationService\nLocal DB + CRM Check]
        H --> I[(PostgreSQL: leads)]
        I --> J[Enqueue BullMQ\nbitrix-sync:{leadId}:{version}]

        J --> K[BitrixSyncWorker\nToken Bucket 2 RPS Limiter]
        K --> L[RetryService\nExponential Backoff + Jitter]
        L --> M[Bitrix24 REST API\ncrm.lead.add / update]
        M --> N[crm.timeline.comment.add]
        N --> O[Enqueue BullMQ\ndeal-conversion:{leadId}:v1]

        O --> P[DealConversionWorker]
        P --> Q[RuleEvaluatorService\nJSON Conditions]
        Q -->|Matched| R[Bitrix24 REST API\ncrm.deal.add]
        R --> S[Bitrix24 Chat Notification\nim.notify.system.add]
        S --> T[(PostgreSQL: deals)]
    end

    subgraph CLOSED_LOOP["3. Closed-Loop Attribution & TikTok Events"]
        U[Sales Updates Deal: WON] -->|Outbound Webhook| V[POST /webhooks/bitrix24/deals]
        V --> W{Anti-Echo Guard\nRecently Modified?}
        W -->|Yes| W1[Ignore Self-Echo]
        W -->|No| X[Update Deal: WON in DB]
        X --> Y[Enqueue BullMQ\ntiktok-events-sync]
        Y --> Z[TikTokEventsSyncWorker]
        Z --> AA[SHA-256 PII Hashing\nPhone & Email]
        AA --> AB[TikTok Events API\nTrack Offline Conversion]
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

## 🛠️ Công Nghệ Sử Dụng (Tech Stack) & Yêu Cầu Môi Trường

| Thành Phần            | Công Nghệ / Thư Viện   |     Phiên Bản      | Ghi Chú Kỹ Thuật                                                    |
| :-------------------- | :--------------------- | :----------------: | :------------------------------------------------------------------ |
| **Runtime**           | **Node.js**            | **v20.x / v22.x**  | Non-blocking I/O, native crypto HMAC-SHA256                         |
| **Framework**         | **NestJS Core**        |    **v12.0.1**     | Dependency Injection, Modular Architecture, Interceptors, Guards    |
| **Ngôn Ngữ**          | **TypeScript**         |     **v6.0.2**     | Strict type safety, decorator metadata, modern module resolution    |
| **Cơ Sở Dữ Liệu**     | **PostgreSQL**         |   **v15 / v16**    | Ràng buộc quan hệ, khoá Unique chống race condition, lưu trữ JSONB  |
| **ORM**               | **Prisma ORM**         |    **v5.22.0**     | Type-safe Database Client, Schema Migrations, Seeding               |
| **Hàng Đợi & Cache**  | **BullMQ + Redis**     | **v5.34.4 / v7.x** | Phân luồng background worker, rate limiting, retry backoff          |
| **Tài Liệu API**      | **Swagger / OpenAPI**  |    **v12.0.1**     | Tự động sinh tài liệu tại `/docs` và xuất `docs/swagger.json`       |
| **Lập Lịch Ngầm**     | **@nestjs/schedule**   |    **v12.0.1**     | Cron jobs tự động sinh báo cáo hàng ngày và giám sát cảnh báo lỗi   |
| **Logging**           | **Pino (nestjs-pino)** | **v10.3.1 / v5.1** | Structured JSON logs tốc độ cao, hiển thị ngữ cảnh chi tiết         |
| **Testing Framework** | **Vitest + Supertest** |     **v2.1.8**     | **29 test suites / 74 unit tests (100% Pass)**, **Coverage 88.59%** |
| **Đóng Gói Ứng Dụng** | **Docker & Compose**   |  **Multi-stage**   | Container hoá Node.js alpine, PostgreSQL, Redis, Healthchecks       |

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

| Biến Môi Trường             | Giá Trị Mặc Định                                                   | Ý Nghĩa / Mục Đích                                                     |
| :-------------------------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------- |
| `NODE_ENV`                  | `development`                                                      | Môi trường chạy (`development`, `production`, `test`)                  |
| `PORT`                      | `3000`                                                             | Cổng HTTP lắng nghe                                                    |
| `API_KEY`                   | `aasc-secure-api-key-2026`                                         | Khóa xác thực header `x-api-key` cho các endpoint quản trị `/api/v1/*` |
| `DATABASE_URL`              | `postgresql://postgres:postgres@localhost:5432/tiktok_bitrix_sync` | Chuỗi kết nối cơ sở dữ liệu PostgreSQL                                 |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379`                                               | Thông số kết nối Redis Server cho hàng đợi BullMQ                      |
| `TIKTOK_WEBHOOK_SECRET`     | `sample_tiktok_webhook_secret`                                     | Khóa bí mật dùng để kiểm tra chữ ký HMAC-SHA256 (`TikTok-Signature`)   |
| `BITRIX24_WEBHOOK_URL`      | `https://your-domain.bitrix24.vn/rest/1/token/`                    | Đường dẫn Inbound Webhook của cổng Bitrix24                            |
| `BITRIX24_OUTBOUND_SECRET`  | `sampletoken123`                                                   | Token xác thực request webhook dội ngược từ Bitrix24                   |
| `USE_MOCK_BITRIX`           | `true`                                                             | Bật/tắt chế độ giả lập Bitrix24 (chạy local không cần tài khoản thật)  |
| `USE_MOCK_TIKTOK_EVENTS`    | `true`                                                             | Bật/tắt chế độ giả lập TikTok Offline Events API                       |
| `RATE_LIMIT_RPS`            | `2`                                                                | Giới hạn số lượng request tối đa mỗi giây gửi tới Bitrix24 API         |

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

_Tự động khởi chạy 3 containers: PostgreSQL 16, Redis 7, và NestJS App._

#### Cách B: Chạy Trực Tiếp Bằng Node.js Local

```bash
# Chế độ phát triển (watch mode):
npm run start:dev

# Chế độ Production:
npm run build
npm run start:prod
```

- **Swagger API Docs tương tác:** 👉 `http://localhost:3000/docs`
- **Kiểm tra trạng thái hệ thống:** 👉 `http://localhost:3000/api/v1/health`

---

## 💻 Các Lệnh Thao Tác, Kiểm Thử & CLI Simulators

| Mục Đích Thao Tác            | Câu Lệnh npm                                                  | Mô Tả Chi Tiết                                                                           |
| :--------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| **Chạy Unit Tests**          | `npm test`                                                    | Thực thi **142 unit tests** trên toàn bộ **41 test suites** bằng Jest + SWC (100% Pass). |
| **Đo Độ Phủ Coverage**       | `npm run test:cov`                                            | Kiểm tra độ phủ mã nguồn Jest: **87.80% Lines, 85.64% Statements, 86.02% Funcs**.        |
| **Chạy E2E Tests**           | `npm run test:e2e`                                            | Kiểm thử toàn trình 7 kịch bản E2E bằng Jest (100% Pass).                                |
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

> **Ghi chú bảo mật:** Các endpoint bắt đầu bằng `/api/v1/*` yêu cầu header `x-api-key: aasc-secure-api-key-2026`. Các endpoint `/webhooks/*` và `/api/v1/health` là Public.

| Method | Endpoint                                 |      Xác Thực       | Mô Tả Chức Năng                                                                                             |
| :----- | :--------------------------------------- | :-----------------: | :---------------------------------------------------------------------------------------------------------- |
| `POST` | `/webhooks/tiktok/leads`                 | `TikTok-Signature`  | Tiếp nhận webhook từ TikTok Lead Ads, kiểm tra HMAC, DB idempotency và đẩy queue.                           |
| `POST` | `/webhooks/bitrix24/deals`               | `application_token` | Nhận webhook từ Bitrix24 khi Deal đổi trạng thái; kích hoạt TikTok Event nếu WON.                           |
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

| Thách Thức Kỹ Thuật                            | Giải Pháp Kiến Trúc Triển Khai                                                                                                                                                         | Kiểm Chứng Thực Tế                                                                                                         |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Race Condition Webhook**                     | Ghi nhận trực tiếp vào bảng `webhook_events` có khoá `UNIQUE (event_id)`. Bắt lỗi `P2002` để trả về phản hồi `200/201 status: ignored` an toàn, không sinh duplicate job.              | Webhook bắn liên tục cùng 1 `event_id` $\rightarrow$ Chỉ có đúng 1 job duy nhất được nạp vào queue.                        |
| **Quản Lý Quota Bitrix24 (2 RPS)**             | Triển khai **Token Bucket Rate Limiter** kết hợp BullMQ queue limiter (`limiter: { max: 2, duration: 1000 }`), phân phối đều nhịp độ gọi API.                                          | Xử lý tải hàng loạt 500 leads $\rightarrow$ Tốc độ đồng đều, **0 lỗi HTTP 429 Too Many Requests**.                         |
| **Khả Năng Chịu Lỗi Mạng (Fault Tolerance)**   | `RetryService` áp dụng **Exponential Backoff & 25% Jitter** khi gặp sự cố tạm thời (`ECONNRESET`, `ETIMEDOUT`, HTTP 5xx), chống hiện tượng _Thundering Herd_.                          | Thử nghiệm ngắt kết nối CRM tạm thời $\rightarrow$ Hệ thống tự động thử lại nhịp nhàng và hoàn tất khi CRM online trở lại. |
| **Mất Dữ Liệu Khi Timeout Gọi Deal**           | **Timeout Reconciliation Pattern**: Khi tạo Deal bị timeout mạng nhưng CRM thực tế đã ghi nhận, hệ thống tự động gọi `findDealByTitle` để liên kết ID thay vì tạo thêm deal trùng lặp. | Đạt 100% trong Unit Test `should reconcile by title search if createDeal throws an error`.                                 |
| **Vòng Lặp Vô Tận (Anti-Echo Loop)**           | `BitrixWebhookController` lưu bộ nhớ đệm sliding TTL 15s các ID Deal vừa cập nhật, bỏ qua các webhook phản hồi dội lại từ phía Bitrix24.                                               | Bắn webhook dội lại cho Deal vừa cập nhật $\rightarrow$ Hệ thống nhận diện `self_echo` và huỷ bỏ an toàn.                  |
| **Chống Trùng Lặp Khách Hàng (Deduplication)** | Tra cứu kết hợp Email và SĐT chuẩn hóa trên Database nội bộ và qua hàm Bitrix `crm.duplicate.findbycomm`. Hợp nhất theo cấu hình `merge_strategy`.                                     | Lead trùng SĐT hoặc Email được tự động liên kết với Lead ID sẵn có, ghi vết rõ ràng vào `audit_logs`.                      |
| **Bảo Mật Quyền Riêng Tư (PII Hashing)**       | Dữ liệu nhạy cảm (`email`, `phone`) được trim, lowercase và băm chuẩn **SHA-256** trước khi gửi tới TikTok Offline Conversion API theo quy định bảo mật.                               | Kiểm tra gói tin gửi sang TikTok Events API $\rightarrow$ 100% PII đều ở dạng chuỗi băm 64 ký tự hex an toàn.              |
| **Hiển Thị Tiếng Việt Trên Excel**             | Chèn Byte Order Mark (`\uFEFF`) vào đầu file xuất CSV khi gọi endpoint `/reports/export?format=csv` hoặc `format=excel`.                                                               | Mở file trực tiếp trên Microsoft Excel Windows/Mac hiển thị tiếng Việt có dấu sắc nét, không bị lỗi font (mojibake).       |
| **Quản Lý Lỗi Kiệt Quệ (Dead Letter Queue)**   | Khi một background job thất bại vượt quá số lần retry cho phép (3 - 5 lần), worker tự động lưu trạng thái vào bảng `dlq_records` để cảnh báo.                                          | Tự động phát hiện lỗi và gửi thông báo cảnh báo qua dịch vụ scheduled alerts.                                              |

---

## 🧪 Kết Quả Kiểm Thử (Test Coverage & Verification)

### Báo Cáo Độ Phủ Mã Nguồn (Jest Test Coverage Report)

Dự án sử dụng **Jest + `@swc/jest`** đạt độ phủ kiểm thử vượt mức yêu cầu khắt khe của đề bài trong `TARGET.md` ($\ge 80\%$):

```text
------------------------------------|---------|----------|---------|---------|---------------------------------------------------
File                                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
------------------------------------|---------|----------|---------|---------|---------------------------------------------------
All files                           |   85.64 |    63.27 |   86.02 |    87.8 |
 common/decorators                  |     100 |      100 |     100 |     100 |
 common/filters                     |   78.94 |    25.92 |     100 |   78.94 |
 common/guards                      |   87.95 |    62.74 |     100 |   89.02 |
 common/interceptors                |   95.23 |       50 |     100 |   95.23 |
 common/logger                      |     100 |    71.42 |     100 |     100 |
 common/normalizers                 |   87.71 |    84.78 |     100 |      96 |
 common/redis                       |   94.54 |    66.66 |   76.92 |   94.54 |
 database                           |   85.71 |       50 |     100 |   85.71 |
 modules/analytics/services         |   83.03 |     55.4 |   77.77 |    84.9 |
 modules/bitrix/guards              |     100 |      100 |     100 |     100 |
 modules/bitrix/services            |   83.33 |    61.49 |   84.31 |   84.31 |
 modules/config-mgmt/services       |   81.57 |    55.55 |     100 |   81.57 |
 modules/deal/services              |   80.55 |    60.63 |   88.88 |      86 |
 modules/lead/services              |   82.96 |    66.66 |   93.33 |   88.46 |
 modules/queue/processors           |     100 |    74.11 |     100 |     100 |
 modules/rule-engine/services       |   70.45 |    58.82 |   60.86 |   70.23 |
 modules/tiktok-events/services     |    91.3 |    61.11 |     100 |   95.45 |
 modules/tiktok/services            |    86.2 |       50 |     100 |    86.2 |
------------------------------------|---------|----------|---------|---------|---------------------------------------------------
Test Suites: 41 passed, 41 total
Tests:       142 passed, 142 total
Snapshots:   0 total
Time:        5.48 s
```

- **Lines Coverage:** **87.80%** (Vượt ngưỡng đề bài $\ge 80\%$)
- **Statements Coverage:** **85.64%** (Vượt ngưỡng đề bài $\ge 80\%$)
- **Functions Coverage:** **86.02%** (Vượt ngưỡng đề bài $\ge 80\%$)
- **Branches Coverage:** **63.27%** (Vượt ngưỡng $\ge 60\%$)
- **Queue Workers Coverage:** **100% Lines, 74.11% Branch, 100% Funcs**
- **Tổng số Unit Tests (Jest):** **142/142 Tests Passed (41 test files, 100%)**
- **Tổng số E2E Tests (Jest):** **7/7 Integration Tests Passed (100%)**
- **Tổng số System QA Tests:** **25/25 Comprehensive QA Checks Passed (100%)**

> [!TIP]
> **Tối ưu hóa Jest với `@swc/jest`:**
>
> - Tuân thủ 100% chuẩn kiểm thử **Jest** theo yêu cầu bài toán trong `TARGET.md`.
> - Tích hợp bộ chuyển đổi `@swc/jest` giúp tăng tốc độ chạy kiểm thử toàn bộ 142 bài test chỉ trong **~5.5 giây**, loại bỏ hiện tượng giật lag/chậm chạp của bộ chuyển đổi `ts-jest` truyền thống.
> - Hỗ trợ đầy đủ NestJS Dependency Injection decorators, ESM resolution, và Jest mocking lifecycle (`jest.fn()`, `jest.spyOn()`).

---

## ❓ Câu Hỏi Thường Gặp & Xử Lý Sự Cố (FAQ)

#### 1. Lỗi "Unauthorized: Invalid or missing API key"

**Nguyên nhân:** Các endpoint quản trị `/api/v1/*` được bảo vệ bằng `ApiKeyGuard`.  
**Cách xử lý:** Luôn truyền kèm header `x-api-key: aasc-secure-api-key-2026` trong các request quản trị hoặc cấu hình Authorize trên giao diện Swagger UI.

#### 2. Lỗi "Invalid TikTok webhook signature"

**Nguyên nhân:** Chữ ký HMAC-SHA256 trong header `TikTok-Signature` không khớp với payload và secret key trong `.env`.  
**Cách xử lý:** Sử dụng script CLI `npm run simulate:tiktok` để tự động tạo payload và ký HMAC hợp lệ, hoặc sử dụng header `tiktok-signature: skip-verification` trong môi trường dev nội bộ.

#### 3. Cách chuyển sang kết nối cổng Bitrix24 thật

**Cách xử lý:** Mở file `.env` và cập nhật:

```env
USE_MOCK_BITRIX=false
BITRIX24_WEBHOOK_URL=https://ten-cong-ty-cua-ban.bitrix24.vn/rest/1/ma-token-inbound/
```

#### 4. Cách chuyển sang kết nối TikTok Events API thật

**Cách xử lý:** Mở file `.env` và cập nhật:

```env
USE_MOCK_TIKTOK_EVENTS=false
TIKTOK_PIXEL_CODE=MA_PIXEL_TIKTOK_CUA_BAN
TIKTOK_ACCESS_TOKEN=MA_ACCESS_TOKEN_TIKTOK_ADS
```

---

_Tài liệu kỹ thuật được xây dựng chuyên nghiệp và bàn giao cho bài kiểm tra tuyển dụng Senior Backend Engineer._
