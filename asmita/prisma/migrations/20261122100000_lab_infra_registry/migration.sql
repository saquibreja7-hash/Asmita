-- WP114 (research-tools-spec.md): the infrastructure registry — provider
-- directory, infrastructure scans, normalised findings and service links.
-- Additive only, tables prefixed Lab, row-level security on like every
-- other table (see 20261031000000_least_privilege_and_rls and
-- 20261120000000_lab_e2_tables): only asmita_app gets rows, nothing
-- reaches the Supabase Data API. Real service names and URLs live only in
-- these tables, never in code, fixtures or docs.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_INFRA_SCAN_RUN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_PROVIDER_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_PROVIDER_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'LAB_FINDING_PROMOTED';

-- CreateEnum
CREATE TYPE "LabInfraFindingCategory" AS ENUM ('HOSTING_ASN', 'CDN', 'REGISTRAR', 'NAMESERVER', 'MAIL', 'TLS_ISSUER', 'PAYMENT', 'CRYPTO_ADDRESS', 'AUTH_SSO', 'ANALYTICS_ID', 'ADS', 'APP_STORE_LINK', 'TELEGRAM_LINK', 'SOCIAL_LINK', 'REFERRAL_LINK', 'MODEL_REPO_LINK');
-- CreateEnum
CREATE TYPE "LabInfraConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
-- CreateEnum
CREATE TYPE "LabServiceLinkReason" AS ENUM ('SHARED_ANALYTICS_ID', 'SHARED_IP', 'SHARED_NAMESERVER_SET', 'SHARED_CRYPTO_ADDRESS', 'SHARED_TLS_SAN', 'ANALYST');

-- CreateTable
CREATE TABLE "LabProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LabChokepointKind" NOT NULL,
    "website" TEXT NOT NULL,
    "abusePageUrl" TEXT,
    "abuseEmail" TEXT,
    "policyUrl" TEXT,
    "notes" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabInfraScan" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "httpStatus" INTEGER,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureVersion" TEXT NOT NULL,
    "error" TEXT,
    CONSTRAINT "LabInfraScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabInfraFinding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "category" "LabInfraFindingCategory" NOT NULL,
    "providerId" TEXT,
    "value" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" "LabInfraConfidence" NOT NULL DEFAULT 'MEDIUM',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LabInfraFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabServiceLink" (
    "id" TEXT NOT NULL,
    "serviceAId" TEXT NOT NULL,
    "serviceBId" TEXT NOT NULL,
    "reason" "LabServiceLinkReason" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabServiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabProvider_name_kind_key" ON "LabProvider"("name", "kind");
CREATE INDEX "LabProvider_kind_idx" ON "LabProvider"("kind");
CREATE INDEX "LabInfraScan_serviceId_idx" ON "LabInfraScan"("serviceId");
CREATE INDEX "LabInfraScan_scannedAt_idx" ON "LabInfraScan"("scannedAt");
CREATE UNIQUE INDEX "LabInfraFinding_serviceId_category_value_key" ON "LabInfraFinding"("serviceId", "category", "value");
CREATE INDEX "LabInfraFinding_serviceId_category_idx" ON "LabInfraFinding"("serviceId", "category");
CREATE INDEX "LabInfraFinding_value_idx" ON "LabInfraFinding"("value");
CREATE INDEX "LabInfraFinding_active_idx" ON "LabInfraFinding"("active");
CREATE UNIQUE INDEX "LabServiceLink_serviceAId_serviceBId_reason_value_key" ON "LabServiceLink"("serviceAId", "serviceBId", "reason", "value");
CREATE INDEX "LabServiceLink_serviceAId_idx" ON "LabServiceLink"("serviceAId");
CREATE INDEX "LabServiceLink_serviceBId_idx" ON "LabServiceLink"("serviceBId");

-- AddForeignKey
ALTER TABLE "LabInfraScan" ADD CONSTRAINT "LabInfraScan_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "LabService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabInfraFinding" ADD CONSTRAINT "LabInfraFinding_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "LabService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security, deny by default, only asmita_app gets rows.
ALTER TABLE "LabProvider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabProvider" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "LabInfraScan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabInfraScan" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "LabInfraFinding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabInfraFinding" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "LabServiceLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LabServiceLink" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
