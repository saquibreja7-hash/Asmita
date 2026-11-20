-- Crawler v3 WP11: the frontier's crawl order. Lower priority runs first;
-- the claim orders by priority, then nextDueAt. Existing rows keep the
-- default 100; a reported link sets the row's priority when it is stored
-- (sitemap 10, feed 20, pagination 30, other pages 50 plus 10 per depth
-- level, capped at 100), and a sitemap entry whose lastmod is newer than
-- the row's last fetch sets 5 and makes the row due immediately.
ALTER TABLE "CrawlPage" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

-- Serves the claim's ORDER BY "priority" ASC, "nextDueAt" ASC per source.
CREATE INDEX "CrawlPage_sourceId_priority_nextDueAt_idx" ON "CrawlPage"("sourceId", "priority", "nextDueAt");
