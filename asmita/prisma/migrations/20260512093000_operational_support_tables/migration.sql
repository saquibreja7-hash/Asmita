-- Extend role/audit types for the fuller TRD coverage.
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'LEGAL_ADVISOR', 'CASE_REVIEWER', 'GO_EDITOR', 'SUPPORT_AGENT');
CREATE TYPE "DeletionJobStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'FAILED');

ALTER TYPE "AuditEventType" ADD VALUE 'DECLARATION_SIGNED';
ALTER TYPE "AuditEventType" ADD VALUE 'IDENTITY_VERIFICATION';
ALTER TYPE "AuditEventType" ADD VALUE 'CASE_EXPORT';
ALTER TYPE "AuditEventType" ADD VALUE 'CASE_DELETION_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE 'CASE_HARD_DELETED';
ALTER TYPE "AuditEventType" ADD VALUE 'GO_DATABASE_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'TEMPLATE_ACTIVATED';

-- GO contact edit history.
CREATE TABLE "PlatformGoHistory" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "sourceUrl" TEXT,
    "verifiedBy" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformGoHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformGoHistory_platformId_idx" ON "PlatformGoHistory"("platformId");
CREATE INDEX "PlatformGoHistory_createdAt_idx" ON "PlatformGoHistory"("createdAt");

ALTER TABLE "PlatformGoHistory"
ADD CONSTRAINT "PlatformGoHistory_platformId_fkey"
FOREIGN KEY ("platformId") REFERENCES "Platform"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Session, admin, NGO, feedback, and deletion support.
CREATE TABLE "SessionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionToken_tokenHash_key" ON "SessionToken"("tokenHash");
CREATE INDEX "SessionToken_userId_idx" ON "SessionToken"("userId");
CREATE INDEX "SessionToken_expiresAt_idx" ON "SessionToken"("expiresAt");

ALTER TABLE "SessionToken"
ADD CONSTRAINT "SessionToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdminProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminProfile_userId_key" ON "AdminProfile"("userId");

ALTER TABLE "AdminProfile"
ADD CONSTRAINT "AdminProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdminAccessLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAccessLog_adminId_idx" ON "AdminAccessLog"("adminId");
CREATE INDEX "AdminAccessLog_createdAt_idx" ON "AdminAccessLog"("createdAt");

CREATE TABLE "NgoApiKey" (
    "id" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgoApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NgoApiKey_keyHash_key" ON "NgoApiKey"("keyHash");
CREATE INDEX "NgoApiKey_partnerName_idx" ON "NgoApiKey"("partnerName");

ALTER TABLE "NgoApiKey"
ADD CONSTRAINT "NgoApiKey_issuedById_fkey"
FOREIGN KEY ("issuedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "caseReference" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_caseId_idx" ON "Feedback"("caseId");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

ALTER TABLE "Feedback"
ADD CONSTRAINT "Feedback_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeletionJob" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" "DeletionJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "error" TEXT,

    CONSTRAINT "DeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletionJob_caseId_idx" ON "DeletionJob"("caseId");
CREATE INDEX "DeletionJob_scheduledAt_idx" ON "DeletionJob"("scheduledAt");
CREATE INDEX "DeletionJob_status_idx" ON "DeletionJob"("status");

ALTER TABLE "DeletionJob"
ADD CONSTRAINT "DeletionJob_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
