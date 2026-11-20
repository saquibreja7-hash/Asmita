-- "Watch for my images" (watch-and-verify WP22, additive only). A watch is a
-- case with fingerprints and no links: Case.mode says which. A watch-only
-- crawl authorisation (CrawlConsent.scope) compares her fingerprints with
-- images on public websites and alerts her; nothing is sent to any platform
-- until she converts the watch into a case and signs the full authorisation,
-- which records the watch authorisation it replaced (convertedFromId) so
-- findings recorded under it stay covered.

-- AlterEnum
ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'WATCH_AUTHORISATION';
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'WATCH_CONVERTED';
-- CreateEnum
CREATE TYPE "CaseMode" AS ENUM ('CASE', 'WATCH');
-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "mode" "CaseMode" NOT NULL DEFAULT 'CASE';
-- CreateEnum
CREATE TYPE "CrawlConsentScope" AS ENUM ('SEARCH_AND_NOTICE', 'WATCH_ONLY');
-- AlterTable
ALTER TABLE "CrawlConsent" ADD COLUMN     "scope" "CrawlConsentScope" NOT NULL DEFAULT 'SEARCH_AND_NOTICE',
ADD COLUMN     "convertedFromId" TEXT;
