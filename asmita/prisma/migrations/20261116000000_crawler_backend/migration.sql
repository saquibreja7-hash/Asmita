-- Targeted hash-matching crawler, app side (additive only). A separate
-- service fetches public images, computes PDQ and reports matches against
-- the fingerprints of survivors who signed a crawl authorisation. This app
-- never fetches a URL; it stores consents, sources, service keys and
-- encrypted findings.

-- CreateEnum
CREATE TYPE "UrlSource" AS ENUM ('SURVIVOR', 'CRAWLER');
-- CreateEnum
CREATE TYPE "CrawlFindingStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'DISMISSED');
-- CreateEnum
CREATE TYPE "CrawlSourceKind" AS ENUM ('SITE');
-- AlterEnum
ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'CRAWL_AUTHORISATION';
ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'CRAWL_REPRESENTATIVE_NOTICE';
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_CONSENT_SIGNED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_CONSENT_WITHDRAWN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_RECORDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_DISMISSED';
-- AlterTable
ALTER TABLE "HashSubmission" ADD COLUMN     "crawlPoolId" TEXT;
-- AlterTable
ALTER TABLE "SubmittedUrl" ADD COLUMN     "crawlFindingId" TEXT,
ADD COLUMN     "source" "UrlSource" NOT NULL DEFAULT 'SURVIVOR';
-- CreateTable
CREATE TABLE "CrawlConsent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "signedPdfEncrypted" TEXT NOT NULL,
    "hashSubmissionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateId" TEXT NOT NULL,
    "templateDigest" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    CONSTRAINT "CrawlConsent_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CrawlFinding" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "hashSubmissionId" TEXT NOT NULL,
    "pageUrlEncrypted" TEXT NOT NULL,
    "imageUrlEncrypted" TEXT NOT NULL,
    "urlDigest" TEXT,
    "distance" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reviewStatus" "CrawlFindingStatus" NOT NULL DEFAULT 'CANDIDATE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "secondReviewedById" TEXT,
    "secondReviewedAt" TIMESTAMP(3),
    CONSTRAINT "CrawlFinding_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CrawlSource" (
    "id" TEXT NOT NULL,
    "kind" "CrawlSourceKind" NOT NULL DEFAULT 'SITE',
    "domain" TEXT NOT NULL,
    "pageBudget" INTEGER NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrawlSource_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CrawlServiceKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "CrawlServiceKey_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "CrawlConsent_caseId_idx" ON "CrawlConsent"("caseId");
-- CreateIndex
CREATE INDEX "CrawlFinding_reviewStatus_idx" ON "CrawlFinding"("reviewStatus");
-- CreateIndex
CREATE INDEX "CrawlFinding_firstSeenAt_idx" ON "CrawlFinding"("firstSeenAt");
-- CreateIndex
CREATE UNIQUE INDEX "CrawlFinding_caseId_urlDigest_key" ON "CrawlFinding"("caseId", "urlDigest");
-- CreateIndex
CREATE UNIQUE INDEX "CrawlSource_domain_key" ON "CrawlSource"("domain");
-- CreateIndex
CREATE UNIQUE INDEX "CrawlServiceKey_keyHash_key" ON "CrawlServiceKey"("keyHash");
-- CreateIndex
CREATE UNIQUE INDEX "HashSubmission_crawlPoolId_key" ON "HashSubmission"("crawlPoolId");
-- CreateIndex
CREATE UNIQUE INDEX "SubmittedUrl_crawlFindingId_key" ON "SubmittedUrl"("crawlFindingId");
-- AddForeignKey
ALTER TABLE "SubmittedUrl" ADD CONSTRAINT "SubmittedUrl_crawlFindingId_fkey" FOREIGN KEY ("crawlFindingId") REFERENCES "CrawlFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrawlConsent" ADD CONSTRAINT "CrawlConsent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrawlFinding" ADD CONSTRAINT "CrawlFinding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrawlFinding" ADD CONSTRAINT "CrawlFinding_hashSubmissionId_fkey" FOREIGN KEY ("hashSubmissionId") REFERENCES "HashSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CrawlFinding" ADD CONSTRAINT "CrawlFinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CrawlSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one live (signed, not withdrawn) authorisation per case. Not
-- expressible in the Prisma schema; src/lib/crawl-consent.ts also checks.
CREATE UNIQUE INDEX "CrawlConsent_one_live_per_case" ON "CrawlConsent"("caseId") WHERE "withdrawnAt" IS NULL;

-- Same rules as every table (migration 20261031000000): deny by default,
-- only asmita_app gets rows. Default privileges already grant asmita_app.
ALTER TABLE "CrawlConsent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlConsent" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CrawlFinding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlFinding" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CrawlSource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlSource" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CrawlServiceKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlServiceKey" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
