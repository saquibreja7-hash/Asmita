-- Crawler v2 WP5: automatic discovery of new sites. A DISCOVERED source the
-- crawler reported from an in-scope page records why it is off (disabledReason,
-- set at birth: beyond the hop limit or the daily new-site cap) and can be
-- paused for 30 days by the hourly sweep when its page budget was spent three
-- days running with no match (pausedUntil, pauseReason). Four audit events
-- cover the automatic lifecycle. Additive only; existing rows read as
-- "never paused, no stored reason".

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_SOURCE_DISCOVERED';
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_SOURCE_PROMOTED';
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_SOURCE_PAUSED';
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_SOURCE_RESUMED';
-- AlterTable
ALTER TABLE "CrawlSource" ADD COLUMN     "pausedUntil" TIMESTAMP(3),
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "disabledReason" TEXT;
-- CreateIndex
CREATE INDEX "CrawlFinding_sourceId_idx" ON "CrawlFinding"("sourceId");
