import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { crawlMemory, type MemoryCrawlFinding } from "@/lib/crawl-store";
import { consentCoversFinding, findingStillConsented, resolvePoolFingerprint, CRAWL_MATCH_THRESHOLD } from "@/lib/crawl-pool";
import { enabledCrawlSourceDomain, ensureCrawlSourceForReportedHost } from "@/lib/crawl-sources";
import { promoteDiscoveredSource } from "@/lib/crawl-discoveries";
import { decryptField, encryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { lockCaseForLinkWrite } from "@/lib/case-link-lock";
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
 * - Labels (review labels WP37): analysts can mark a finding "Looks AI-made",
 *   "Sexual content" or "Possible minor", our own simple fields with who set
 *   them and when, audited like a review. The possible-minor label is a
 *   safety switch: while it is set the finding cannot be approved or
 *   dismissed, no representative notice can be sent, and it is out of the
 *   adult queue (reviewStatus MINOR_PROTOCOL). Clearing it needs a second,
 *   different admin and a recorded reason, and only then does the finding
 *   return to the review state it came from. No minors handling for crawler
 *   findings exists yet beyond this state; the written POCSO procedure is
 *   still pending (ADR 006, go-live gate 3).
 */

export const MAX_FINDINGS_PER_BATCH = 50;
export const SECOND_REVIEW_DISTANCE = 20;
const MAX_URL_LENGTH = 2048;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// Media-like payloads never get past the schema: only an explicit http(s)
// URL of bounded length with no whitespace, and nothing base64-shaped.
// Exported so the embeddings route (ADR 008, WP28) validates addresses with
// exactly the same rules.
export const crawlUrlSchema = z
  .string()
  .min(10)
  .max(MAX_URL_LENGTH)
  .regex(/^https?:\/\/[^\s]+$/i)
  .refine((value) => !/;base64,|^data:|[\x00-\x1F\x7F]/i.test(value), { message: "media_payload_rejected" });

export const crawlFindingSchema = z
  .object({
    fingerprintId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
    pageUrl: crawlUrlSchema,
    imageUrl: crawlUrlSchema,
    // Absent only on an SSCD finding (ADR 008, WP28): the second layer
    // matches by descriptor similarity and has no PDQ Hamming distance.
    distance: z.number().int().min(0).max(CRAWL_MATCH_THRESHOLD).optional(),
    quality: z.number().int().min(0).max(100),
    observedAt: z.iso.datetime({ offset: true }),
    sourceId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    // Which layer matched (ADR 008): absent means the old contract — a
    // hash-distance finding, labelled from the fingerprint's algorithm.
    method: z.enum(["pdq", "vpdq", "sscd"]).optional(),
    // The SSCD similarity: required on an SSCD finding; on a labelled pdq
    // finding it is the borderline score the crawler computed against that
    // fingerprint's own embeddings (information for the analyst, never an
    // automatic accept or reject); a vpdq finding never carries one.
    sscdSimilarity: z.number().min(0).max(1).optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.method === "sscd") {
      if (item.distance !== undefined) {
        ctx.addIssue({ code: "custom", message: "sscd_finding_has_no_distance", path: ["distance"] });
      }
      if (item.sscdSimilarity === undefined) {
        ctx.addIssue({ code: "custom", message: "sscd_similarity_required", path: ["sscdSimilarity"] });
      }
      return;
    }
    // PDQ, VPDQ and the unlabelled old contract all match by hash distance.
    if (item.distance === undefined) {
      ctx.addIssue({ code: "custom", message: "distance_required", path: ["distance"] });
    }
    // Borderline scores attach to pdq findings only: the second layer never
    // samples videos, and an old crawler cannot send a score it never
    // computed (the field did not exist for it).
    if (item.sscdSimilarity !== undefined && item.method !== "pdq") {
      ctx.addIssue({ code: "custom", message: "sscd_similarity_not_allowed", path: ["sscdSimilarity"] });
    }
  });

// The envelope is checked whole (400 when wrong); each finding is checked on
// its own, so one malformed item is "rejected" without losing the others.
export const crawlFindingsBodySchema = z
  .object({
    runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
    findings: z.array(z.unknown()).min(1).max(MAX_FINDINGS_PER_BATCH),
  })
  .strict();

export type CrawlFindingsBody = z.infer<typeof crawlFindingsBodySchema>;
/** "accepted" covers new and merged findings alike (see recordCrawlFindings). */
export type CrawlFindingResult = { status: "accepted" | "rejected"; reason?: string };

// One reason for every fingerprint refusal, so the crawler cannot tell an
// unknown id from a withdrawn or unapproved one.
const FINGERPRINT_REFUSED = "fingerprint_not_accepted";

