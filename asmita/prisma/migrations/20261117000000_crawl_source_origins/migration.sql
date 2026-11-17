-- Crawler v2 WP1: sites from survivor reports. A source now records how it
-- entered the list (origin), how it is fetched (render) and how deep the
-- crawler may go from it (hops, discoveredFromId), plus crawl progress.
-- CrawlBlockedHost holds the admin-managed never-crawl list (WP2 wires its
-- API); the built-in half of that list is src/lib/crawl-never.ts. Additive
-- only; existing rows keep their meaning as ADMIN origins.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_SOURCE_REPORTED';
-- CreateEnum
CREATE TYPE "CrawlSourceOrigin" AS ENUM ('ADMIN', 'REPORTED', 'DISCOVERED');
-- CreateEnum
CREATE TYPE "CrawlRenderMode" AS ENUM ('HTTP', 'BROWSER', 'AUTO');
-- AlterTable
ALTER TABLE "CrawlSource" ADD COLUMN     "origin" "CrawlSourceOrigin" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "hops" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discoveredFromId" TEXT,
ADD COLUMN     "render" "CrawlRenderMode" NOT NULL DEFAULT 'HTTP',
ADD COLUMN     "lastCrawledAt" TIMESTAMP(3),
ADD COLUMN     "pagesCrawled" INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "CrawlBlockedHost" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrawlBlockedHost_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "CrawlBlockedHost_host_key" ON "CrawlBlockedHost"("host");
