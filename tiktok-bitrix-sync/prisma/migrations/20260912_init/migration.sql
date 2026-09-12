-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'tiktok',
    "payload" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'tiktok',
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "campaign_id" VARCHAR(255),
    "campaign_name" VARCHAR(255),
    "ad_id" VARCHAR(255),
    "ad_name" VARCHAR(255),
    "form_id" VARCHAR(255),
    "form_name" VARCHAR(255),
    "city" VARCHAR(255),
    "interests" JSONB,
    "custom_questions" JSONB,
    "ttclid" VARCHAR(255),
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "utm_content" VARCHAR(100),
    "utm_term" VARCHAR(100),
    "raw_data" JSONB NOT NULL,
    "bitrix24_id" INTEGER,
    "status" VARCHAR(50) NOT NULL DEFAULT 'new',
    "quality_score" INTEGER NOT NULL DEFAULT 0,
    "sync_version" INTEGER NOT NULL DEFAULT 1,
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "rule_id" VARCHAR(100) NOT NULL DEFAULT 'default',
    "bitrix24_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "pipeline_id" VARCHAR(50) NOT NULL DEFAULT '0',
    "stage" VARCHAR(50) NOT NULL DEFAULT 'NEW',
    "amount" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "assigned_to" VARCHAR(100),
    "conversion_metadata" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "lead_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(255),
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_metrics" (
    "id" UUID NOT NULL,
    "campaign_id" VARCHAR(255) NOT NULL,
    "campaign_name" VARCHAR(255) NOT NULL,
    "total_leads" INTEGER NOT NULL DEFAULT 0,
    "synced_leads" INTEGER NOT NULL DEFAULT 0,
    "converted_deals" INTEGER NOT NULL DEFAULT 0,
    "won_deals" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL,
    "job_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "processed_items" INTEGER NOT NULL DEFAULT 0,
    "failed_items" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "error_details" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dlq_records" (
    "id" UUID NOT NULL,
    "queue_name" VARCHAR(100) NOT NULL,
    "job_id" VARCHAR(255) NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dlq_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");

-- CreateIndex
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "leads_external_id_key" ON "leads"("external_id");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_campaign_id_idx" ON "leads"("campaign_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_quality_score_idx" ON "leads"("quality_score");

-- CreateIndex
CREATE INDEX "leads_bitrix24_id_idx" ON "leads"("bitrix24_id");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "deals_bitrix24_id_idx" ON "deals"("bitrix24_id");

-- CreateIndex
CREATE INDEX "deals_stage_idx" ON "deals"("stage");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- CreateIndex
CREATE INDEX "deals_created_at_idx" ON "deals"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deals_lead_id_rule_id_key" ON "deals"("lead_id", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_key" ON "configurations"("key");

-- CreateIndex
CREATE INDEX "audit_logs_lead_id_idx" ON "audit_logs"("lead_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs"("entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_metrics_campaign_id_key" ON "campaign_metrics"("campaign_id");

-- CreateIndex
CREATE INDEX "dlq_records_queue_name_idx" ON "dlq_records"("queue_name");

-- CreateIndex
CREATE INDEX "dlq_records_resolved_idx" ON "dlq_records"("resolved");

-- CreateIndex
CREATE INDEX "dlq_records_created_at_idx" ON "dlq_records"("created_at");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
