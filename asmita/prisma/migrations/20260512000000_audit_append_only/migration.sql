-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VICTIM', 'SUPPORTER', 'NGO_WORKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'PARTIALLY_RESOLVED', 'RESOLVED', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "PlatformTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "NoticeBasis" AS ENUM ('IT_RULES_2021', 'DMCA', 'IT_RULES_AND_DMCA', 'EMAIL_ONLY', 'FORM_ONLY');

-- CreateEnum
CREATE TYPE "UrlStatus" AS ENUM ('PENDING_REVIEW', 'NOTICE_QUEUED', 'NOTICE_SENT', 'ESCALATED', 'REMOVED', 'UNRESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NoticeMethod" AS ENUM ('API', 'EMAIL', 'FORM_HANDOFF');

-- CreateEnum
CREATE TYPE "ResponseType" AS ENUM ('ACKNOWLEDGED', 'REMOVED', 'REJECTED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('IT_RULES_2021', 'DMCA', 'IT_RULES_AND_DMCA', 'ESCALATION_L1', 'ESCALATION_L2', 'FIR_PACKAGE');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_REGISTERED', 'USER_VERIFIED', 'CASE_CREATED', 'URL_SUBMITTED', 'URL_FLAGGED', 'URL_APPROVED', 'URL_REJECTED', 'NOTICE_QUEUED', 'NOTICE_SENT', 'NOTICE_FAILED', 'ESCALATION_L1_TRIGGERED', 'ESCALATION_L2_TRIGGERED', 'ESCALATION_L3_TRIGGERED', 'CONTENT_REMOVED', 'CASE_CLOSED', 'ADMIN_ACTION', 'NGO_VERIFIED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailEncrypted" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "aadhaarVerified" BOOLEAN NOT NULL DEFAULT false,
    "digilockerVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'VICTIM',
    "ageOver18" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "state" TEXT,
    "city" TEXT,
    "ngoVerified" BOOLEAN NOT NULL DEFAULT false,
    "ngoVerifierId" TEXT,
    "declarationSignedAt" TIMESTAMP(3),
    "declarationIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domainPatterns" TEXT[],
    "tier" "PlatformTier" NOT NULL,
    "noticeBasis" "NoticeBasis" NOT NULL,
    "grievanceEmail" TEXT,
    "grievanceName" TEXT,
    "grievanceAddress" TEXT,
    "formUrl" TEXT,
    "apiEndpoint" TEXT,
    "responseRate7d" DOUBLE PRECISION,
    "lastContactVerifiedAt" TIMESTAMP(3),
    "lastContactVerifiedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittedUrl" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "urlEncrypted" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "platformId" TEXT,
    "status" "UrlStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,

    CONSTRAINT "SubmittedUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeTemplate" (
    "id" TEXT NOT NULL,
    "platformId" TEXT,
    "templateType" "TemplateType" NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "legalCitations" JSONB NOT NULL,
    "reviewedByLegal" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "templateId" TEXT,
    "routingTier" INTEGER NOT NULL,
    "method" "NoticeMethod" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "recipientEmail" TEXT,
    "messageId" TEXT,
    "payloadHash" TEXT,
    "responseReceivedAt" TIMESTAMP(3),
    "responseType" "ResponseType",
    "removedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actorId" TEXT,
    "data" JSONB,
    "ipHash" TEXT,
    "previousHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Case_referenceNumber_key" ON "Case"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_sequence_key" ON "audit_log"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_eventHash_key" ON "audit_log"("eventHash");

-- CreateIndex
CREATE INDEX "audit_log_entityId_idx" ON "audit_log"("entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "OtpToken_emailHash_idx" ON "OtpToken"("emailHash");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_ngoVerifierId_fkey" FOREIGN KEY ("ngoVerifierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittedUrl" ADD CONSTRAINT "SubmittedUrl_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittedUrl" ADD CONSTRAINT "SubmittedUrl_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeTemplate" ADD CONSTRAINT "NoticeTemplate_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "SubmittedUrl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NoticeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only enforcement for the tamper-evident audit trail.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM PUBLIC;
