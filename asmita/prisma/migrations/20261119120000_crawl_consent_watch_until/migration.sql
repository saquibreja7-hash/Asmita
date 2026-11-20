-- Watch-and-verify WP24: watch for re-uploads after the case closes. When a
-- case is resolved (or every link on it is verified removed), the live crawl
-- authorisation gains a 12-month window during which her fingerprints stay in
-- the crawler pool even though the case is no longer open. Additive only: one
-- nullable column on CrawlConsent and one new audit event; nothing existing
-- changes, and existing rows read as "no watch started".

ALTER TABLE "CrawlConsent" ADD COLUMN     "watchUntil" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'CRAWL_WATCH_STARTED';
