-- Mark when the 7-day FIR package became officially available to the victim.
-- The PDF itself is generated on demand by /api/cases/[caseId]/export; this
-- timestamp lets the dashboard show a "ready" badge and lets analytics
-- distinguish self-initiated exports from L3 escalation outcomes.

ALTER TABLE "Case" ADD COLUMN "firPackageGeneratedAt" TIMESTAMP(3);