/**
 * The dedup digest of one sighting, exported so the embeddings route (ADR 008,
 * WP28) recomputes it exactly as recordCrawlFindings does — the embedding is
 * keyed to the very finding the crawler reported.
 */
export function findingDigest(caseId: string, consentId: string, pageUrl: string, imageUrl: string) {
  return sha256(`crawl-finding\u0000${caseId}\u0000${consentId}\u0000${pageUrl}\u0000${imageUrl}`);
}

type NewFinding = {
  caseId: string;
  hashSubmissionId: string;
  crawlConsentId: string;
  pageUrl: string;
  imageUrl: string;
  urlDigest: string;
  /** Null for an SSCD finding: the second layer has no PDQ distance (ADR 008). */
  distance: number | null;
  /** The borderline SSCD score on a labelled pdq finding, else null. */
  sscdSimilarity: number | null;
  quality: number;
  sourceId: string;
  runId: string;
  /** Which layer matched: PDQ, VPDQ (derived from the submission) or SSCD. */
  method: "PDQ" | "VPDQ" | "SSCD";
};

// While nobody has reviewed the finding (CANDIDATE, no first reviewer), a
// closer sighting replaces the stored match. Closer means: a sighting with a
// PDQ distance beats one without (an SSCD match has none), and between two
// distances the lower wins. Once an analyst approved the finding (even the
// first of two), the fingerprint the analysts confirmed is the one a
// representative notice names (src/lib/crawl-notice.ts).
const CANDIDATE_UNREVIEWED = sql`"CrawlFinding"."reviewStatus" = 'CANDIDATE' AND "CrawlFinding"."reviewedById" IS NULL`;
const CLOSER_WHILE_CANDIDATE = sql`${CANDIDATE_UNREVIEWED} AND (("CrawlFinding"."distance" IS NULL AND excluded."distance" IS NOT NULL) OR ("CrawlFinding"."distance" IS NOT NULL AND excluded."distance" IS NOT NULL AND excluded."distance" < "CrawlFinding"."distance"))`;

/**
 * Inserts or merges one finding, only while the authorisation it was matched
 * under is still live. Returns null when it is not.
 *
 * On the database paths the live authorisation row is locked (FOR SHARE) in
 * the same transaction as the write, so a withdrawal either commits first
 * (and this report is refused) or waits for this write and then deletes the
 * candidate it created. Memory path: single-threaded, no race.
 */
