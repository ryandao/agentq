-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "metadata" JSONB,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_data" JSONB,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "run_id" TEXT NOT NULL,
    "session_id" TEXT,
    "task_name" TEXT,
    "queue_name" TEXT,
    "worker_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "input_preview" JSONB,
    "output_preview" JSONB,
    "latest_span_name" TEXT,
    "latest_span_type" TEXT,
    "latest_event" TEXT,
    "root_span_id" TEXT,
    "total_spans" INTEGER NOT NULL DEFAULT 0,
    "active_span_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "summary" JSONB,
    "metadata" JSONB,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "spans" (
    "span_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "parent_span_id" TEXT,
    "agent_name" TEXT,
    "name" TEXT NOT NULL,
    "run_type" TEXT NOT NULL,
    "status" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "input_preview" JSONB,
    "output_preview" JSONB,
    "error" TEXT,
    "metadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spans_pkey" PRIMARY KEY ("span_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "span_id" TEXT,
    "run_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT,
    "level" TEXT,
    "data" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_name_key" ON "agents"("name");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "runs_session_id_idx" ON "runs"("session_id");

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "runs_created_at_idx" ON "runs"("created_at");

-- CreateIndex
CREATE INDEX "spans_run_id_idx" ON "spans"("run_id");

-- CreateIndex
CREATE INDEX "spans_agent_name_idx" ON "spans"("agent_name");

-- CreateIndex
CREATE INDEX "events_span_id_idx" ON "events"("span_id");

-- CreateIndex
CREATE INDEX "events_run_id_idx" ON "events"("run_id");

-- CreateIndex
CREATE INDEX "events_type_idx" ON "events"("type");

