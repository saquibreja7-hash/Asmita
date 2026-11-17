-- Crawler v2 review fix: REPORTED crawl sources are no longer created inline
-- in the survivor's request (the CRAWL_SOURCE_REPORTED audit entry sat right
-- after her CASE_CREATED / URL_SUBMITTED entries and linked her to the host).
-- The hourly retention cron now batches submitted links whose host has not
-- been checked yet and sets this marker.
--
-- Additive and cheap on a live table: the column is added with DEFAULT true
-- (a metadata-only change in Postgres 11+, no table rewrite), so every
-- existing row reads as already checked — the old inline path handled them.
-- The default then becomes false for new rows.

-- AlterTable
ALTER TABLE "SubmittedUrl" ADD COLUMN "crawlSourceChecked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SubmittedUrl" ALTER COLUMN "crawlSourceChecked" SET DEFAULT false;
-- CreateIndex
CREATE INDEX "SubmittedUrl_crawlSourceChecked_idx" ON "SubmittedUrl"("crawlSourceChecked");
