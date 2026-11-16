-- Representative notices for crawler-found links (additive only). Asmita
-- sends these as the survivor's authorised representative under her crawl
-- authorisation; they are stored apart from survivor-signed notices.

-- AlterTable
ALTER TABLE "SubmittedUrl" ADD COLUMN     "representativeNoticePdf" TEXT,
ADD COLUMN     "representativeNoticeDigest" TEXT,
ADD COLUMN     "representativeTemplateId" TEXT,
ADD COLUMN     "representativeTemplateDigest" TEXT,
ADD COLUMN     "representativeConsentId" TEXT,
ADD COLUMN     "representativeSentById" TEXT,
ADD COLUMN     "representativeApprovedById" TEXT,
ADD COLUMN     "crawlConsentWithdrawnAt" TIMESTAMP(3);
