-- Old unsent PDFs refer to the retired portal and must be reviewed and signed
-- again. Already-sent documents are retained until their normal retention sweep.
UPDATE "SubmittedUrl" AS u
SET "signedNoticePdf" = NULL, "signedHashSubmissionIds" = ARRAY[]::TEXT[]
WHERE u."signedNoticePdf" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Notice" n WHERE n."urlId" = u.id AND n."sentAt" IS NOT NULL);

-- Existing portal links must no longer resolve after this migration.
DELETE FROM "UrlPortalToken";

-- Human legal review is required for replacement notice text.
UPDATE "NoticeTemplate"
SET "reviewedByLegal" = false, "reviewedAt" = NULL, "reviewedByName" = NULL
WHERE "bodyTemplate" ~* '(secure content locator|one[- ]time secure portal|secure portal link)';
