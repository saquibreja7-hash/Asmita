-- Two-person rule for platform contacts. Editing a contact withdraws its
-- verification and records who changed it; a different admin must verify.
-- Existing rows keep their verification and have no recorded changer.
ALTER TABLE "Platform" ADD COLUMN "contactChangedBy" TEXT;
ALTER TABLE "Platform" ADD COLUMN "contactChangedAt" TIMESTAMP(3);

-- Verifying a contact is its own audited event, separate from the edit.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'GO_CONTACT_VERIFIED';
