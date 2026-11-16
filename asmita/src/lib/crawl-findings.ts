import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlFinding } from "@/lib/crawl-store";
import { findingStillConsented, resolvePoolFingerprint, CRAWL_MATCH_THRESHOLD } from "@/lib/crawl-pool";
import { isEnabledCrawlSource } from "@/lib/crawl-sources";
import { decryptField, encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { isUrlExpired } from "@/lib/url-retention";
import * as store from "@/lib/store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Possible copies reported by the crawler service, and the analyst review
 * that turns one into a link on the survivor's case.
 *
 * - URLs are only ever strings here: validated with the same link rules as
 *   survivor links, encrypted at rest, never fetched, never logged, never in
 *   audit data. They are blanked 30 days after first seen (url-retention.ts).
 * - Dedup is per case and per authorisation on a digest of the normalised
 *   page and image URLs. A repeat sighting moves lastSeenAt and keeps the
 *   lowest distance. After she withdraws and signs again, the same copy is a
 *   new finding under the new authorisation: the old finding and its stopped
 *   link stay untouched as the record, and are never revived.
 * - Review: one analyst approves or dismisses. A match with distance above
 *   SECOND_REVIEW_DISTANCE needs a second, different analyst before it is
 *   APPROVED. Final approval re-checks that the survivor's authorisation is
 *   still live, then adds the page URL to the case as a SubmittedUrl with
 *   source CRAWLER. Nothing is sent to anyone here.
 */

export const MAX_FINDINGS_PER_BATCH = 50;
export const SECOND_REVIEW_DISTANCE = 20;
const MAX_URL_LENGTH = 2048;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// Media-like payloads never get past the schema: only an explicit http(s)
// URL of bounded length with no whitespace, and nothing base64-shaped.
const crawlUrl = z
  .string()
  .min(10)
  .max(MAX_URL_LENGTH)
  .regex(/^https?:\/\/[^\s]+$/i)
  .refine((value) => !/;base64,|^data:|[\x00-\x1F\x7F]/i.test(value), { message: "media_payload_rejected" });

export const crawlFindingSchema = z
  .object({
    fingerprintId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
    pageUrl: crawlUrl,
    imageUrl: crawlUrl,
    distance: z.number().int().min(0).max(CRAWL_MATCH_THRESHOLD),
    quality: z.number().int().min(0).max(100),
    observedAt: z.iso.datetime({ offset: true }),
    sourceId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

// The envelope is checked whole (400 when wrong); each finding is checked on
// its own, so one malformed item is "rejected" without losing the others.
export const crawlFindingsBodySchema = z
  .object({
    runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
    findings: z.array(z.unknown()).min(1).max(MAX_FINDINGS_PER_BATCH),
  })
  .strict();

export type CrawlFindingsBody = z.infer<typeof crawlFindingsBodySchema>;
export type CrawlFindingResult = { status: "created" | "duplicate" | "rejected"; reason?: string };

// One reason for every fingerprint refusal, so the crawler cannot tell an
// unknown id from a withdrawn or unapproved one.
const FINGERPRINT_REFUSED = "fingerprint_not_accepted";

function findingDigest(caseId: string, consentId: string, pageUrl: string, imageUrl: string) {
  return sha256(`crawl-finding\u0000${caseId}\u0000${consentId}\u0000${pageUrl}\u0000${imageUrl}`);
}

type NewFinding = {
  caseId: string;
  hashSubmissionId: string;
  crawlConsentId: string;
  pageUrl: string;
  imageUrl: string;
  urlDigest: string;
  distance: number;
  quality: number;
  sourceId: string;
  runId: string;
};

// A closer sighting replaces the matched fingerprint and distance only while
// nobody has reviewed the finding: once an analyst approved it (even the
// first of two), the fingerprint the analysts confirmed is the one a
// representative notice names (src/lib/crawl-notice.ts).
const CLOSER_WHILE_CANDIDATE = sql`excluded."distance" < "CrawlFinding"."distance" AND "CrawlFinding"."reviewStatus" = 'CANDIDATE' AND "CrawlFinding"."reviewedById" IS NULL`;

/** Inserts or merges one finding. Returns its id and whether it was new. */
async function upsertFinding(input: NewFinding, now: Date): Promise<{ id: string; created: boolean }> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const existing = [...memory.findings.values()].find((f) => f.caseId === input.caseId && f.urlDigest === input.urlDigest);
    if (existing) {
      existing.lastSeenAt = now;
      if (existing.reviewStatus === "CANDIDATE" && existing.reviewedById === null && input.distance < existing.distance) {
        Object.assign(existing, { distance: input.distance, quality: input.quality, hashSubmissionId: input.hashSubmissionId, sourceId: input.sourceId, runId: input.runId });
      }
      return { id: existing.id, created: false };
    }
    const row: MemoryCrawlFinding = {
      id: randomUUID(), caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
      pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
      urlDigest: input.urlDigest, distance: input.distance, quality: input.quality, firstSeenAt: now, lastSeenAt: now,
      sourceId: input.sourceId, runId: input.runId, reviewStatus: "CANDIDATE",
      reviewedById: null, reviewedAt: null, secondReviewedById: null, secondReviewedAt: null,
    };
    memory.findings.set(row.id, row);
    return { id: row.id, created: true };
  }

  if (usesWorkerKysely()) {
    // One statement, so concurrent reports of the same copy cannot race.
    const row = await getWorkerDb().insertInto("CrawlFinding").values({
      id: randomUUID(), caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
      pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
      urlDigest: input.urlDigest, distance: input.distance, quality: input.quality,
      firstSeenAt: now, lastSeenAt: now, sourceId: input.sourceId, runId: input.runId,
    }).onConflict((oc) => oc.columns(["caseId", "urlDigest"]).doUpdateSet({
      lastSeenAt: now,
      hashSubmissionId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."hashSubmissionId" ELSE "CrawlFinding"."hashSubmissionId" END`,
      quality: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."quality" ELSE "CrawlFinding"."quality" END`,
      sourceId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."sourceId" ELSE "CrawlFinding"."sourceId" END`,
      runId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."runId" ELSE "CrawlFinding"."runId" END`,
      distance: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."distance" ELSE "CrawlFinding"."distance" END`,
    })).returning(["id", sql<boolean>`(xmax = 0)`.as("inserted")]).executeTakeFirstOrThrow();
    return { id: row.id, created: Boolean(row.inserted) };
  }

  const { db } = await import("@/lib/db");
  const where = { caseId_urlDigest: { caseId: input.caseId, urlDigest: input.urlDigest } };
  const merge = async () => {
    const existing = await db.crawlFinding.findUnique({ where, select: { id: true, distance: true, reviewStatus: true, reviewedById: true } });
    if (!existing) return null;
    await db.crawlFinding.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        ...(existing.reviewStatus === "CANDIDATE" && existing.reviewedById === null && input.distance < existing.distance
          ? { distance: input.distance, quality: input.quality, hashSubmissionId: input.hashSubmissionId, sourceId: input.sourceId, runId: input.runId }
          : {}),
      },
    });
    return { id: existing.id, created: false };
  };
  const merged = await merge();
  if (merged) return merged;
  try {
    const created = await db.crawlFinding.create({
      data: {
        caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
        pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
        urlDigest: input.urlDigest, distance: input.distance, quality: input.quality,
        firstSeenAt: now, lastSeenAt: now, sourceId: input.sourceId, runId: input.runId,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (err) {
    // Another request recorded the same copy first.
    if ((err as { code?: string }).code === "P2002") {
      const again = await merge();
      if (again) return again;
    }
    throw err;
  }
}

/**
 * Records a validated batch. Results are index-aligned with the input. The
 * clock is the server's: observedAt is accepted for the crawler's own
 * records but never drives retention.
 */
export async function recordCrawlFindings(
  body: CrawlFindingsBody,
  keyId: string,
  now = new Date(),
): Promise<{ results: CrawlFindingResult[]; mediaRejected: boolean }> {
  const fingerprints = new Map<string, Awaited<ReturnType<typeof resolvePoolFingerprint>>>();
  const sources = new Map<string, boolean>();
  const results: CrawlFindingResult[] = [];
  let mediaRejected = false;

  for (const raw of body.findings) {
    const checked = crawlFindingSchema.safeParse(raw);
    if (!checked.success) {
      const media = checked.error.issues.some((issue) => issue.message === "media_payload_rejected");
      mediaRejected ||= media;
      results.push({ status: "rejected", reason: media ? "media_payload_rejected" : "invalid_finding" });
      continue;
    }
    const item = checked.data;
    const page = parseSubmittedUrl(item.pageUrl);
    const image = parseSubmittedUrl(item.imageUrl);
    if (!page.ok || !image.ok) {
      results.push({ status: "rejected", reason: "invalid_url" });
      continue;
    }
    if (!sources.has(item.sourceId)) sources.set(item.sourceId, await isEnabledCrawlSource(item.sourceId));
    if (!sources.get(item.sourceId)) {
      results.push({ status: "rejected", reason: "unknown_source" });
      continue;
    }
    if (!fingerprints.has(item.fingerprintId)) fingerprints.set(item.fingerprintId, await resolvePoolFingerprint(item.fingerprintId));
    const fingerprint = fingerprints.get(item.fingerprintId);
    if (!fingerprint) {
      results.push({ status: "rejected", reason: FINGERPRINT_REFUSED });
      continue;
    }

    const { id, created } = await upsertFinding({
      caseId: fingerprint.caseId,
      hashSubmissionId: fingerprint.hashSubmissionId,
      crawlConsentId: fingerprint.consentId,
      pageUrl: page.normalizedUrl,
      imageUrl: image.normalizedUrl,
      urlDigest: findingDigest(fingerprint.caseId, fingerprint.consentId, page.normalizedUrl, image.normalizedUrl),
      distance: item.distance,
      quality: item.quality,
      sourceId: item.sourceId,
      runId: body.runId,
    }, now);
    if (created) {
      // Never the URLs or the fingerprint.
      await writeAuditLog({
        eventType: "CRAWL_FINDING_RECORDED",
        entityType: "CrawlFinding",
        entityId: id,
        actorId: `crawler:${keyId}`,
        data: { caseId: fingerprint.caseId, distance: item.distance, sourceId: item.sourceId, runId: body.runId },
      });
    }
    results.push({ status: created ? "created" : "duplicate" });
  }
  return { results, mediaRejected };
}

// ---------------------------------------------------------------------------
// Analyst review

export const FINDING_STATUSES = ["CANDIDATE", "APPROVED", "DISMISSED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FindingPlatformView = {
  name: string;
  /** A human verified the grievance email and the platform takes notices by email. */
  contactVerified: boolean;
  /** The platform takes reports only through its own form (or has no grievance email). */
  formOnly: boolean;
};

export type CrawlFindingListRow = {
  id: string;
  caseId: string;
  caseReference: string | null;
  distance: number;
  quality: number;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewStatus: FindingStatus;
  sourceDomain: string | null;
  /** The matched fingerprint as the hashes page shows it: the first 16 hex of its digest, never the PDQ. */
  fingerprintRef: string | null;
  /** The link's platform once approved; before that, the platform the source site belongs to, if known. */
  platform: FindingPlatformView | null;
  needsSecondReview: boolean;
  /** Same as needsSecondReview: distance above SECOND_REVIEW_DISTANCE. */
  secondReviewRequired: boolean;
  awaitingSecondReview: boolean;
  firstReviewedAt: string | null;
  /** Whether the admin asking gave the first review. Never says who did. */
  currentAdminGaveFirstReview: boolean;
  urlsPurged: boolean;
  /** Status of the CRAWLER link approval created, if any. */
  linkStatus: string | null;
  /** When Asmita's representative notice for this finding went out. */
  representativeNoticeSentAt: string | null;
  /**
   * A notice was stored for sending but never recorded as sent: a send in
   * progress, or an earlier attempt that may have reached the platform.
   */
  noticeAttemptUnconfirmed: boolean;
  /** She withdrew the authorisation this finding was matched under, so no notice can go out for it. */
  crawlConsentWithdrawn: boolean;
};

type FindingRow = Omit<MemoryCrawlFinding, "reviewStatus"> & { reviewStatus: string };

type ListExtras = {
  caseReference: string | null;
  sourceDomain: string | null;
  fingerprintRef: string | null;
  platform: FindingPlatformView | null;
  link: { status: string; sentAt: Date | string | null; claimPending: boolean; stopped: boolean } | null;
  consentWithdrawn: boolean;
};

function toListRow(row: FindingRow, extras: ListExtras, viewerId?: string): CrawlFindingListRow {
  const needsSecondReview = row.distance > SECOND_REVIEW_DISTANCE;
  const sentAt = extras.link?.sentAt ? new Date(extras.link.sentAt).toISOString() : null;
  return {
    id: row.id,
    caseId: row.caseId,
    caseReference: extras.caseReference,
    distance: row.distance,
    quality: row.quality,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    reviewStatus: row.reviewStatus as FindingStatus,
    sourceDomain: extras.sourceDomain,
    fingerprintRef: extras.fingerprintRef,
    platform: extras.platform,
    needsSecondReview,
    secondReviewRequired: needsSecondReview,
    awaitingSecondReview: row.reviewStatus === "CANDIDATE" && needsSecondReview && row.reviewedById !== null,
    firstReviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    currentAdminGaveFirstReview: Boolean(viewerId) && row.reviewedById === viewerId,
    urlsPurged: row.pageUrlEncrypted === "",
    linkStatus: extras.link?.status ?? null,
    representativeNoticeSentAt: sentAt,
    noticeAttemptUnconfirmed: Boolean(extras.link?.claimPending) && !sentAt,
    // A sent notice is never undone by a withdrawal.
    crawlConsentWithdrawn: !sentAt && (Boolean(extras.link?.stopped) || extras.consentWithdrawn),
  };
}

function platformView(
  platform: { name: string; noticeBasis: string; grievanceEmail: string | null; lastContactVerifiedByHuman: boolean } | null | undefined,
): FindingPlatformView | null {
  if (!platform) return null;
  const hasEmail = Boolean(platform.grievanceEmail) && platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED;
  const formOnly = platform.noticeBasis === "FORM_ONLY" || !hasEmail;
  return { name: platform.name, formOnly, contactVerified: platform.lastContactVerifiedByHuman && !formOnly };
}

/** Whether the authorisation a finding was matched under is no longer live. */
function consentGone(
  finding: { caseId: string; crawlConsentId: string | null },
  consents: Array<{ id: string; caseId: string; withdrawnAt: Date | null }>,
) {
  if (finding.crawlConsentId) return !consents.some((c) => c.id === finding.crawlConsentId && !c.withdrawnAt);
  return !consents.some((c) => c.caseId === finding.caseId && !c.withdrawnAt);
}

export type ListFindingsFilter = { status?: FindingStatus; caseId?: string; id?: string; limit?: number };

/**
 * The review list. Never carries a URL (encrypted or not), a PDQ value or
 * another admin's identity. viewerId is the admin asking, for
 * currentAdminGaveFirstReview.
 */
export async function listCrawlFindings(filter: ListFindingsFilter = {}, viewerId?: string): Promise<CrawlFindingListRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const keep = (f: { id: string; caseId: string; reviewStatus: string }) =>
    (!filter.status || f.reviewStatus === filter.status) && (!filter.caseId || f.caseId === filter.caseId) && (!filter.id || f.id === filter.id);

  if (isDevNoDb()) {
    const memory = crawlMemory();
    return [...memory.findings.values()]
      .filter(keep)
      .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime())
      .slice(0, limit)
      .map((f) => {
        const record = store.cases.get(f.caseId);
        const link = record?.urls.find((url) => url.crawlFindingId === f.id && url.source === "CRAWLER");
        const sourceDomain = memory.sources.get(f.sourceId)?.domain ?? null;
        const directory = findPlatformByDomain(link?.domain ?? sourceDomain ?? "");
        const fingerprint = memory.fingerprints.get(f.hashSubmissionId);
        let fingerprintRef: string | null = null;
        try {
          fingerprintRef = fingerprint ? sha256(decryptField(fingerprint.hashEncrypted).trim().toLowerCase()).slice(0, 16) : null;
        } catch {
          fingerprintRef = null;
        }
        return toListRow(f, {
          caseReference: record?.referenceNumber ?? null,
          sourceDomain,
          fingerprintRef,
          platform: platformView(directory ?? null),
          // Nothing is ever sent from the memory store.
          link: link ? { status: link.status, sentAt: null, claimPending: false, stopped: Boolean(link.crawlConsentWithdrawnAt) } : null,
          consentWithdrawn: consentGone(f, memory.consents),
        }, viewerId);
      });
  }

  const { db } = await import("@/lib/db");
  const platformSelect = { name: true, noticeBasis: true, grievanceEmail: true, lastContactVerifiedByHuman: true } as const;
  const rows = await db.crawlFinding.findMany({
    where: {
      ...(filter.status ? { reviewStatus: filter.status } : {}),
      ...(filter.caseId ? { caseId: filter.caseId } : {}),
      ...(filter.id ? { id: filter.id } : {}),
    },
    include: {
      case: { select: { referenceNumber: true } },
      source: { select: { domain: true } },
      hashSubmission: { select: { hashDigest: true } },
      submittedUrl: {
        select: {
          status: true,
          source: true,
          crawlConsentWithdrawnAt: true,
          // Only whether a claim exists: the stored PDF never leaves the database here.
          representativeNoticeDigest: true,
          platform: { select: platformSelect },
          notices: { select: { sentAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { firstSeenAt: "asc" },
    take: limit,
  });
  const caseIds = [...new Set(rows.map((row) => row.caseId))];
  const consents = caseIds.length
    ? await db.crawlConsent.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true, withdrawnAt: true } })
    : [];
  // Before approval there is no link: show the platform the source site belongs to.
  const domains = [...new Set(rows.filter((row) => !row.submittedUrl).map((row) => row.source.domain))];
  const sitePlatforms = new Map<string, FindingPlatformView | null>();
  for (const domain of domains) {
    const platform = await db.platform.findFirst({
      where: { OR: [{ domainPatterns: { has: domain } }, { domainPatterns: { has: domain.replace(/^www\./, "") } }] },
      select: platformSelect,
    });
    sitePlatforms.set(domain, platformView(platform));
  }
  return rows.map((row) => {
    const url = row.submittedUrl && row.submittedUrl.source === "CRAWLER" ? row.submittedUrl : null;
    return toListRow(row, {
      caseReference: row.case.referenceNumber,
      sourceDomain: row.source.domain,
      fingerprintRef: row.hashSubmission?.hashDigest ? row.hashSubmission.hashDigest.slice(0, 16) : null,
      platform: url ? platformView(url.platform) : sitePlatforms.get(row.source.domain) ?? null,
      link: url
        ? {
            status: url.status,
            sentAt: url.notices[0]?.sentAt ?? null,
            claimPending: url.representativeNoticeDigest !== null,
            stopped: url.crawlConsentWithdrawnAt !== null,
          }
        : null,
      consentWithdrawn: consentGone(row, consents),
    }, viewerId);
  });
}

/** One finding, address-free, for the detail page. */
export async function getCrawlFindingSummary(id: string, viewerId?: string): Promise<CrawlFindingListRow | null> {
  return (await listCrawlFindings({ id, limit: 1 }, viewerId))[0] ?? null;
}

/** The encrypted URLs of one finding, for the audited reveal route only. */
export async function getFindingUrlsForReveal(id: string): Promise<{ id: string; pageUrlEncrypted: string; imageUrlEncrypted: string; firstSeenAt: Date } | null> {
  if (isDevNoDb()) {
    const f = crawlMemory().findings.get(id);
    return f ? { id: f.id, pageUrlEncrypted: f.pageUrlEncrypted, imageUrlEncrypted: f.imageUrlEncrypted, firstSeenAt: f.firstSeenAt } : null;
  }
  const { db } = await import("@/lib/db");
  return db.crawlFinding.findUnique({ where: { id }, select: { id: true, pageUrlEncrypted: true, imageUrlEncrypted: true, firstSeenAt: true } });
}

/** Past retention even if the hourly purge has not blanked it yet. */
export function findingUrlsExpired(finding: { pageUrlEncrypted: string; firstSeenAt: Date }, now = new Date()) {
  return !finding.pageUrlEncrypted || isUrlExpired(finding.firstSeenAt, now);
}

export type ReviewDecision = "approve" | "dismiss";
export type ReviewOutcome =
  | { ok: true; status: "APPROVED"; submittedUrlId: string; createdUrl: boolean }
  | { ok: true; status: "AWAITING_SECOND_REVIEW" }
  | { ok: true; status: "DISMISSED" }
  | {
      ok: false;
      error:
        | "finding_not_found"
        | "already_reviewed"
        | "second_reviewer_required"
        | "consent_withdrawn"
        | "finding_expired"
        | "invalid_url"
        | "case_not_found";
    };

type ReviewState = { reviewStatus: string; reviewedById: string | null };

/** Decides what a review does, without touching storage. */
export function planReview(
  finding: { distance: number } & ReviewState,
  decision: ReviewDecision,
  reviewerId: string,
): { action: "dismiss" | "first_approval" | "final_approval"; second: boolean } | { error: "already_reviewed" | "second_reviewer_required" } {
  if (finding.reviewStatus !== "CANDIDATE") return { error: "already_reviewed" };
  const firstDone = finding.reviewedById !== null;
  if (firstDone && finding.reviewedById === reviewerId) return { error: "second_reviewer_required" };
  if (decision === "dismiss") return { action: "dismiss", second: firstDone };
  if (finding.distance > SECOND_REVIEW_DISTANCE && !firstDone) return { action: "first_approval", second: false };
  return { action: "final_approval", second: firstDone };
}

function crawlerUrlStatus(parsed: Extract<ReturnType<typeof parseSubmittedUrl>, { ok: true }>) {
  // Same rule as survivor links (case-ops addUrlsToCase): a known platform
  // queues a notice, anything else waits for human review.
  return parsed.platform ? ("NOTICE_QUEUED" as const) : ("PENDING_REVIEW" as const);
}

export async function reviewCrawlFinding(input: { findingId: string; decision: ReviewDecision; reviewerId: string; now?: Date }): Promise<ReviewOutcome> {
  const now = input.now ?? new Date();
  if (isDevNoDb()) return reviewInMemory(input.findingId, input.decision, input.reviewerId, now);

  const { db } = await import("@/lib/db");
  const finding = await db.crawlFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return { ok: false, error: "finding_not_found" };
  const plan = planReview(finding, input.decision, input.reviewerId);
  if ("error" in plan) return { ok: false, error: plan.error };
  // Every write below is conditional on the state just read, so two analysts
  // acting at once cannot both succeed.
  const unchanged = { id: finding.id, reviewStatus: "CANDIDATE" as const, reviewedById: finding.reviewedById };
  const reviewerFields = plan.second
    ? { secondReviewedById: input.reviewerId, secondReviewedAt: now }
    : { reviewedById: input.reviewerId, reviewedAt: now };

  if (plan.action === "dismiss") {
    const updated = await db.crawlFinding.updateMany({ where: unchanged, data: { reviewStatus: "DISMISSED", ...reviewerFields } });
    if (updated.count === 0) return { ok: false, error: "already_reviewed" };
    await auditReview("CRAWL_FINDING_DISMISSED", finding, input.reviewerId, { second: plan.second });
    return { ok: true, status: "DISMISSED" };
  }
  if (plan.action === "first_approval") {
    const updated = await db.crawlFinding.updateMany({ where: unchanged, data: reviewerFields });
    if (updated.count === 0) return { ok: false, error: "already_reviewed" };
    await auditReview("CRAWL_FINDING_APPROVED", finding, input.reviewerId, { stage: "first_of_two" });
    return { ok: true, status: "AWAITING_SECOND_REVIEW" };
  }

  if (!(await findingStillConsented(finding))) return { ok: false, error: "consent_withdrawn" };
  if (findingUrlsExpired(finding, now)) return { ok: false, error: "finding_expired" };
  const parsed = parseSubmittedUrl(decryptField(finding.pageUrlEncrypted));
  if (!parsed.ok) return { ok: false, error: "invalid_url" };
  const dbPlatform = parsed.platform
    ? await db.platform.findFirst({
        where: { OR: [{ domainPatterns: { has: parsed.domain } }, { domainPatterns: { has: `www.${parsed.domain}` } }] },
        select: { id: true },
      })
    : null;

  const outcome = await db.$transaction(async (tx) => {
    const claimed = await tx.crawlFinding.updateMany({ where: unchanged, data: { reviewStatus: "APPROVED", ...reviewerFields } });
    if (claimed.count === 0) return null;
    // The survivor may already have reported the same link herself, or an
    // earlier finding may have added it. A crawler link a withdrawal stopped
    // is never reused: it stays stopped, and this finding gets its own link.
    const existing = await tx.submittedUrl.findFirst({
      where: { caseId: finding.caseId, urlHash: parsed.urlHash, crawlConsentWithdrawnAt: null },
      select: { id: true },
    });
    if (existing) return { submittedUrlId: existing.id, createdUrl: false };
    const created = await tx.submittedUrl.create({
      data: {
        caseId: finding.caseId,
        urlEncrypted: encryptField(parsed.normalizedUrl),
        urlHash: parsed.urlHash,
        domain: parsed.domain,
        platformId: dbPlatform?.id ?? null,
        status: crawlerUrlStatus(parsed),
        source: "CRAWLER",
        crawlFindingId: finding.id,
      },
      select: { id: true },
    });
    return { submittedUrlId: created.id, createdUrl: true };
  });
  if (!outcome) return { ok: false, error: "already_reviewed" };
  await auditReview("CRAWL_FINDING_APPROVED", finding, input.reviewerId, { stage: "final", second: plan.second, submittedUrlId: outcome.submittedUrlId, createdUrl: outcome.createdUrl });
  return { ok: true, status: "APPROVED", ...outcome };
}

async function reviewInMemory(findingId: string, decision: ReviewDecision, reviewerId: string, now: Date): Promise<ReviewOutcome> {
  const finding = crawlMemory().findings.get(findingId);
  if (!finding) return { ok: false, error: "finding_not_found" };
  const plan = planReview(finding, decision, reviewerId);
  if ("error" in plan) return { ok: false, error: plan.error };
  const stamp = () => {
    if (plan.second) Object.assign(finding, { secondReviewedById: reviewerId, secondReviewedAt: now });
    else Object.assign(finding, { reviewedById: reviewerId, reviewedAt: now });
  };
  if (plan.action === "dismiss") {
    stamp();
    finding.reviewStatus = "DISMISSED";
    await auditReview("CRAWL_FINDING_DISMISSED", finding, reviewerId, { second: plan.second });
    return { ok: true, status: "DISMISSED" };
  }
  if (plan.action === "first_approval") {
    stamp();
    await auditReview("CRAWL_FINDING_APPROVED", finding, reviewerId, { stage: "first_of_two" });
    return { ok: true, status: "AWAITING_SECOND_REVIEW" };
  }
  if (!(await findingStillConsented(finding))) return { ok: false, error: "consent_withdrawn" };
  if (findingUrlsExpired(finding, now)) return { ok: false, error: "finding_expired" };
  const parsed = parseSubmittedUrl(decryptField(finding.pageUrlEncrypted));
  if (!parsed.ok) return { ok: false, error: "invalid_url" };
  const record = store.cases.get(finding.caseId);
  if (!record) return { ok: false, error: "case_not_found" };
  stamp();
  finding.reviewStatus = "APPROVED";
  const existing = record.urls.find((url) => url.urlHash === parsed.urlHash && !url.crawlConsentWithdrawnAt);
  let submittedUrlId = existing?.id;
  if (!existing) {
    submittedUrlId = randomUUID();
    record.urls.push({
      id: submittedUrlId,
      domain: parsed.domain,
      platformName: parsed.platform?.name || "Unknown - will be reviewed",
      status: crawlerUrlStatus(parsed),
      urlHash: parsed.urlHash,
      platformId: null,
      flaggedForReview: false,
      source: "CRAWLER",
      crawlFindingId: finding.id,
    });
  }
  await auditReview("CRAWL_FINDING_APPROVED", finding, reviewerId, { stage: "final", second: plan.second, submittedUrlId, createdUrl: !existing });
  return { ok: true, status: "APPROVED", submittedUrlId: submittedUrlId!, createdUrl: !existing };
}

async function auditReview(
  eventType: "CRAWL_FINDING_APPROVED" | "CRAWL_FINDING_DISMISSED",
  finding: { id: string; caseId: string; distance: number },
  reviewerId: string,
  extra: Record<string, unknown>,
) {
  await writeAuditLog({
    eventType,
    entityType: "CrawlFinding",
    entityId: finding.id,
    actorId: reviewerId,
    data: { caseId: finding.caseId, distance: finding.distance, ...extra },
  });
}
