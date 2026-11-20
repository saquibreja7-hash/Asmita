-- Partner programme part 2 (WP31): the survivor's agreement, given with one
-- tick on her case page, that Asmita may share her fingerprints with partner
-- platforms. Additive only: one new table and three enum values, nothing
-- existing changes.

-- AlterEnum
ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'PARTNER_SHARING_CONSENT';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PARTNER_SHARE_CONSENT_GIVEN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PARTNER_SHARE_CONSENT_WITHDRAWN';

-- CreateTable
CREATE TABLE "PartnerShareConsent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "hashSubmissionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateId" TEXT NOT NULL,
    "templateDigest" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "PartnerShareConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerShareConsent_caseId_idx" ON "PartnerShareConsent"("caseId");

-- One live agreement per case, like the crawl authorisation
-- (20261116000000_crawler_backend).
CREATE UNIQUE INDEX "PartnerShareConsent_one_live_per_case" ON "PartnerShareConsent"("caseId") WHERE "withdrawnAt" IS NULL;

-- AddForeignKey
ALTER TABLE "PartnerShareConsent" ADD CONSTRAINT "PartnerShareConsent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "PartnerShareConsent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PartnerShareConsent" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