async function upsertFinding(input: NewFinding, now: Date): Promise<{ id: string; created: boolean } | null> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if (!memory.consents.some((c) => c.id === input.crawlConsentId && !c.withdrawnAt)) return null;
    const existing = [...memory.findings.values()].find((f) => f.caseId === input.caseId && f.urlDigest === input.urlDigest);
    if (existing) {
      existing.lastSeenAt = now;
      const mergeable = existing.reviewStatus === "CANDIDATE" && existing.reviewedById === null;
      // A closer sighting replaces the stored match while CANDIDATE and
      // unreviewed; a sighting with a distance beats one without (an SSCD
      // match has none), and the lower of two distances wins (WP28).
      const replaces =
        mergeable &&
        ((existing.distance === null && input.distance !== null) ||
          (existing.distance !== null && input.distance !== null && input.distance < existing.distance));
      const oldSimilarity = existing.sscdSimilarity;
      if (replaces) {
        Object.assign(existing, {
          distance: input.distance, quality: input.quality, hashSubmissionId: input.hashSubmissionId,
          sourceId: input.sourceId, runId: input.runId, method: input.method, sscdSimilarity: input.sscdSimilarity,
        });
      }
      // A carried SSCD score never lowers the stored one while the finding is
      // still open: the best score the crawler saw is the one the analyst sees
      // (the same GREATEST as the Kysely statement above).
      if (mergeable && input.sscdSimilarity !== null) {
        existing.sscdSimilarity = Math.max(oldSimilarity ?? input.sscdSimilarity, input.sscdSimilarity);
      }
      return { id: existing.id, created: false };
    }
    const row: MemoryCrawlFinding = {
      id: randomUUID(), caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
      pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
      urlDigest: input.urlDigest, distance: input.distance, sscdSimilarity: input.sscdSimilarity,
      quality: input.quality, firstSeenAt: now, lastSeenAt: now,
      sourceId: input.sourceId, runId: input.runId, reviewStatus: "CANDIDATE", method: input.method,
      reviewedById: null, reviewedAt: null, secondReviewedById: null, secondReviewedAt: null,
      labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
      labelSexual: false, labelSexualById: null, labelSexualAt: null,
      labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
      labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
      minorProtocolBefore: null,
    };
    memory.findings.set(row.id, row);
    return { id: row.id, created: true };
  }

  if (usesWorkerKysely()) {
    return getWorkerDb().transaction().execute(async (trx) => {
      const live = await trx.selectFrom("CrawlConsent").select("id")
        .where("id", "=", input.crawlConsentId).where("withdrawnAt", "is", null)
        .forShare().executeTakeFirst();
      if (!live) return null;
      // One statement, so concurrent reports of the same copy cannot race.
      // A carried SSCD score never lowers the stored one while the finding
      // is still open (GREATEST ignores NULLs, like Math.max below); a
      // replacing sighting carries its own score, or none.
      const row = await trx.insertInto("CrawlFinding").values({
        id: randomUUID(), caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
        pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
        urlDigest: input.urlDigest, distance: input.distance, sscdSimilarity: input.sscdSimilarity,
        quality: input.quality, method: input.method,
        firstSeenAt: now, lastSeenAt: now, sourceId: input.sourceId, runId: input.runId,
      }).onConflict((oc) => oc.columns(["caseId", "urlDigest"]).doUpdateSet({
        lastSeenAt: now,
        hashSubmissionId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."hashSubmissionId" ELSE "CrawlFinding"."hashSubmissionId" END`,
        quality: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."quality" ELSE "CrawlFinding"."quality" END`,
        sourceId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."sourceId" ELSE "CrawlFinding"."sourceId" END`,
        runId: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."runId" ELSE "CrawlFinding"."runId" END`,
        method: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."method" ELSE "CrawlFinding"."method" END`,
        distance: sql`CASE WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."distance" ELSE "CrawlFinding"."distance" END`,
        sscdSimilarity: sql`CASE WHEN ${CANDIDATE_UNREVIEWED} AND excluded."sscdSimilarity" IS NOT NULL THEN GREATEST("CrawlFinding"."sscdSimilarity", excluded."sscdSimilarity") WHEN ${CLOSER_WHILE_CANDIDATE} THEN excluded."sscdSimilarity" ELSE "CrawlFinding"."sscdSimilarity" END`,
      })).returning(["id", sql<boolean>`(xmax = 0)`.as("inserted")]).executeTakeFirstOrThrow();
      return { id: row.id, created: Boolean(row.inserted) };
    });
  }

  const { db } = await import("@/lib/db");
  const where = { caseId_urlDigest: { caseId: input.caseId, urlDigest: input.urlDigest } };
  const attempt = () => db.$transaction(async (tx) => {
    const live = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CrawlConsent" WHERE "id" = ${input.crawlConsentId} AND "withdrawnAt" IS NULL FOR SHARE`;
    if (live.length === 0) return null;
    const existing = await tx.crawlFinding.findUnique({ where, select: { id: true, distance: true, sscdSimilarity: true, reviewStatus: true, reviewedById: true } });
    if (existing) {
      const mergeable = existing.reviewStatus === "CANDIDATE" && existing.reviewedById === null;
      // The Kysely twin's rules, read above: a closer sighting (a distance
      // beats none, the lower of two wins) replaces the stored match; a
      // carried SSCD score never lowers the stored one (WP28).
      const replaces =
        mergeable &&
        ((existing.distance === null && input.distance !== null) ||
          (existing.distance !== null && input.distance !== null && input.distance < existing.distance));
      await tx.crawlFinding.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          ...(replaces
            ? {
                distance: input.distance, quality: input.quality, hashSubmissionId: input.hashSubmissionId,
                sourceId: input.sourceId, runId: input.runId, method: input.method, sscdSimilarity: input.sscdSimilarity,
              }
            : {}),
          ...(mergeable && input.sscdSimilarity !== null
            ? { sscdSimilarity: Math.max(existing.sscdSimilarity ?? input.sscdSimilarity, input.sscdSimilarity) }
            : {}),
        },
      });
      return { id: existing.id, created: false };
    }
    const created = await tx.crawlFinding.create({
      data: {
        caseId: input.caseId, hashSubmissionId: input.hashSubmissionId, crawlConsentId: input.crawlConsentId,
        pageUrlEncrypted: encryptField(input.pageUrl), imageUrlEncrypted: encryptField(input.imageUrl),
        urlDigest: input.urlDigest, distance: input.distance, sscdSimilarity: input.sscdSimilarity,
        quality: input.quality, method: input.method,
        firstSeenAt: now, lastSeenAt: now, sourceId: input.sourceId, runId: input.runId,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  });
  try {
    return await attempt();
  } catch (err) {
    // Another request recorded the same copy first; the retry merges into it.
    if ((err as { code?: string }).code === "P2002") return attempt();
    throw err;
  }
}

/** Whether a page address is on the source's host or one of its subdomains. */
/**
 * The crawler never fetches an address with credentials or a non-default port
 * (crawler/src/net: url_credentials, blocked_port), so a report carrying one
 * is malformed or forged. Refused, so such an address never reaches a case or
 * a notice.
 */
export function crawlerShapedUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.username === "" && url.password === "" && url.port === "";
  } catch {
    return false;
  }
}

export function pageOnSourceHost(pageUrl: string, sourceDomain: string) {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  const domain = sourceDomain.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Records a validated batch. Results are index-aligned with the input. The
 * clock is the server's: observedAt is accepted for the crawler's own
 * records but never drives retention.
 *
 * A stored finding is "accepted" whether it is new or merged into an
 * earlier one, so the crawler cannot tell whether two pool ids belong to one
 * case. A page must be on its source's host (or a subdomain); the image may
 * be on another public host (a CDN) but passes the same link checks.
 */
export async function recordCrawlFindings(
  body: CrawlFindingsBody,
  keyId: string,
  now = new Date(),
): Promise<{ results: CrawlFindingResult[]; mediaRejected: boolean }> {
  const fingerprints = new Map<string, Awaited<ReturnType<typeof resolvePoolFingerprint>>>();
  const sources = new Map<string, string | null>();
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
    if (!page.ok || !image.ok || !crawlerShapedUrl(item.pageUrl) || !crawlerShapedUrl(item.imageUrl)) {
      results.push({ status: "rejected", reason: "invalid_url" });
      continue;
    }
    if (!sources.has(item.sourceId)) sources.set(item.sourceId, await enabledCrawlSourceDomain(item.sourceId));
    const sourceDomain = sources.get(item.sourceId);
    if (!sourceDomain) {
      results.push({ status: "rejected", reason: "unknown_source" });
      continue;
    }
    if (!pageOnSourceHost(page.normalizedUrl, sourceDomain)) {
      results.push({ status: "rejected", reason: "page_not_in_source" });
      continue;
    }
    if (!fingerprints.has(item.fingerprintId)) fingerprints.set(item.fingerprintId, await resolvePoolFingerprint(item.fingerprintId));
    const fingerprint = fingerprints.get(item.fingerprintId);
    if (!fingerprint) {
      results.push({ status: "rejected", reason: FINGERPRINT_REFUSED });
      continue;
    }

    // The stored method (ADR 008, WP28): an SSCD finding says so; anything
    // else is labelled from the matched fingerprint's algorithm, so a video
    // finding reported without a method (old crawler, SSCD off) is still
    // VPDQ and a borderline pdq finding stays PDQ.
    const stored = await upsertFinding({
      caseId: fingerprint.caseId,
      hashSubmissionId: fingerprint.hashSubmissionId,
      crawlConsentId: fingerprint.consentId,
      pageUrl: page.normalizedUrl,
      imageUrl: image.normalizedUrl,
      urlDigest: findingDigest(fingerprint.caseId, fingerprint.consentId, page.normalizedUrl, image.normalizedUrl),
      distance: item.distance ?? null,
      sscdSimilarity: item.sscdSimilarity ?? null,
      quality: item.quality,
      sourceId: item.sourceId,
      runId: body.runId,
      method: item.method === "sscd" ? "SSCD" : fingerprint.algorithm === "VPDQ" ? "VPDQ" : "PDQ",
    }, now);
    if (!stored) {
      // The authorisation was withdrawn after the pool id was resolved.
      fingerprints.set(item.fingerprintId, null);
      results.push({ status: "rejected", reason: FINGERPRINT_REFUSED });
      continue;
    }
    // A match under a discovered site promotes it (full-crawler spec WP5):
    // hops to 0 and the reported-source budget. Never allowed to lose or
    // fail the finding it proves.
    try {
      await promoteDiscoveredSource(item.sourceId, keyId);
    } catch {
      console.error("crawl_source_promotion_failed");
    }
    if (stored.created) {
      // Never the URLs or the fingerprint.
      await writeAuditLog({
        eventType: "CRAWL_FINDING_RECORDED",
        entityType: "CrawlFinding",
        entityId: stored.id,
        actorId: `crawler:${keyId}`,
        data: { caseId: fingerprint.caseId, distance: item.distance, sourceId: item.sourceId, runId: body.runId },
      });
    }
    results.push({ status: "accepted" });
  }
  return { results, mediaRejected };
}

// ---------------------------------------------------------------------------
// Analyst review

export const FINDING_STATUSES = ["CANDIDATE", "APPROVED", "DISMISSED", "MINOR_PROTOCOL"] as const;
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
  /** Null for an SSCD finding: the second layer has no PDQ distance (ADR 008). */
  distance: number | null;
  /** Which layer matched: PDQ, VPDQ (derived from the submission) or SSCD. */
  method: "PDQ" | "VPDQ" | "SSCD";
  /**
   * The SSCD similarity on an SSCD finding, or the borderline score the
   * crawler computed for a PDQ match (ADR 008). Information for the
   * analyst, never an automatic accept or reject; null when absent.
   */
  sscdSimilarity: number | null;
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
  /** Same as needsSecondReview: an SSCD finding, or distance above SECOND_REVIEW_DISTANCE. */
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
  /** Analyst labels (review labels WP37): set or not, and when; never who. */
  labels: {
    aiMade: { set: boolean; setAt: string | null };
    sexual: { set: boolean; setAt: string | null };
    possibleMinor: { set: boolean; setAt: string | null; clearedAt: string | null; clearReason: string | null };
  };
  /** The admin asking set the possible-minor label, so another admin must clear it. Never says who else did. */
  currentAdminSetMinorLabel: boolean;
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
  // An SSCD finding has no PDQ distance, so it is always among the
  // least-certain matches: a new layer starts strict (ADR 008, WP28).
  const needsSecondReview = row.distance === null || row.distance > SECOND_REVIEW_DISTANCE;
  const sentAt = extras.link?.sentAt ? new Date(extras.link.sentAt).toISOString() : null;
  return {
    id: row.id,
    caseId: row.caseId,
    caseReference: extras.caseReference,
    distance: row.distance,
    method: row.method,
    sscdSimilarity: row.sscdSimilarity,
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
    labels: {
      aiMade: { set: Boolean(row.labelAiMade), setAt: row.labelAiMadeAt ? new Date(row.labelAiMadeAt).toISOString() : null },
      sexual: { set: Boolean(row.labelSexual), setAt: row.labelSexualAt ? new Date(row.labelSexualAt).toISOString() : null },
      possibleMinor: {
        set: Boolean(row.labelPossibleMinor),
        setAt: row.labelPossibleMinorAt ? new Date(row.labelPossibleMinorAt).toISOString() : null,
        clearedAt: row.labelPossibleMinorClearedAt ? new Date(row.labelPossibleMinorClearedAt).toISOString() : null,
        clearReason: row.labelPossibleMinorClearReason ?? null,
      },
    },
    currentAdminSetMinorLabel: Boolean(viewerId) && row.labelPossibleMinorById === viewerId,
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

export type ListFindingsFilter = { status?: FindingStatus; caseId?: string; id?: string; label?: FindingLabel; limit?: number };

/**
 * The review list. Never carries a URL (encrypted or not), a PDQ value or
 * another admin's identity. viewerId is the admin asking, for
 * currentAdminGaveFirstReview and currentAdminSetMinorLabel.
 */
export async function listCrawlFindings(filter: ListFindingsFilter = {}, viewerId?: string): Promise<CrawlFindingListRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const labelFlag = filter.label ? LABEL_COLUMNS[filter.label].flag : null;
  const keep = (f: { id: string; caseId: string; reviewStatus: string } & Record<string, unknown>) =>
    (!filter.status || f.reviewStatus === filter.status) && (!filter.caseId || f.caseId === filter.caseId) && (!filter.id || f.id === filter.id)
    && (!labelFlag || f[labelFlag] === true);

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
      ...(labelFlag ? { [labelFlag]: true } : {}),
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
        | "case_not_found"
        | "minor_protocol_active";
    };

type ReviewState = { reviewStatus: string; reviewedById: string | null; labelPossibleMinor?: boolean | null };

/**
 * Decides what a review does, without touching storage. While the
 * possible-minor label is set (review labels WP37) no adult-flow action
 * applies at all: the finding sits in the minors protocol state and only a
 * second admin clearing the label can bring it back. A null distance (an
 * SSCD finding, ADR 008) means the two-step approval path, like a distance
 * above the threshold: a new layer starts strict.
 */
export function planReview(
  finding: { distance: number | null } & ReviewState,
  decision: ReviewDecision,
  reviewerId: string,
): { action: "dismiss" | "first_approval" | "final_approval"; second: boolean } | { error: "already_reviewed" | "second_reviewer_required" | "minor_protocol_active" } {
  if (finding.labelPossibleMinor) return { error: "minor_protocol_active" };
  if (finding.reviewStatus !== "CANDIDATE") return { error: "already_reviewed" };
  const firstDone = finding.reviewedById !== null;
  if (firstDone && finding.reviewedById === reviewerId) return { error: "second_reviewer_required" };
  if (decision === "dismiss") return { action: "dismiss", second: firstDone };
  if ((finding.distance === null || finding.distance > SECOND_REVIEW_DISTANCE) && !firstDone) return { action: "first_approval", second: false };
  return { action: "final_approval", second: firstDone };
}

function crawlerUrlStatus(parsed: Extract<ReturnType<typeof parseSubmittedUrl>, { ok: true }>) {
  // Same rule as survivor links (case-ops addUrlsToCase): a known platform
  // queues a notice, anything else waits for human review.
  return parsed.platform ? ("NOTICE_QUEUED" as const) : ("PENDING_REVIEW" as const);
}

/**
 * An analyst approved a finding, so the host its page lives on is proven
 * relevant: it must stay on the source list as a REPORTED site
 * (full-crawler spec WP1). Idempotent, and never allowed to fail the
 * approval, which is already committed when this runs.
 */
async function ensureSourceForApprovedFinding(host: string) {
  try {
    await ensureCrawlSourceForReportedHost(host);
  } catch {
    console.error("crawl_source_reported_failed");
  }
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
    // First statement: lock the case row so her own report of the same
    // address cannot insert between the check and the insert below
    // (case-link-lock.ts, which also documents the lock order).
    if (!(await lockCaseForLinkWrite(tx, finding.caseId))) return "case_not_found" as const;
    // Checked again under a lock in this transaction: a withdrawal either
    // committed first (refused here) or waits for this approval and then
    // stops the link it creates.
    const live = await tx.$queryRaw<Array<{ id: string; hashSubmissionIds: string[]; signedAt: Date }>>`SELECT "id", "hashSubmissionIds", "signedAt" FROM "CrawlConsent" WHERE "caseId" = ${finding.caseId} AND "withdrawnAt" IS NULL FOR SHARE`;
    if (!live.some((consent) => consentCoversFinding({ ...consent, signedAt: new Date(consent.signedAt) }, finding))) return "consent_withdrawn" as const;
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
  if (outcome === "consent_withdrawn") return { ok: false, error: "consent_withdrawn" };
  if (outcome === "case_not_found") return { ok: false, error: "case_not_found" };
  if (!outcome) return { ok: false, error: "already_reviewed" };
  await auditReview("CRAWL_FINDING_APPROVED", finding, input.reviewerId, { stage: "final", second: plan.second, submittedUrlId: outcome.submittedUrlId, createdUrl: outcome.createdUrl });
  await ensureSourceForApprovedFinding(parsed.domain);
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
  await ensureSourceForApprovedFinding(parsed.domain);
  return { ok: true, status: "APPROVED", submittedUrlId: submittedUrlId!, createdUrl: !existing };
}

async function auditReview(
  eventType: "CRAWL_FINDING_APPROVED" | "CRAWL_FINDING_DISMISSED",
  finding: { id: string; caseId: string; distance: number | null },
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

// ---------------------------------------------------------------------------
// Analyst labels (review labels WP37)

/** The three labels, our own wording; not any external taxonomy. */
export const FINDING_LABELS = ["aiMade", "sexual", "possibleMinor"] as const;
export type FindingLabel = (typeof FINDING_LABELS)[number];

/** How each label is addressed in URLs and queries (findings list, API). */
export const LABEL_QUERY_KEYS: Record<FindingLabel, string> = {
  aiMade: "ai-made",
  sexual: "sexual",
  possibleMinor: "possible-minor",
};

/** The column that holds each label's flag, the same name on every backend. */
const LABEL_COLUMNS = {
  aiMade: { flag: "labelAiMade", by: "labelAiMadeById", at: "labelAiMadeAt" },
  sexual: { flag: "labelSexual", by: "labelSexualById", at: "labelSexualAt" },
  possibleMinor: { flag: "labelPossibleMinor", by: "labelPossibleMinorById", at: "labelPossibleMinorAt" },
} as const satisfies Record<FindingLabel, { flag: string; by: string; at: string }>;

/** A label filter value from a query string, or null when it is not one. */
export function findingLabelForQuery(raw: string | undefined): FindingLabel | null {
  if (!raw) return null;
  return FINDING_LABELS.find((label) => LABEL_QUERY_KEYS[label] === raw) ?? null;
}

export const CLEAR_REASON_MAX = 500;

export type LabelAction = "set" | "clear";
export type LabelErrorCode =
  | "finding_not_found"
  | "label_not_set"
  | "label_conflict"
  | "reason_required"
  | "second_admin_required";
export type LabelOutcome = { ok: true; changed: boolean } | { ok: false; error: LabelErrorCode };

/** What one label action writes; every backend stores these fields the same way. */
type LabelColumnWrite = {
  labelAiMade?: boolean;
  labelAiMadeById?: string | null;
  labelAiMadeAt?: Date | null;
  labelSexual?: boolean;
  labelSexualById?: string | null;
  labelSexualAt?: Date | null;
  labelPossibleMinor?: boolean;
  labelPossibleMinorById?: string | null;
  labelPossibleMinorAt?: Date | null;
  labelPossibleMinorClearedById?: string | null;
  labelPossibleMinorClearedAt?: Date | null;
  labelPossibleMinorClearReason?: string | null;
  minorProtocolBefore?: string | null;
  reviewStatus?: FindingStatus;
};

/** The finding state the label planner reads. */
type LabelFindingState = {
  id: string;
  caseId: string;
  reviewStatus: string;
  labelAiMade: boolean;
  labelSexual: boolean;
  labelPossibleMinor: boolean;
  labelPossibleMinorById: string | null;
  minorProtocolBefore: string | null;
};

type LabelPlan =
  | { ok: false; error: LabelErrorCode }
  | { ok: true; changed: false }
  | {
      ok: true;
      changed: true;
      write: LabelColumnWrite;
      /** The label flag column this action is conditional on, and its current value. */
      flagColumn: string;
      flagValue: boolean;
      /** The reviewStatus the plan was computed from; the write is refused if it moved (possible minor only). */
      guardStatus: string | null;
      audit: { eventType: "CRAWL_FINDING_LABEL_SET" | "CRAWL_FINDING_LABEL_CLEARED"; data: Record<string, unknown> };
    };

/** The plain label fields one action writes, without the possible-minor extras. */
function labelWriteFor(label: FindingLabel, action: LabelAction, adminId: string, now: Date): LabelColumnWrite {
  if (label === "aiMade") {
    return action === "set"
      ? { labelAiMade: true, labelAiMadeById: adminId, labelAiMadeAt: now }
      : { labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null };
  }
  if (label === "sexual") {
    return action === "set"
      ? { labelSexual: true, labelSexualById: adminId, labelSexualAt: now }
      : { labelSexual: false, labelSexualById: null, labelSexualAt: null };
  }
  return action === "set"
    ? { labelPossibleMinor: true, labelPossibleMinorById: adminId, labelPossibleMinorAt: now }
    : { labelPossibleMinor: false };
}

/** Whether the label is currently set. */
function labelIsSet(finding: LabelFindingState, label: FindingLabel): boolean {
  return label === "aiMade" ? finding.labelAiMade : label === "sexual" ? finding.labelSexual : finding.labelPossibleMinor;
}

/**
 * Decides one label action, without touching storage.
 *
 * - Any analyst may set or clear "Looks AI-made" and "Sexual content".
 * - "Possible minor" is a safety switch: setting it moves a CANDIDATE or
 *   APPROVED finding to MINOR_PROTOCOL (out of the adult queue, not
 *   approvable, no notice) and remembers where it came from. Clearing it
 *   needs an admin other than the setter and a recorded reason, and only
 *   then does the finding return to that earlier state. A DISMISSED finding
 *   keeps its dismissal: the label is recorded, nothing moves.
 */
function planLabelChange(
  finding: LabelFindingState,
  input: { action: LabelAction; label: FindingLabel; adminId: string; reason?: string },
  now: Date,
): LabelPlan {
  const { action, label, adminId } = input;
  const columns = LABEL_COLUMNS[label];
  if (action === "set") {
    if (labelIsSet(finding, label)) return { ok: true, changed: false };
    const write = labelWriteFor(label, "set", adminId, now);
    const data: Record<string, unknown> = { caseId: finding.caseId, label };
    if (label === "possibleMinor") {
      // Only the adult review states move; a DISMISSED finding keeps its
      // dismissal (it is out of the adult flow already) and a clear restores
      // nothing. The earlier clear record (if any) starts over.
      const movesOutOfAdultFlow = finding.reviewStatus === "CANDIDATE" || finding.reviewStatus === "APPROVED";
      write.labelPossibleMinorClearedById = null;
      write.labelPossibleMinorClearedAt = null;
      write.labelPossibleMinorClearReason = null;
      write.minorProtocolBefore = movesOutOfAdultFlow ? (finding.reviewStatus as FindingStatus) : null;
      if (movesOutOfAdultFlow) write.reviewStatus = "MINOR_PROTOCOL";
      data.minorProtocol = movesOutOfAdultFlow;
    }
    return { ok: true, changed: true, write, flagColumn: columns.flag, flagValue: false, guardStatus: label === "possibleMinor" ? finding.reviewStatus : null, audit: { eventType: "CRAWL_FINDING_LABEL_SET", data } };
  }

  // Clear.
  if (!labelIsSet(finding, label)) return { ok: false, error: "label_not_set" };
  const data: Record<string, unknown> = { caseId: finding.caseId, label };
  const write = labelWriteFor(label, "clear", adminId, now);
  if (label !== "possibleMinor") {
    return { ok: true, changed: true, write, flagColumn: columns.flag, flagValue: true, guardStatus: null, audit: { eventType: "CRAWL_FINDING_LABEL_CLEARED", data } };
  }
  const reason = (input.reason ?? "").trim().slice(0, CLEAR_REASON_MAX);
  if (!reason) return { ok: false, error: "reason_required" };
  if (finding.labelPossibleMinorById && finding.labelPossibleMinorById === adminId) return { ok: false, error: "second_admin_required" };
  write.labelPossibleMinorClearedById = adminId;
  write.labelPossibleMinorClearedAt = now;
  write.labelPossibleMinorClearReason = reason;
  // The setter stays on the row (labelPossibleMinorById) as the record of who
  // set it; only the flag goes. A MINOR_PROTOCOL finding returns to the state
  // the label took it out of.
  const restoredTo = finding.reviewStatus === "MINOR_PROTOCOL" ? (finding.minorProtocolBefore as FindingStatus | null) ?? "CANDIDATE" : null;
  if (restoredTo) write.reviewStatus = restoredTo;
  data.reason = reason;
  data.restoredTo = restoredTo;
  return { ok: true, changed: true, write, flagColumn: columns.flag, flagValue: true, guardStatus: finding.reviewStatus, audit: { eventType: "CRAWL_FINDING_LABEL_CLEARED", data } };
}

async function auditLabel(
  plan: { audit: { eventType: "CRAWL_FINDING_LABEL_SET" | "CRAWL_FINDING_LABEL_CLEARED"; data: Record<string, unknown> } },
  finding: { id: string },
  adminId: string,
) {
  await writeAuditLog({
    eventType: plan.audit.eventType,
    entityType: "CrawlFinding",
    entityId: finding.id,
    actorId: adminId,
    data: plan.audit.data,
  });
}

/**
 * Sets or clears one analyst label on a finding, on the memory, Kysely and
 * Prisma paths. Every change is audited like the review actions; a no-op
 * (the label is already in the wanted state) changes and audits nothing.
 *
 * The write is conditional on the state it was planned from, so two
 * concurrent actions on one finding cannot interleave: a set and a clear of
 * the same label are mutually exclusive, and a possible-minor set or clear
 * that raced a review is refused with `label_conflict` — reload and try
 * again.
 */
export async function applyFindingLabel(input: {
  findingId: string;
  action: LabelAction;
  label: FindingLabel;
  adminId: string;
  reason?: string;
  now?: Date;
}): Promise<LabelOutcome> {
  const now = input.now ?? new Date();

  if (isDevNoDb()) {
    const finding = crawlMemory().findings.get(input.findingId);
    if (!finding) return { ok: false, error: "finding_not_found" };
    const plan = planLabelChange(finding, input, now);
    if (!plan.ok) return plan;
    if (plan.changed) {
      Object.assign(finding, plan.write);
      await auditLabel(plan, finding, input.adminId);
    }
    return { ok: true, changed: plan.changed };
  }

  if (usesWorkerKysely()) {
    const db = getWorkerDb();
    const finding = await db.selectFrom("CrawlFinding").selectAll().where("id", "=", input.findingId).executeTakeFirst();
    if (!finding) return { ok: false, error: "finding_not_found" };
    const plan = planLabelChange(finding as unknown as LabelFindingState, input, now);
    if (!plan.ok) return plan;
    if (!plan.changed) return { ok: true, changed: false };
    // Conditional on the state the plan was made from: another admin's set or
    // clear of the same label, or a review that moved the status, makes this
    // a conflict instead of a half-applied label.
    let update = db.updateTable("CrawlFinding").set(plan.write)
      .where("id", "=", input.findingId)
      .where(plan.flagColumn as "labelAiMade" | "labelSexual" | "labelPossibleMinor", "=", plan.flagValue);
    if (plan.guardStatus !== null) update = update.where("reviewStatus", "=", plan.guardStatus as FindingStatus);
    const updated = await update.returning("id").executeTakeFirst();
    if (!updated) return { ok: false, error: "label_conflict" };
    await auditLabel(plan, finding, input.adminId);
    return { ok: true, changed: true };
  }

  const { db } = await import("@/lib/db");
  const finding = await db.crawlFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return { ok: false, error: "finding_not_found" };
  const plan = planLabelChange(finding, input, now);
  if (!plan.ok) return plan;
  if (!plan.changed) return { ok: true, changed: false };
  const flagWhere =
    plan.flagColumn === "labelAiMade" ? { labelAiMade: plan.flagValue }
    : plan.flagColumn === "labelSexual" ? { labelSexual: plan.flagValue }
    : { labelPossibleMinor: plan.flagValue };
  const updated = await db.crawlFinding.updateMany({
    where: { id: input.findingId, ...flagWhere, ...(plan.guardStatus !== null ? { reviewStatus: plan.guardStatus as FindingStatus } : {}) },
    data: plan.write,
  });
  if (updated.count === 0) return { ok: false, error: "label_conflict" };
  await auditLabel(plan, finding, input.adminId);
  return { ok: true, changed: true };
}
