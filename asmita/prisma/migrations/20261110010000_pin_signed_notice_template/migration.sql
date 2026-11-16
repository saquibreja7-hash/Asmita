-- Pin the notice template a survivor signed (its id and a digest of its text)
-- so dispatch emails the text that was signed, not whatever template is newest.
-- Nullable: notices signed before this change have no pin and keep the old
-- selection at dispatch (src/lib/signed-template.ts).
ALTER TABLE "SubmittedUrl" ADD COLUMN "signedTemplateId" TEXT;
ALTER TABLE "SubmittedUrl" ADD COLUMN "signedTemplateDigest" TEXT;
ALTER TABLE "Case" ADD COLUMN "hashAdvisorySignedTemplateId" TEXT;
ALTER TABLE "Case" ADD COLUMN "hashAdvisorySignedTemplateDigest" TEXT;
