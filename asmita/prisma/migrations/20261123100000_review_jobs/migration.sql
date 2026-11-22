-- Review console WP140 (docs/product/review-console-spec.md): review
-- queues, leased jobs and the decisions taken through the existing review
-- functions. Additive only: three new enum types and five new tables,
-- nothing existing changes.
--
-- The partial unique index at the bottom is raw SQL on purpose: Prisma
-- cannot express partial indexes, so the schema models it as a comment and
-- this migration is its single source. It keeps one open job per subject,
-- so a second enqueue of the same subject merges into the open job.

-- CreateEnum
CREATE TYPE "ReviewSubjectKind" AS ENUM ('FLAGGED_LINK', 'FINGERPRINT', 'FINDING', 'PARTNER_APPLICATION', 'LAB_REPORT');
CREATE TYPE "ReviewJobStatus" AS ENUM ('PENDING', 'CLOSED');
CREATE TYPE "ReviewEnqueueSource" AS ENUM ('SYNC', 'RULE', 'MOVED', 'MANUAL');

-- CreateTable
CREATE TABLE "ReviewQueue" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectKind" "ReviewSubjectKind",
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "requireReasonOnReject" BOOLEAN NOT NULL DEFAULT true,
    "requireReasonOnApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewJob" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "subjectKind" "ReviewSubjectKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "caseId" TEXT,
    "status" "ReviewJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedUntil" TIMESTAMP(3),
    "enqueueSource" "ReviewEnqueueSource" NOT NULL,
    "routedByRuleId" TEXT,
    "routedByRuleVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,

    CONSTRAINT "ReviewJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "subjectKind" "ReviewSubjectKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "caseId" TEXT,
    "reviewerEmailHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "claimedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "auditEventId" TEXT,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewJobClaim" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reviewerEmailHash" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "ReviewJobClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSkip" (
    "reviewerEmailHash" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSkip_pkey" PRIMARY KEY ("reviewerEmailHash", "jobId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQueue_key_key" ON "ReviewQueue"("key");
CREATE INDEX "ReviewQueue_sortOrder_idx" ON "ReviewQueue"("sortOrder");

CREATE INDEX "ReviewJob_queueId_status_priority_createdAt_idx" ON "ReviewJob"("queueId", "status", "priority" DESC, "createdAt");
CREATE INDEX "ReviewJob_caseId_idx" ON "ReviewJob"("caseId");
CREATE INDEX "ReviewJob_claimedBy_status_idx" ON "ReviewJob"("claimedBy", "status");
-- One open job per subject; a second enqueue merges into the open job.
CREATE UNIQUE INDEX "ReviewJob_open_subject_key" ON "ReviewJob"("subjectKind", "subjectId") WHERE status = 'PENDING';

CREATE UNIQUE INDEX "ReviewDecision_jobId_key" ON "ReviewDecision"("jobId");
CREATE INDEX "ReviewDecision_queueId_idx" ON "ReviewDecision"("queueId");
CREATE INDEX "ReviewDecision_subjectKind_subjectId_idx" ON "ReviewDecision"("subjectKind", "subjectId");
CREATE INDEX "ReviewDecision_decidedAt_idx" ON "ReviewDecision"("decidedAt");

CREATE INDEX "ReviewJobClaim_jobId_idx" ON "ReviewJobClaim"("jobId");
CREATE INDEX "ReviewJobClaim_reviewerEmailHash_idx" ON "ReviewJobClaim"("reviewerEmailHash");

CREATE INDEX "ReviewSkip_until_idx" ON "ReviewSkip"("until");

-- AddForeignKey
ALTER TABLE "ReviewJob" ADD CONSTRAINT "ReviewJob_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ReviewQueue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "ReviewQueue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewQueue" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewJob" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewDecision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewDecision" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewJobClaim" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewJobClaim" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "ReviewSkip" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewSkip" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
