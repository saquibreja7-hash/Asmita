-- Watch-and-verify WP23, fixed in the watch-mode merge (WP34): the
-- CONTENT_STILL_ONLINE audit event was in the Prisma schema and written by
-- link-verification.ts, but no migration had added it to the Postgres enum
-- (the WP23 migration created LinkVerificationOutcome, not this value), so
-- the first still-online audit write would have failed against a real
-- database. Additive only: one enum value, nothing else.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CONTENT_STILL_ONLINE';
