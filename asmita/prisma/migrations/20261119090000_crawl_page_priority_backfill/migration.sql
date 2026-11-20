-- Crawler v3 review fix (WP11): backfill the frontier's crawl order for
-- every row stored before the fix, so the queue the claim reads matches
-- what a fresh report would have stored — sitemap 10, feed 20, a
-- pagination-stored page 30 (the WP11 rule a live report sets), a depth-0
-- seed 50, every other page 50 plus 10 per depth level, capped at the
-- pre-WP11 default 100. New seeds are inserted at 50 by the app from now
-- on, and a successful visit resets a row to its kind/depth value, so a
-- lastmod jump (priority 5) is one-shot. Data only; the column and index
-- came with 20261119060000_crawl_page_priority.
UPDATE "CrawlPage" SET "priority" = CASE
  WHEN "kind" = 'SITEMAP' THEN 10
  WHEN "kind" = 'FEED' THEN 20
  WHEN "viaPagination" THEN 30
  WHEN "depth" = 0 THEN 50
  ELSE LEAST(50 + 10 * "depth", 100)
END;
