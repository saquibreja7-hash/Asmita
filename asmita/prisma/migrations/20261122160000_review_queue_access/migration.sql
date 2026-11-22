-- Review console WP144 (docs/product/review-console-spec.md): queue access,
-- the Admins page and step-up MFA. Additive only: one new table, nothing
-- existing changes. No new enum values (AdminRole already exists) and no new
-- audit event (access changes audit as the existing ADMIN_ACTION, like the
-- WP142 reason and WP143 queue changes).

-- CreateTable
-- A queue with no rows keeps today's visibility (every role with the
-- adapter's permission); rows narrow it to the listed roles and admins. The
-- protected minor-hold queue ignores rows and stays SUPER_ADMIN only.
CREATE TABLE "ReviewQueueAccess" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "role" "AdminRole",
    "adminEmailHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewQueueAccess_pkey" PRIMARY KEY ("id")
);

-- Exactly one of role and adminEmailHash is set: a row names either one
-- role or one admin, never both and never neither.
ALTER TABLE "ReviewQueueAccess"
    ADD CONSTRAINT "ReviewQueueAccess_one_target_check"
    CHECK (("role" IS NULL) <> ("adminEmailHash" IS NULL));

-- CreateIndex
CREATE INDEX "ReviewQueueAccess_queueId_idx" ON "ReviewQueueAccess"("queueId");

-- One row per (queue, role) and per (queue, admin), expressed as partial
-- unique indexes because the two targets share the nullable columns.
CREATE UNIQUE INDEX "ReviewQueueAccess_queueId_role_key"
    ON "ReviewQueueAccess"("queueId", "role") WHERE "role" IS NOT NULL;
CREATE UNIQUE INDEX "ReviewQueueAccess_queueId_adminEmailHash_key"
    ON "ReviewQueueAccess"("queueId", "adminEmailHash") WHERE "adminEmailHash" IS NOT NULL;

-- Same rule as every other table (20261031000000_least_privilege_and_rls):
-- row-level security on, deny by default, only asmita_app gets rows.
ALTER TABLE "ReviewQueueAccess" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ReviewQueueAccess" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
