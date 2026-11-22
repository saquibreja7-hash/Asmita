-- Platform scorecard snapshots (asmita/docs/org/spec.md, WP58): one row per
-- calendar quarter, aggregate numbers only. Additive only: one new table and
-- new ORG_SCORECARD_* audit event names.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SCORECARD_COMPUTED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SCORECARD_NOTE_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SCORECARD_PUBLISHED';

-- CreateTable
CREATE TABLE "ScorecardSnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "data" JSONB NOT NULL,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "notesEn" TEXT,
    "notesHi" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScorecardSnapshot_period_key" ON "ScorecardSnapshot"("period");
CREATE INDEX "ScorecardSnapshot_status_publishedAt_idx" ON "ScorecardSnapshot"("status", "publishedAt");

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, only asmita_app gets rows.
ALTER TABLE "ScorecardSnapshot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ScorecardSnapshot" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
