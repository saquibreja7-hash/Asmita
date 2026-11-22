-- Organization pages (asmita/docs/org/spec.md, WP56): posts, outreach
-- submissions, jobs, events and newsletter sign-ups. Additive only: five new
-- tables and new ORG_* audit event names. Statuses and kinds are
-- app-validated strings, like PlatformPartnerApplication.

-- AlterEnum
-- From this migration on, audit actions on org content are their own ORG_*
-- event names.
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_POST_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_POST_PUBLISHED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_POST_UNPUBLISHED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_POST_ARCHIVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_POST_DELETED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_JOB_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_JOB_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_EVENT_SAVED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_EVENT_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SUBMISSION_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SUBMISSION_NOTED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_SUBMISSION_EXPORTED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_NEWSLETTER_EXPORTED';

-- CreateTable
CREATE TABLE "OrgPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleHi" TEXT,
    "summaryEn" TEXT NOT NULL,
    "summaryHi" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyHi" TEXT,
    "coverIllustration" TEXT,
    "coverImagePath" TEXT,
    "attachmentUrl" TEXT,
    "attachmentLabel" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorDisplayName" TEXT NOT NULL,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "consentRecorded" BOOLEAN DEFAULT false NOT NULL,
    "anonymised" BOOLEAN DEFAULT false NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSubmission" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT DEFAULT 'NEW' NOT NULL,
    "payload" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "internalNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgJob" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "location" TEXT DEFAULT 'Remote, India' NOT NULL,
    "type" TEXT NOT NULL,
    "descriptionMd" TEXT NOT NULL,
    "applyEmail" TEXT NOT NULL,
    "applyInstructions" TEXT,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgEvent" (
    "id" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleHi" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "mode" TEXT NOT NULL,
    "city" TEXT,
    "registrationUrl" TEXT,
    "descriptionMd" TEXT NOT NULL,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "locale" TEXT DEFAULT 'en' NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "confirmTokenHash" TEXT,
    "unsubscribeTokenHash" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPost_slug_key" ON "OrgPost"("slug");
CREATE INDEX "OrgPost_status_publishedAt_idx" ON "OrgPost"("status", "publishedAt");
CREATE INDEX "OrgPost_kind_status_idx" ON "OrgPost"("kind", "status");
CREATE INDEX "OrgSubmission_kind_status_idx" ON "OrgSubmission"("kind", "status");
CREATE INDEX "OrgSubmission_createdAt_idx" ON "OrgSubmission"("createdAt");
CREATE INDEX "OrgSubmission_emailHash_idx" ON "OrgSubmission"("emailHash");
CREATE INDEX "OrgSubmission_closedAt_idx" ON "OrgSubmission"("closedAt");
CREATE UNIQUE INDEX "OrgJob_slug_key" ON "OrgJob"("slug");
CREATE INDEX "OrgJob_status_idx" ON "OrgJob"("status");
CREATE INDEX "OrgEvent_status_startsAt_idx" ON "OrgEvent"("status", "startsAt");
CREATE UNIQUE INDEX "NewsletterSubscriber_emailHash_key" ON "NewsletterSubscriber"("emailHash");
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");
CREATE INDEX "NewsletterSubscriber_createdAt_idx" ON "NewsletterSubscriber"("createdAt");
