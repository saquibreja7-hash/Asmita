-- Partner programme sign-ups from /for-platforms. Business contact details
-- only; name, email, phone and message are stored encrypted by the app.
-- Additive only: a new table, nothing existing changes.

-- CreateTable
CREATE TABLE "PlatformPartnerApplication" (
    "id" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "platformName" TEXT NOT NULL,
    "websiteDomain" TEXT NOT NULL,
    "platformType" TEXT NOT NULL,
    "userBase" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactRole" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformPartnerApplication_createdAt_idx" ON "PlatformPartnerApplication"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformPartnerApplication_status_idx" ON "PlatformPartnerApplication"("status");

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, only asmita_app gets rows.
ALTER TABLE "PlatformPartnerApplication" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PlatformPartnerApplication" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
