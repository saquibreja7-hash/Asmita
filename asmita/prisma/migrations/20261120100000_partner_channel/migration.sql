-- Partner programme part 2 (WP33): the partner takedown channel. One new
-- table (PartnerChannelSend, one row per email sent through a partner's
-- channel — a dispatched-notice copy or a crawler-finding alert, deduped
-- by the same sha256 key the send carries to Resend), a new origin for
-- crawl sources created from a partner's recorded written permission, and
-- the audit event types for channel sends and failures. Additive only:
-- nothing existing changes.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PARTNER_CHANNEL_SENT';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PARTNER_CHANNEL_FAILED';
ALTER TYPE "CrawlSourceOrigin" ADD VALUE IF NOT EXISTS 'PARTNER';

-- CreateEnum
CREATE TYPE "PartnerChannelSendKind" AS ENUM ('NOTICE', 'FINDING_ALERT');

-- CreateTable
CREATE TABLE "PartnerChannelSend" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerChannelSendKind" NOT NULL,
    "urlId" TEXT,
    "findingId" TEXT,
    "caseId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerChannelSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerChannelSend_dedupKey_key" ON "PartnerChannelSend"("dedupKey");
CREATE INDEX "PartnerChannelSend_partnerId_idx" ON "PartnerChannelSend"("partnerId");

-- AddForeignKey
ALTER TABLE "PartnerChannelSend" ADD CONSTRAINT "PartnerChannelSend_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PlatformPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "PartnerChannelSend" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PartnerChannelSend" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
