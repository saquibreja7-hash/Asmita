-- Review labels on crawler findings (WP37): additive only. Three analyst
-- labels ("Looks AI-made", "Sexual content", "Possible minor"), each with
-- who set it and when; the possible-minor label also records who cleared
-- it, when and why, because clearing it needs a second admin with a
-- reason. The MINOR_PROTOCOL status value marks a finding the
-- possible-minor label moved out of the adult review flow (CANDIDATE or
-- APPROVED before; minorProtocolBefore remembers which). Row-level
-- security is untouched: no new table, no policy change.

ALTER TYPE "CrawlFindingStatus" ADD VALUE IF NOT EXISTS 'MINOR_PROTOCOL';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_LABEL_SET';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CRAWL_FINDING_LABEL_CLEARED';

-- Existing rows read as unlabelled (false); the audit trail of any earlier
-- labelling lives in AuditLog, not here.
ALTER TABLE "CrawlFinding"
  ADD COLUMN "labelAiMade" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "labelAiMadeById" TEXT,
  ADD COLUMN "labelAiMadeAt" TIMESTAMP(3),
  ADD COLUMN "labelSexual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "labelSexualById" TEXT,
  ADD COLUMN "labelSexualAt" TIMESTAMP(3),
  ADD COLUMN "labelPossibleMinor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "labelPossibleMinorById" TEXT,
  ADD COLUMN "labelPossibleMinorAt" TIMESTAMP(3),
  ADD COLUMN "labelPossibleMinorClearedById" TEXT,
  ADD COLUMN "labelPossibleMinorClearedAt" TIMESTAMP(3),
  ADD COLUMN "labelPossibleMinorClearReason" TEXT,
  ADD COLUMN "minorProtocolBefore" TEXT;
