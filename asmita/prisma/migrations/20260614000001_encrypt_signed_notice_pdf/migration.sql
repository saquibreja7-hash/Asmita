-- Change signedNoticePdf from raw BYTEA to encrypted TEXT (AES-256-GCM via encryptField).
-- Existing BYTEA data is not migrated — this column was added in the same release.
ALTER TABLE "SubmittedUrl" DROP COLUMN "signedNoticePdf";
ALTER TABLE "SubmittedUrl" ADD COLUMN "signedNoticePdf" TEXT;

-- Add NOTICE_SIGNED to the AuditEventType enum.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'NOTICE_SIGNED';
