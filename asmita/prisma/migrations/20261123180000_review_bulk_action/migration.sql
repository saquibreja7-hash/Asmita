-- Review console WP145 (docs/product/review-console-spec.md): decisions
-- log, review metrics and safer bulk actions. Additive only: one new audit
-- event value, nothing else changes. The decisions log and the metrics page
-- read the tables WP140 already created; the bulk routes extend the
-- existing per-item review flows.

-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a migration transaction as long as
-- the new value is not used in the same transaction (20261122120000 and
-- 20261122140000 do the same).
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ADMIN_BULK_ACTION';
