import type { ReviewSubjectCard, ReviewSubjectKind } from "@/lib/review-adapters";
import { getReviewAdapter } from "@/lib/review-adapters";
import { listFlaggedLinks } from "@/lib/admin-cases";
import { getCrawlFindingSummary } from "@/lib/crawl-findings";
import { listHashReviewQueue, videoFingerprintLabel } from "@/lib/hash-submission";
import { listPartnerApplications } from "@/lib/platform-partners";
import { PARTNER_INTERESTS, PLATFORM_TYPES, USER_BASES } from "@/lib/platform-partners-shared";
import { labelList, matchLine, platformLabel, STATUS_LABELS, shortDate } from "../findings/finding-view";
import { shortDuration } from "../cases/case-format";

/*
 * The review screens' subject card (WP141): "what the item is, in the words
 * the current page for that kind uses". Every fact comes from the same
 * loader the kind's own page renders, so the two can never disagree — and
 * nothing here reveals more than that page does. A link is a masked domain
 * with a flag reason; a finding's address stays behind the existing Reveal
 * flow. The AI Lab describes its own reports through the registered
 * adapter, because nothing outside the Lab may import lab modules.
 */

/** The consent line of a finding card, in the findings page's own words. */
function consentLine(row: { watchOnly: boolean; crawlConsentWithdrawn: boolean }) {
  if (row.crawlConsentWithdrawn) return "Authorisation withdrawn: no notice can be sent for this finding.";
  if (row.watchOnly) return "Watch only: she has not asked for removal yet.";
  return "Matched under her live crawl authorisation.";
}

async function flaggedLinkCard(urlId: string, now: Date): Promise<ReviewSubjectCard | null> {
  const row = (await listFlaggedLinks(now)).find((entry) => entry.urlId === urlId);
  if (!row) return null;
  return {
    summary: `Link on ${row.domain} · ${row.platformName}`,
    caseId: row.caseId,
    caseReference: row.referenceNumber,
    urlsPurged: false,
    fields: [
      { label: "Case", value: row.referenceNumber },
      { label: "Platform", value: row.platformName },
      { label: "Address", value: row.domain },
      { label: "Reason", value: row.reason },
      { label: "Status", value: row.status.replaceAll("_", " ").toLowerCase() },
      { label: "Age", value: shortDuration(row.ageMinutes * 60_000) },
    ],
  };
}

async function fingerprintCard(hashId: string): Promise<ReviewSubjectCard | null> {
  const row = (await listHashReviewQueue()).find((entry) => entry.id === hashId);
  if (!row) return null;
  const digest =
    row.algorithm === "VPDQ"
      ? `${videoFingerprintLabel(row.videoFrameCount, row.videoDurationSec)} (${row.hashDigest.slice(0, 16)}…)`
      : `${row.hashDigest.slice(0, 16)}…`;
  return {
    summary: `Fingerprint ${digest} · ${row.algorithm}`,
    caseId: row.caseId,
    caseReference: row.referenceNumber,
    urlsPurged: false,
    fields: [
      { label: "Case", value: row.referenceNumber },
      { label: "Algorithm", value: row.algorithm },
      { label: "Quality", value: `${row.quality}/100` },
      { label: "Status", value: row.status.replaceAll("_", " ").toLowerCase() },
      { label: "Platform", value: row.requestedPlatformName ?? "-" },
      { label: "Flags", value: row.flagReason ?? "-" },
      { label: "Age", value: shortDuration(row.ageMinutes * 60_000) },
    ],
  };
}

async function findingCard(findingId: string): Promise<ReviewSubjectCard | null> {
  const row = await getCrawlFindingSummary(findingId);
  if (!row) return null;
  return {
    summary: `Finding for ${row.caseReference ?? "an unknown case"}`,
    caseId: row.caseId,
    caseReference: row.caseReference,
    urlsPurged: row.urlsPurged,
    fields: [
      { label: "Case", value: row.caseReference ?? "Unknown case" },
      { label: "Match", value: matchLine(row) },
      { label: "Quality", value: `${row.quality}/100` },
      { label: "Consent", value: consentLine(row) },
      { label: "Labels", value: labelList(row).length === 0 ? "None" : labelList(row).join(" · ") },
      { label: "Source", value: row.sourceDomain ?? "-" },
      { label: "Platform", value: platformLabel(row.platform) },
      { label: "Review", value: STATUS_LABELS[row.reviewStatus] },
      { label: "First seen", value: `${shortDate(row.firstSeenAt)} UTC` },
    ],
  };
}

async function partnerApplicationCard(applicationId: string): Promise<ReviewSubjectCard | null> {
  const row = (await listPartnerApplications()).find((entry) => entry.id === applicationId);
  if (!row) return null;
  const fields: Array<{ label: string; value: string }> = [
    { label: "Platform", value: row.platformName },
    { label: "Website", value: row.websiteDomain },
    { label: "Organisation", value: row.organisationName },
    { label: "Kind", value: PLATFORM_TYPES[row.platformType] ?? row.platformType },
    { label: "Users in India", value: USER_BASES[row.userBase] ?? row.userBase },
    { label: "Contact", value: `${row.contactName}, ${row.contactRole}` },
    { label: "Email", value: row.contactEmail },
    { label: "Phone", value: row.contactPhone ?? "Not given" },
    { label: "Wants", value: row.interests.map((key) => PARTNER_INTERESTS[key] ?? key).join("; ") },
    { label: "Status", value: row.status.replaceAll("_", " ").toLowerCase() },
  ];
  if (row.message) fields.push({ label: "Message", value: row.message });
  return {
    summary: `Partner application: ${row.platformName} (${row.websiteDomain})`,
    caseId: null,
    caseReference: null,
    urlsPurged: false,
    fields,
  };
}

/**
 * The subject card for a job, or null when the subject no longer resolves.
 * Read-only: this adds no decision, no reveal, nothing the kind's own page
 * does not already show.
 */
export async function describeReviewSubject(
  kind: ReviewSubjectKind,
  subjectId: string,
  now = new Date(),
): Promise<ReviewSubjectCard | null> {
  switch (kind) {
    case "FLAGGED_LINK":
      return flaggedLinkCard(subjectId, now);
    case "FINGERPRINT":
      return fingerprintCard(subjectId);
    case "FINDING":
      return findingCard(subjectId);
    case "PARTNER_APPLICATION":
      return partnerApplicationCard(subjectId);
    case "LAB_REPORT": {
      // Lab facts come through the registered adapter: the Lab's code is the
      // only place that may name lab modules.
      const adapter = await getReviewAdapter("LAB_REPORT");
      return adapter?.describeSubject ? adapter.describeSubject(subjectId, now) : null;
    }
  }
}
