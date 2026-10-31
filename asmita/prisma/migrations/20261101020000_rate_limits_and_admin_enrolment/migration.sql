-- ADR 004 Phase 2: shared rate limit counters (M12, M13) and one-time admin
-- enrolment codes replacing the shared ADMIN_TOTP_SECRET bootstrap (M11).

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

CREATE TABLE "AdminEnrolmentCode" (
    "emailHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "AdminEnrolmentCode_pkey" PRIMARY KEY ("emailHash")
);

-- Same rules as every table (migration 20261031000000): deny by default,
-- only asmita_app gets rows. Default privileges already grant asmita_app.
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "RateLimitBucket" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "AdminEnrolmentCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "AdminEnrolmentCode" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
