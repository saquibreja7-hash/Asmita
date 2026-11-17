-- Crawler v2 review fix: real per-day fetch counts per source. The
-- discovered-site pause ("page budget spent three days running") used
-- CrawlPage.lastFetchedAt, which every revisit overwrites, so earlier days
-- were undercounted and the pause almost never fired. The frontier report now
-- adds the pages it fetched to this counter for the UTC day. Counts only, no
-- address. Additive only: a new table, nothing existing changes.

-- CreateTable
CREATE TABLE "CrawlSourceDay" (
    "sourceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrawlSourceDay_pkey" PRIMARY KEY ("sourceId","day")
);

-- CreateIndex
CREATE INDEX "CrawlSourceDay_day_idx" ON "CrawlSourceDay"("day");

-- AddForeignKey
ALTER TABLE "CrawlSourceDay" ADD CONSTRAINT "CrawlSourceDay_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CrawlSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
