-- Crawler v3 review fix (WP10 canonical aliases): remember that a frontier
-- row was stored from a pagination link. Such a page usually names page 1
-- (or the listing) as its canonical, so the aliases it reports are ignored
-- instead of retiring the page they name. Additive; existing rows default
-- to false.
ALTER TABLE "CrawlPage" ADD COLUMN "viaPagination" BOOLEAN NOT NULL DEFAULT false;
