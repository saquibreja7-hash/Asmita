-- Notice integrity (ADR 004, M8 + M9): each signed document records the exact
-- fingerprints it lists, and dispatch sends exactly that set.
ALTER TABLE "SubmittedUrl" ADD COLUMN "signedHashSubmissionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Case" ADD COLUMN "hashAdvisorySignedHashIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
