-- Crawler v2 WP3: the app-backed frontier. The app stores one row per page
-- URL of a source (encrypted, deduplicated per source on a keyed digest),
-- hands out due rows to the crawler in batches (claimed for 30 minutes so two
-- crawler processes never fetch the same URL) and schedules the next visit
-- from the reported outcome. Additive only.

-- CreateEnum
CREATE TYPE "CrawlPageKind" AS ENUM ('PAGE', 'SITEMAP', 'FEED');
-- CreateEnum
CREATE TYPE "CrawlPageStatus" AS ENUM ('PENDING', 'FETCHED', 'NOT_MODIFIED', 'GONE', 'BLOCKED', 'ERROR', 'DEAD');
-- CreateTable
CREATE TABLE "CrawlPage" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "urlEncrypted" TEXT NOT NULL,
    "urlDigest" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "kind" "CrawlPageKind" NOT NULL DEFAULT 'PAGE',
    "etag" TEXT,
    "lastModified" TEXT,
    "status" "CrawlPageStatus" NOT NULL DEFAULT 'PENDING',
    "claimedUntil" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "CrawlPage_sourceId_urlDigest_key" ON "CrawlPage"("sourceId", "urlDigest");
-- CreateIndex
CREATE INDEX "CrawlPage_sourceId_nextDueAt_idx" ON "CrawlPage"("sourceId", "nextDueAt");
-- CreateIndex
CREATE INDEX "CrawlPage_sourceId_lastFetchedAt_idx" ON "CrawlPage"("sourceId", "lastFetchedAt");
-- AddForeignKey
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CrawlSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
