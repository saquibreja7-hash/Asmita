-- Notice integrity (ADR 004, M8 + M9): each signed document records the exact
-- fingerprints it lists, and dispatch sends exactly that set.
ALTER TABLE "SubmittedUrl" ADD COLUMN "signedHashSubmissionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Case" ADD COLUMN "hashAdvisorySignedHashIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Signatures made before this migration cannot say which fingerprints they
-- list. Void the unsent ones that may list any, so the survivor signs again;
-- sent ones stay as the record of what was sent.
UPDATE "SubmittedUrl" u
SET "signedNoticePdf" = NULL
WHERE u."signedNoticePdf" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Notice" n WHERE n."urlId" = u.id)
  AND EXISTS (SELECT 1 FROM "HashSubmission" h WHERE h."caseId" = u."caseId");

UPDATE "Case" c
SET "signedHashAdvisoryPdf" = NULL
WHERE c."signedHashAdvisoryPdf" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "HashDispatch" d JOIN "HashSubmission" h ON h.id = d."hashSubmissionId"
    WHERE h."caseId" = c.id
  );
