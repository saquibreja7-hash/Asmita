-- Admin console Phase 1 (docs/product/admin-console-redesign.md).

-- The case list filters by status and creation date and reads each case's
-- links and notices by foreign key; none of these had an index.
CREATE INDEX IF NOT EXISTS "Case_createdAt_idx" ON "Case"("createdAt");
CREATE INDEX IF NOT EXISTS "Case_status_createdAt_idx" ON "Case"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SubmittedUrl_caseId_idx" ON "SubmittedUrl"("caseId");
CREATE INDEX IF NOT EXISTS "Notice_urlId_idx" ON "Notice"("urlId");

-- Admin case views and link reveals are logged per case or link, with the
-- reason given for a reveal.
ALTER TABLE "AdminAccessLog" ADD COLUMN "entityType" TEXT;
ALTER TABLE "AdminAccessLog" ADD COLUMN "entityId" TEXT;
ALTER TABLE "AdminAccessLog" ADD COLUMN "reason" TEXT;
CREATE INDEX IF NOT EXISTS "AdminAccessLog_entityId_idx" ON "AdminAccessLog"("entityId");

-- An admin revealing a survivor's link is an audited event.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'URL_REVEALED';
