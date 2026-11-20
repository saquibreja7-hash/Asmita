-- Crawler v3 review fix (WP13): a permanent fetch failure (a DNS name that
-- does not exist, a definite TLS certificate failure) is no longer reported
-- `gone` on the first attempt — one bad resolver answer must not kill a
-- page. The crawler reports `error` with the `permanent` hint; the row
-- remembers its first permanent failure here and dies only on a permanent
-- failure at least 24 hours after the first one. A successful visit clears
-- the marker. Additive; existing rows read null (no permanent failure).
ALTER TABLE "CrawlPage" ADD COLUMN "lastPermanentFailAt" TIMESTAMP(3);
