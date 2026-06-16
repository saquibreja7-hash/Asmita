-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'URL_PORTAL_ACCESSED';

-- AlterTable
ALTER TABLE "Case" ALTER COLUMN "hashAdvisoryPlatformIds" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "HashSubmission" ADD CONSTRAINT "HashSubmission_requestedPlatformId_fkey" FOREIGN KEY ("requestedPlatformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "EmailDeliveryProof_provider_messageId_eventType_rawEventHash_ke" RENAME TO "EmailDeliveryProof_provider_messageId_eventType_rawEventHas_key";
