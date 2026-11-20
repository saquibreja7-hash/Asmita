-- Watch-and-verify WP23: scheduled re-checks that a link reported removed
-- really stayed down. One row per check (attempts 1..3 at +1/+3/+7 days).
-- No URL is stored in this table — a check works from the SubmittedUrl it
-- references. Additive only: a new enum, a new table, nothing existing
-- changes except the SubmittedUrl relation, which exists only in the client
-- schema. The table follows the same RLS rule as every other table (see
-- 20261031000000_least_privilege_and_rls): deny by default, only asmita_app
-- gets rows, nothing reaches the Supabase Data API.

-- CreateEnum
CREATE TYPE "LinkVerificationOutcome" AS ENUM ('PENDING', 'GONE', 'STILL_ONLINE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "LinkVerification" (
    "id" TEXT NOT NULL,
    "submittedUrlId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" "LinkVerificationOutcome" NOT NULL DEFAULT 'PENDING',
    "checkedAt" TIMESTAMP(3),
    "enqueuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkVerification_outcome_dueAt_idx" ON "LinkVerification"("outcome", "dueAt");

-- CreateIndex
CREATE INDEX "LinkVerification_submittedUrlId_idx" ON "LinkVerification"("submittedUrlId");

-- AddForeignKey
ALTER TABLE "LinkVerification" ADD CONSTRAINT "LinkVerification_submittedUrlId_fkey" FOREIGN KEY ("submittedUrlId") REFERENCES "SubmittedUrl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The spec fixes the attempts at 1..3 (the +1/+3/+7 day checks).
ALTER TABLE "LinkVerification" ADD CONSTRAINT "LinkVerification_attempt_check" CHECK ("attempt" >= 1 AND "attempt" <= 3);

-- Row-level security, like every other table.
ALTER TABLE "LinkVerification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "LinkVerification" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
