-- Organization partners (asmita/docs/org/spec.md, WP57): the 'Current
-- partners' list on /partners and the Supporters strip. Additive only: one
-- new table and new ORG_PARTNER_* audit event names.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_PARTNER_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_PARTNER_VISIBILITY_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_PARTNER_REORDERED';

-- CreateTable
CREATE TABLE "OrgPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logoPath" TEXT,
    "url" TEXT,
    "blurbEn" TEXT NOT NULL,
    "blurbHi" TEXT,
    "isPublic" BOOLEAN DEFAULT false NOT NULL,
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgPartner_isPublic_sortOrder_idx" ON "OrgPartner"("isPublic", "sortOrder");

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, only asmita_app gets rows.
ALTER TABLE "OrgPartner" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OrgPartner" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
