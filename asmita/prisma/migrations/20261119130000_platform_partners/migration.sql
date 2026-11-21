-- Partner programme part 2 (WP30): a platform that joined through
-- /for-platforms and was approved by an admin, and its bearer keys. Business
-- data only; the takedown-channel email is stored encrypted by the app.
-- Additive only: two new tables, nothing existing changes.

-- CreateEnum
CREATE TYPE "PlatformPartnerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "PlatformPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryDomain" TEXT NOT NULL,
    "extraDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PlatformPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "channelEmailEncrypted" TEXT,
    "createdFromApplicationId" TEXT,
    "crawlPermissionRecordedAt" TIMESTAMP(3),
    "crawlPermissionRecordedById" TEXT,
    "crawlPermissionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPartnerKey" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformPartnerKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPartner_primaryDomain_key" ON "PlatformPartner"("primaryDomain");
CREATE UNIQUE INDEX "PlatformPartner_createdFromApplicationId_key" ON "PlatformPartner"("createdFromApplicationId");
CREATE INDEX "PlatformPartner_status_idx" ON "PlatformPartner"("status");
CREATE INDEX "PlatformPartner_createdAt_idx" ON "PlatformPartner"("createdAt");
CREATE UNIQUE INDEX "PlatformPartnerKey_keyHash_key" ON "PlatformPartnerKey"("keyHash");
CREATE INDEX "PlatformPartnerKey_partnerId_idx" ON "PlatformPartnerKey"("partnerId");

-- AddForeignKey
ALTER TABLE "PlatformPartnerKey" ADD CONSTRAINT "PlatformPartnerKey_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PlatformPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "PlatformPartner" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PlatformPartner" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "PlatformPartnerKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PlatformPartnerKey" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
