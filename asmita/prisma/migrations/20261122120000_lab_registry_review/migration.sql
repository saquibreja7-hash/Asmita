-- WP115 (research-tools-spec.md): the registry admin UI's data needs —
-- review state for cluster candidates, promote state on findings, and bulk
-- reports (one report listing several services that depend on one provider).
-- Additive only; no new table, so the WP114 row-level security policies keep
-- covering everything. Making LabReport.chokepointId nullable loses no data:
-- every existing report keeps its chokepoint, and only a bulk report has none.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_SERVICE_LINK_REVIEWED';

-- CreateEnum
CREATE TYPE "LabServiceLinkStatus" AS ENUM ('CANDIDATE', 'CONFIRMED', 'DISMISSED');

-- AlterTable
ALTER TABLE "LabServiceLink" ADD COLUMN "status" "LabServiceLinkStatus" NOT NULL DEFAULT 'CANDIDATE';
ALTER TABLE "LabServiceLink" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "LabServiceLink" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LabInfraFinding" ADD COLUMN "promotedAt" TIMESTAMP(3);
ALTER TABLE "LabInfraFinding" ADD COLUMN "promotedChokepointId" TEXT;

-- AlterTable
ALTER TABLE "LabReport" ALTER COLUMN "chokepointId" DROP NOT NULL;
ALTER TABLE "LabReport" ADD COLUMN "bulkProviderName" TEXT;
ALTER TABLE "LabReport" ADD COLUMN "bulkAbuseContact" TEXT;
ALTER TABLE "LabReport" ADD COLUMN "bulkServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "LabServiceLink_status_idx" ON "LabServiceLink"("status");
