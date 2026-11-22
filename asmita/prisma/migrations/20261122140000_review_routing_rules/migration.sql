-- Review console WP143 (docs/product/review-console-spec.md): routing rules
-- and the queues admin. Additive only: one new enum type, three new tables,
-- one new nullable column on ReviewQueue and one new audit event value,
-- nothing existing changes.

-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a migration transaction as long as
-- the new value is not used in the same transaction (20261119130000 and
-- 20261122120000 do the same).
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REVIEW_RULE_CHANGED';

-- CreateEnum
CREATE TYPE "ReviewRuleStatus" AS ENUM ('DRAFT', 'LIVE', 'DISABLED');

-- AlterTable
-- WP143 queues admin: archiving a custom queue. System queues and the
-- protected minor-hold queue can never be archived; an archived queue is
-- hidden from the console, receives no jobs and is refused as a rule
-- destination, while its rows stay readable for old decisions.
ALTER TABLE "ReviewQueue" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
-- A routing rule picks a queue and a priority for a subject that already
-- needs a human. It never decides, dispatches or changes a gate; the
-- destination must be a queue of the same kind (enforced in code on save and
-- re-checked at evaluation).
CREATE TABLE "ReviewRoutingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectKind" "ReviewSubjectKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "condition" JSONB NOT NULL,
    "destinationQueueId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "ReviewRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Append-only: every saved version of a rule, never updated or deleted.
CREATE TABLE "ReviewRoutingRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectKind" "ReviewSubjectKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "condition" JSONB NOT NULL,
    "destinationQueueId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "ReviewRuleStatus" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRoutingRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- One evaluation of one rule against one job ("why is this here"). Rows
-- carry ids, booleans and outcome codes only — never a subject value.
CREATE TABLE "ReviewRoutingLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleVersion" INTEGER,
    "matched" BOOLEAN NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRoutingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewRoutingRule_subjectKind_status_sequence_idx" ON "ReviewRoutingRule"("subjectKind", "status", "sequence");

CREATE UNIQUE INDEX "ReviewRoutingRuleVersion_ruleId_version_key" ON "ReviewRoutingRuleVersion"("ruleId", "version");
CREATE INDEX "ReviewRoutingRuleVersion_ruleId_savedAt_idx" ON "ReviewRoutingRuleVersion"("ruleId", "savedAt");

-- One row per (job, rule, version): a re-run that changes nothing writes
-- nothing, so the sync can evaluate every open job every run.
CREATE UNIQUE INDEX "ReviewRoutingLog_jobId_ruleId_ruleVersion_key" ON "ReviewRoutingLog"("jobId", "ruleId", "ruleVersion");
CREATE INDEX "ReviewRoutingLog_jobId_createdAt_idx" ON "ReviewRoutingLog"("jobId", "createdAt");
CREATE INDEX "ReviewRoutingLog_ruleId_idx" ON "ReviewRoutingLog"("ruleId");
CREATE INDEX "ReviewRoutingLog_createdAt_idx" ON "ReviewRoutingLog"("createdAt");

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "ReviewRoutingRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewRoutingRule" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewRoutingRuleVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewRoutingRuleVersion" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewRoutingLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewRoutingLog" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
