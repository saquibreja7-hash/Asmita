-- Phase 2: client-side perceptual hash submissions + dispatch tracking.
-- The server never stores media; only encrypted 256-bit PDQ hashes.

ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'HASH_ADVISORY';

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'HASH_SUBMITTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'HASH_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'HASH_REJECTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'HASH_DISPATCHED';

CREATE TYPE "HashAlgorithm" AS ENUM ('PDQ');

CREATE TYPE "HashSubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'DISPATCHED', 'REJECTED');

CREATE TABLE "HashSubmission" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "algorithm" "HashAlgorithm" NOT NULL DEFAULT 'PDQ',
    "hashEncrypted" TEXT NOT NULL,
    "hashDigest" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "clientVersion" TEXT,
    "status" "HashSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "HashSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HashDispatch" (
    "id" TEXT NOT NULL,
    "hashSubmissionId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "noticeId" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HashDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HashSubmission_caseId_hashDigest_key" ON "HashSubmission"("caseId", "hashDigest");
CREATE INDEX "HashSubmission_status_idx" ON "HashSubmission"("status");
CREATE INDEX "HashSubmission_caseId_idx" ON "HashSubmission"("caseId");

CREATE UNIQUE INDEX "HashDispatch_hashSubmissionId_platformId_key" ON "HashDispatch"("hashSubmissionId", "platformId");
CREATE INDEX "HashDispatch_platformId_idx" ON "HashDispatch"("platformId");

ALTER TABLE "HashSubmission" ADD CONSTRAINT "HashSubmission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HashDispatch" ADD CONSTRAINT "HashDispatch_hashSubmissionId_fkey" FOREIGN KEY ("hashSubmissionId") REFERENCES "HashSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HashDispatch" ADD CONSTRAINT "HashDispatch_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HashDispatch" ADD CONSTRAINT "HashDispatch_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
