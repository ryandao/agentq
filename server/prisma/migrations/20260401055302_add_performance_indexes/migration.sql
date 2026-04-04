-- AlterTable
ALTER TABLE "runs" ALTER COLUMN "enqueued_at" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "runs_started_at_idx" ON "runs"("started_at");

-- CreateIndex
CREATE INDEX "runs_task_name_idx" ON "runs"("task_name");

-- CreateIndex
CREATE INDEX "runs_is_deleted_started_at_idx" ON "runs"("is_deleted", "started_at");

-- CreateIndex
CREATE INDEX "spans_parent_span_id_idx" ON "spans"("parent_span_id");

-- CreateIndex
CREATE INDEX "spans_run_id_run_type_idx" ON "spans"("run_id", "run_type");

-- CreateIndex
CREATE INDEX "runs_is_deleted_created_at_idx" ON "runs"("is_deleted", "created_at");
