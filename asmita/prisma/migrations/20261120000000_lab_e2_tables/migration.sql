-- AI Lab, E2 (docs/lab/charter.md): the nudify-service map and chokepoint
-- reporting tables. Additive only. Lab data is research data: real service
-- names and URLs live only in these tables, never in code, fixtures or docs.

-- CreateEnum
CREATE TYPE "LabServiceKind" AS ENUM ('APP', 'WEBSITE', 'CHAT_BOT', 'CHANNEL', 'SOCIAL_ACCOUNT');
-- CreateEnum
CREATE TYPE "LabServiceStatus" AS ENUM ('ACTIVE', 'DOWN', 'UNKNOWN');
-- CreateEnum
CREATE TYPE "LabChokepointKind" AS ENUM ('HOST', 'CDN', 'REGISTRAR', 'PAYMENT_PROCESSOR', 'APP_STORE', 'AD_NETWORK', 'PLATFORM_ACCOUNT');
-- CreateEnum
CREATE TYPE "LabReportChannel" AS ENUM ('EMAIL', 'WEB_FORM');
-- CreateEnum
CREATE TYPE "LabReportStatus" AS ENUM ('DRAFT', 'SENT');
-- CreateEnum
CREATE TYPE "LabReportOutcome" AS ENUM ('ACTIONED', 'REFUSED', 'NO_REPLY');
-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_SERVICE_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_SERVICE_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_CHOKEPOINT_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_CHOKEPOINT_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_REPORT_DRAFTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_REPORT_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_REPORT_SENT';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_REPORT_OUTCOME_RECORDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_LIVENESS_RUN';
-- CreateTable
CREATE TABLE "LabService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LabServiceKind" NOT NULL,
    "urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LabServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "urlStatuses" JSONB,
    "downSince" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabService_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LabChokepoint" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "kind" "LabChokepointKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "abuseContact" TEXT NOT NULL,
    "evidenceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabChokepoint_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "chokepointId" TEXT NOT NULL,
    "templateKind" "LabChokepointKind" NOT NULL,
    "channel" "LabReportChannel",
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "LabReportStatus" NOT NULL DEFAULT 'DRAFT',
    "toAddress" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "providerReference" TEXT,
    "outcome" "LabReportOutcome",
    "outcomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LabService_status_idx" ON "LabService"("status");
-- CreateIndex
CREATE INDEX "LabChokepoint_serviceId_idx" ON "LabChokepoint"("serviceId");
-- CreateIndex
CREATE INDEX "LabReport_chokepointId_idx" ON "LabReport"("chokepointId");
-- CreateIndex
CREATE INDEX "LabReport_status_idx" ON "LabReport"("status");
-- AddForeignKey
ALTER TABLE "LabChokepoint" ADD CONSTRAINT "LabChokepoint_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "LabService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_chokepointId_fkey" FOREIGN KEY ("chokepointId") REFERENCES "LabChokepoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lab tables follow the same rule as every other table (see
-- 20261031000000_least_privilege_and_rls): row-level security on, deny by
-- default, only asmita_app gets rows. Nothing reaches the Supabase Data API.
ALTER TABLE "LabService" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabService" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "LabChokepoint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabChokepoint" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "LabReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabReport" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
