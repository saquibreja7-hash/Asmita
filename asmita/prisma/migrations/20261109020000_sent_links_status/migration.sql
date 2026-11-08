-- Sent links kept the approved status: notice dispatch recorded the Notice
-- row but never moved the link to NOTICE_SENT. Dispatch now does (in the same
-- transaction); this moves links that were already sent. Data only.
UPDATE "SubmittedUrl" AS su
SET "status" = 'NOTICE_SENT'
WHERE su."status" = 'NOTICE_QUEUED'
  AND EXISTS (
    SELECT 1 FROM "Notice" n
    WHERE n."urlId" = su."id"
      AND n."followUpOf" IS NULL
      AND n."sentAt" IS NOT NULL
  );
