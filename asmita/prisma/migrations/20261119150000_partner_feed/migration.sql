-- Partner programme part 2 (WP32): the append-only fingerprint feed
-- (PartnerFeedEvent) and the outcomes partners report back (PartnerOutcome).
-- Additive only: two new tables and three enum values, nothing existing
-- changes.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PARTNER_OUTCOME_REPORTED';

-- CreateEnum
CREATE TYPE "PartnerFeedEventType" AS ENUM ('ADD', 'WITHDRAW');
CREATE TYPE "PartnerOutcomeType" AS ENUM ('REMOVED', 'BLOCKED_REUPLOAD', 'NOT_FOUND', 'NOT_OUR_CONTENT');

-- CreateTable
CREATE TABLE "PartnerFeedEvent" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "type" "PartnerFeedEventType" NOT NULL,
    "kind" TEXT NOT NULL,
    "caseId" TEXT,
    "caseRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerFeedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOutcome" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fingerprintId" TEXT,
    "urlEncrypted" TEXT,
    "urlHash" TEXT,
    "submittedUrlId" TEXT,
    "caseId" TEXT,
    "outcome" "PartnerOutcomeType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerFeedEvent_seq_key" ON "PartnerFeedEvent"("seq");
CREATE INDEX "PartnerFeedEvent_fingerprintId_idx" ON "PartnerFeedEvent"("fingerprintId");
CREATE INDEX "PartnerFeedEvent_createdAt_idx" ON "PartnerFeedEvent"("createdAt");
CREATE INDEX "PartnerOutcome_partnerId_idx" ON "PartnerOutcome"("partnerId");
CREATE INDEX "PartnerOutcome_caseId_idx" ON "PartnerOutcome"("caseId");
CREATE INDEX "PartnerOutcome_fingerprintId_idx" ON "PartnerOutcome"("fingerprintId");
CREATE INDEX "PartnerOutcome_urlHash_idx" ON "PartnerOutcome"("urlHash");

-- AddForeignKey
ALTER TABLE "PartnerOutcome" ADD CONSTRAINT "PartnerOutcome_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PlatformPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "PartnerFeedEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PartnerFeedEvent" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "PartnerOutcome" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PartnerOutcome" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
