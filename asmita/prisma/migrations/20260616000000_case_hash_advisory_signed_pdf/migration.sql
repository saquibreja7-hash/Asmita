-- Add signed hash advisory PDF and target platform IDs to Case.
-- Enables the hash-only legal notice flow: survivor signs once (platform-agnostic),
-- encrypted PDF is stored here, dispatched to all target email platforms as attachment.

ALTER TABLE "Case" ADD COLUMN "signedHashAdvisoryPdf" TEXT;
ALTER TABLE "Case" ADD COLUMN "hashAdvisoryPlatformIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
