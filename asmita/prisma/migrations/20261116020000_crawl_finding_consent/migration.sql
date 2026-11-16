-- Crawler findings remember the authorisation they were matched under
-- (additive only). The dedup digest now includes it, so a copy re-reported
-- after a withdrawal and a new authorisation becomes a new finding; the old
-- finding and its stopped link stay untouched as the record.

-- AlterTable
ALTER TABLE "CrawlFinding" ADD COLUMN     "crawlConsentId" TEXT;
