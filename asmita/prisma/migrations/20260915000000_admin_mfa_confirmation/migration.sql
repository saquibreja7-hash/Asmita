ALTER TABLE "AdminMfaSecret" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Existing per-admin secrets were already enrolled before confirmation existed.
UPDATE "AdminMfaSecret" SET "confirmedAt" = "enrolledAt";
