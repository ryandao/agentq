-- CreateIndex
CREATE INDEX "runs_is_deleted_started_at_idx" ON "runs"("is_deleted", "started_at");

-- CreateIndex
CREATE INDEX "spans_run_type_idx" ON "spans"("run_type");
