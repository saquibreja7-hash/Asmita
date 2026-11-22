-- Review console WP142 (docs/product/review-console-spec.md): the internal
-- review reasons and the internal case notes. Additive only: two new tables
-- and two new audit event values, nothing existing changes.

-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a migration transaction as long as
-- the new value is not used in the same transaction (20261119130000 does
-- the same).
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CASE_NOTE_ADDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CASE_NOTE_DELETED';

-- CreateTable
-- One pickable reason per (queue, decision, code). Never deleted: a
-- deactivated reason keeps its label for the decisions that used it.
CREATE TABLE "ReviewReason" (
    "id" TEXT NOT NULL,
    "queueKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- An internal case note, encrypted at rest (bodyEncrypted is encryptField
-- output). No foreign key, like ReviewJob.caseId: a hard-deleted case must
-- never be blocked by its notes.
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "jobId" TEXT,
    "authorEmailHash" TEXT NOT NULL,
    "bodyEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReason_queueKey_decision_code_key" ON "ReviewReason"("queueKey", "decision", "code");
CREATE INDEX "ReviewReason_queueKey_decision_active_sortOrder_idx" ON "ReviewReason"("queueKey", "decision", "active", "sortOrder");

CREATE INDEX "CaseNote_caseId_createdAt_idx" ON "CaseNote"("caseId", "createdAt");
CREATE INDEX "CaseNote_authorEmailHash_idx" ON "CaseNote"("authorEmailHash");

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "ReviewReason" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewReason" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CaseNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CaseNote" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
