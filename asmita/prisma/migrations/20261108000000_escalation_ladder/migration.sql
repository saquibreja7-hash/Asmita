-- Escalation ladder (docs/product/escalation-ladder.md).
-- Form-only links start their ladder when the survivor files the platform form.
ALTER TABLE "SubmittedUrl" ADD COLUMN "platformFiledAt" TIMESTAMP(3);

-- Audit event for the survivor saying she filed the platform form.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PLATFORM_FORM_FILED';

-- Follow-up emails point at the notice they follow, so the sweep can skip them.
ALTER TABLE "Notice" ADD COLUMN "followUpOf" TEXT;

-- Follow-ups sent before this column existed: a notice row for a link that
-- also has an earlier row to the same recipient is a follow-up of that row.
UPDATE "Notice" AS f
SET "followUpOf" = (
  SELECT o.id FROM "Notice" o
  WHERE o."urlId" = f."urlId"
    AND o."recipientEmail" IS NOT DISTINCT FROM f."recipientEmail"
    AND o."sentAt" < f."sentAt"
  ORDER BY o."sentAt" ASC
  LIMIT 1
)
WHERE f."sentAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Notice" o
    WHERE o."urlId" = f."urlId"
      AND o."recipientEmail" IS NOT DISTINCT FROM f."recipientEmail"
      AND o."sentAt" < f."sentAt"
  );
