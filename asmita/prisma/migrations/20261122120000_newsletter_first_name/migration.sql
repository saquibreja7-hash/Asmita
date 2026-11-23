-- Newsletter sign-up asks for a first name. Additive only: one nullable
-- column, encrypted like the address (existing rows stay NULL).

-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "firstNameEnc" TEXT;
