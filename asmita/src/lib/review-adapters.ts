import { hasAdminPermission, type AdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { isAwaitingReview, reviewSubmittedUrl } from "@/lib/case-ops";
import { reviewHashSubmission } from "@/lib/hash-submission";
import { voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { applyFindingLabel, reviewCrawlFinding } from "@/lib/crawl-findings";
import { actOnPartnerApplication } from "@/lib/partner-admin";
import { listPartnerApplications } from "@/lib/platform-partners";
import { findPlatformByDomain } from "@/lib/platforms";
import type { RoutingFacts, RoutingFieldDef } from "@/lib/review-routing";
import { usesWorkerKysely } from "@/lib/worker-kysely";
import { db } from "@/lib/db";

/*
 * Review console adapters (review-console-spec.md, WP140). The single most
 * important rule: the console is a new way to REACH the decisions that
 * already exist, never a new way to make them. Each adapter is a transcript
 * of the existing admin route for its subject: the same permission, the same
 * existing library function, the same follow-ups and the same audit event
 * that function writes. Nothing here decides anything by itself.
 *
 * The AI Lab registers its own adapter from the Lab side
 * (src/lib/lab/lab-review-adapter.ts): queue code never imports lab modules
 * directly (docs/lab/charter.md), it only asks the registry, and the Lab's
 * module is the one that names lab functions.
 */

export type ReviewSubjectKind =
  | "FLAGGED_LINK"
  | "FINGERPRINT"
  | "FINDING"
  | "PARTNER_APPLICATION"
  | "LAB_REPORT";

export const REVIEW_SUBJECT_KINDS: readonly ReviewSubjectKind[] = [
  "FLAGGED_LINK",
  "FINGERPRINT",
  "FINDING",
  "PARTNER_APPLICATION",
  "LAB_REPORT",
];

/** A subject the sync or an enqueue is asking about. */
export type ReviewSubjectState = {
  subjectId: string;
  caseId: string | null;
  /**
   * The minor check holds this subject in the protected minor-hold queue
   * (WP140: a finding labelled "Possible minor"; nothing else can be a
   * minor signal today, because a minor never reaches case creation).
   */
  minorHold: boolean;
};

export type ReviewAdapterDecision = {
  code: string;
  label: string;
  /** Which of the queue's reason flags applies to this decision, if any. */
  reasonKind: "approve" | "reject" | null;
};

/**
 * What the review screens show about one subject (WP141): ids and facts in
 * the words the kind's own page uses, never an address. The only URL-shaped
 * value a card may carry is a masked domain, exactly like the Flagged and
 * Findings pages.
 */
export type ReviewSubjectCard = {
  /** One line naming the item. */
  summary: string;
  caseId: string | null;
  caseReference: string | null;
  /** Facts in display order. */
  fields: Array<{ label: string; value: string }>;
  /** FINDING only: the stored addresses were purged, so Reveal has nothing to show. */
  urlsPurged: boolean;
};

export type ReviewDecisionCtx = {
  /** The admin session's subject id: exactly what today's routes pass on. */
  reviewerId: string;
  reviewerEmailHash: string;
  role: AdminRole;
  /** The job's case id, where the subject has one. */
  caseId: string | null;
};

export type ReviewAdapterOutcome =
  | { ok: false; error: string }
  /**
   * The existing function succeeded but the subject still needs a human (a
   * first approval awaiting a second analyst, an application moved to
   * CONTACTED): the job stays open and the lease is released.
   */
  | { ok: true; resolved: false; status?: string }
  /**
   * The decision resolved the subject. requeueKey opens the follow-up job
   * (a possible-minor label moves the subject to minor-hold).
   */
  | { ok: true; resolved: true; requeueKey?: string; status?: string };

export type ReviewAdapter = {
  kind: ReviewSubjectKind;
  /** The permission today's route for this subject's decisions requires. */
  permission: AdminPermission;
  /** What the queue's decision buttons offer, in button order (WP141). */
  decisions: readonly ReviewAdapterDecision[];
  /** Subjects of this kind that need a human now, with the pages' predicates. */
  listOpenSubjects(): Promise<ReviewSubjectState[]>;
  /** The same question for one subject; null when it no longer needs review. */
  subjectNeedsReview(subjectId: string): Promise<ReviewSubjectState | null>;
  /** Performs the decision through the existing function. */
  decide(subjectId: string, decision: string, ctx: ReviewDecisionCtx): Promise<ReviewAdapterOutcome>;
  /**
   * Optional: the job screen's subject card (WP141). The Lab registers its
   * own because nothing outside the Lab may import lab modules; the four
   * complaint kinds describe themselves in the app layer, reusing their
   * pages' own helpers. Read-only — no decision path.
   */
  describeSubject?(subjectId: string, now: Date): Promise<ReviewSubjectCard | null>;
  /**
   * WP143 routing: the kind's fixed, typed allowlist of fields a routing
   * rule may read. Existing columns only — never survivor free text, never
   * an address. The Lab registers its own from the Lab side.
   */
  routingFields?: readonly RoutingFieldDef[];
  /**
   * WP143 routing: the facts of one subject by field key, or null when the
   * subject cannot be read. Values only from the allowlist above.
   */
  routingFacts?(subjectId: string, now: Date): Promise<RoutingFacts | null>;
};

// ---------------------------------------------------------------------------
// Registry

const adapters = new Map<ReviewSubjectKind, ReviewAdapter>();
let labAdapterLoad: Promise<void> | null = null;

/** Registers an adapter; the Lab side uses this for LAB_REPORT (charter boundary). */
export function registerReviewAdapter(adapter: ReviewAdapter): void {
  adapters.set(adapter.kind, adapter);
}

async function ensureLabAdapterLoaded(): Promise<void> {
  if (adapters.has("LAB_REPORT")) return;
  // The only sanctioned crossing of the charter boundary: queue code never
  // names a lab function, it only asks the Lab's own module to load, and
  // that module registers itself exactly once per process (a registry reset
  // stays reset until the Lab side re-registers — the WP140 contract). A
  // failure (never expected) leaves the kind unregistered and callers answer
  // "adapter_unavailable".
  labAdapterLoad ??= import("@/lib/lab/lab-review-adapter").then(
    () => undefined,
    () => undefined,
  );
  await labAdapterLoad;
}

/** The adapter for a kind, or null when the kind has none loaded. */
export async function getReviewAdapter(kind: ReviewSubjectKind): Promise<ReviewAdapter | null> {
  if (kind === "LAB_REPORT") await ensureLabAdapterLoaded();
  return adapters.get(kind) ?? null;
}

/** Test seam: forget every registration, including the Lab's. */
export function resetReviewAdapters(): void {
  adapters.clear();
  labAdapterLoad = null;
}

/** Re-registers the complaint adapters (used by resetReviewAdapters' callers in tests). */
export function registerComplaintReviewAdapters(): void {
  registerReviewAdapter(flaggedLinkAdapter);
  registerReviewAdapter(fingerprintAdapter);
  registerReviewAdapter(findingAdapter);
  registerReviewAdapter(partnerApplicationAdapter);
}

/**
 * The permission that lets a role SEE a queue of this kind (review-console
 * spec: cases:read for the complaint queues, the adapter's permission for
 * partner applications, lab:manage for lab reports; minor-hold is
 * SUPER_ADMIN only and is handled by the queue's protected flag).
 */
export function reviewVisibilityPermission(kind: ReviewSubjectKind): AdminPermission {
  switch (kind) {
    case "FLAGGED_LINK":
    case "FINGERPRINT":
    case "FINDING":
      return "cases:read";
    case "PARTNER_APPLICATION":
      return "platforms:edit";
    case "LAB_REPORT":
      return "lab:manage";
  }
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** The case one awaiting-review link belongs to, by id only. */
async function flaggedLinkSubject(urlId: string): Promise<ReviewSubjectState | null> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    for (const record of cases.values()) {
      const url = record.urls.find((item) => item.id === urlId);
      if (url) {
        return isAwaitingReview(url) ? { subjectId: urlId, caseId: record.id, minorHold: false } : null;
      }
    }
    return null;
  }
  const { db: prisma } = await import("@/lib/db");
  const row = await prisma.submittedUrl.findUnique({
    where: { id: urlId },
    select: { caseId: true, status: true, flaggedForReview: true },
  });
  if (!row || !isAwaitingReview(row)) return null;
  return { subjectId: urlId, caseId: row.caseId, minorHold: false };
}

// ---------------------------------------------------------------------------
// WP143 routing: the fixed, typed field allowlists per kind and the facts
// loaders behind them. Fields read existing columns only — no survivor free
// text and no URLs; a set field (labels, flag reasons) holds fixed codes.

const ENUM_OPS = ["eq", "neq", "in", "is_empty"] as const;
const NUMBER_OPS = ["eq", "neq", "lt", "lte", "gt", "gte"] as const;
const NUMBER_EMPTY_OPS = ["eq", "neq", "lt", "lte", "gt", "gte", "is_empty"] as const;
const SET_OPS = ["eq", "neq", "in", "is_empty"] as const;

export const LINK_ROUTING_FIELDS: readonly RoutingFieldDef[] = [
  { key: "platformTier", label: "Platform tier", type: "enum", values: ["TIER_1", "TIER_2", "TIER_3"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Unknown platform" },
  { key: "platformKey", label: "Platform", type: "string", ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Unknown platform" },
  { key: "urlSource", label: "Link source", type: "enum", values: ["SURVIVOR", "CRAWLER"], ops: ENUM_OPS, emptyPossible: false, emptyLabel: "" },
  { key: "flagReason", label: "Flag reason", type: "set", ops: SET_OPS, emptyPossible: true, emptyLabel: "No flag reason" },
  { key: "caseMode", label: "Case mode", type: "enum", values: ["CASE", "WATCH"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Unknown case" },
  { key: "ageHours", label: "Age (hours)", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
];

export const FINGERPRINT_ROUTING_FIELDS: readonly RoutingFieldDef[] = [
  { key: "algorithm", label: "Algorithm", type: "enum", values: ["PDQ", "VPDQ"], ops: ENUM_OPS, emptyPossible: false, emptyLabel: "" },
  { key: "quality", label: "Quality", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
  { key: "caseMode", label: "Case mode", type: "enum", values: ["CASE", "WATCH"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Unknown case" },
  { key: "ageHours", label: "Age (hours)", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
];

export const FINDING_ROUTING_FIELDS: readonly RoutingFieldDef[] = [
  { key: "method", label: "Match method", type: "enum", values: ["PDQ", "VPDQ", "SSCD"], ops: ENUM_OPS, emptyPossible: false, emptyLabel: "" },
  { key: "distance", label: "Distance", type: "number", ops: NUMBER_EMPTY_OPS, emptyPossible: true, emptyLabel: "No distance (SSCD)" },
  { key: "quality", label: "Quality", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
  { key: "consentScope", label: "Consent scope", type: "enum", values: ["SEARCH_AND_NOTICE", "WATCH_ONLY"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "No authorisation row" },
  { key: "sourceKind", label: "Crawl source", type: "enum", values: ["ADMIN", "REPORTED", "DISCOVERED", "PARTNER"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Unknown source" },
  { key: "labels", label: "Labels", type: "set", ops: SET_OPS, emptyPossible: true, emptyLabel: "No labels" },
  { key: "ageHours", label: "Age (hours)", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
];

export const PARTNER_APPLICATION_ROUTING_FIELDS: readonly RoutingFieldDef[] = [
  { key: "platformTier", label: "Platform tier", type: "enum", values: ["TIER_1", "TIER_2", "TIER_3"], ops: ENUM_OPS, emptyPossible: true, emptyLabel: "Not in the platform directory" },
  { key: "ageHours", label: "Age (hours)", type: "number", ops: NUMBER_OPS, emptyPossible: false, emptyLabel: "" },
];

/** Hours since a timestamp, never negative — the ageHours routing field. */
function routingAgeHours(from: Date | string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(from).getTime()) / 3_600_000);
}

/** The case's mode by id, or null when the case cannot be read. */
async function routingCaseMode(caseId: string): Promise<string | null> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    return cases.get(caseId)?.mode ?? "CASE";
  }
  if (usesWorkerKysely()) {
    const { getWorkerDb } = await import("@/lib/worker-kysely");
    const row = await getWorkerDb().selectFrom("Case").select("mode").where("id", "=", caseId).executeTakeFirst();
    return row?.mode ?? null;
  }
  const row = await db.case.findUnique({ where: { id: caseId }, select: { mode: true } });
  return row?.mode ?? null;
}

function routingFlagReasonSet(flagReason: string | null | undefined): string[] {
  if (!flagReason) return [];
  return flagReason
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

async function flaggedLinkFacts(urlId: string, now: Date): Promise<RoutingFacts | null> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    for (const record of cases.values()) {
      const url = record.urls.find((item) => item.id === urlId);
      if (!url) continue;
      // The memory store keeps no platform id on the row; its platform source
      // of truth is the static directory, resolved by domain exactly as the
      // row's own platformName was (store.ts addUrlsToCase).
      const platform = findPlatformByDomain(url.domain);
      return {
        platformTier: platform?.tier ?? null,
        platformKey: platform?.id ?? null,
        urlSource: url.source ?? "SURVIVOR",
        flagReason: routingFlagReasonSet(url.flagReason),
        caseMode: record.mode ?? "CASE",
        ageHours: routingAgeHours(url.submittedAt ?? record.createdAt, now),
      };
    }
    return null;
  }
  if (usesWorkerKysely()) {
    const { getWorkerDb } = await import("@/lib/worker-kysely");
    const row = await getWorkerDb().selectFrom("SubmittedUrl as su")
      .leftJoin("Platform as p", "p.id", "su.platformId")
      .leftJoin("Case as cm", "cm.id", "su.caseId")
      .select([
        "su.source", "su.flagReason", "su.submittedAt", "su.platformId",
        "p.tier as platformTier", "cm.mode as caseMode",
      ])
      .where("su.id", "=", urlId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      platformTier: row.platformTier ?? null,
      platformKey: row.platformId ?? null,
      urlSource: row.source ?? "SURVIVOR",
      flagReason: routingFlagReasonSet(row.flagReason),
      caseMode: row.caseMode ?? null,
      ageHours: routingAgeHours(row.submittedAt, now),
    };
  }
  const row = await db.submittedUrl.findUnique({
    where: { id: urlId },
    select: {
      source: true, flagReason: true, submittedAt: true, platformId: true,
      platform: { select: { tier: true } },
      case: { select: { mode: true } },
    },
  });
  if (!row) return null;
  return {
    platformTier: row.platform?.tier ?? null,
    platformKey: row.platformId,
    urlSource: row.source ?? "SURVIVOR",
    flagReason: routingFlagReasonSet(row.flagReason),
    caseMode: row.case?.mode ?? null,
    ageHours: routingAgeHours(row.submittedAt, now),
  };
}

async function fingerprintFacts(hashId: string, now: Date): Promise<RoutingFacts | null> {
  let row: { algorithm: string; quality: number; submittedAt: Date | string; caseId: string } | null = null;
  if (isDevNoDb()) {
    const { listHashReviewQueue } = await import("@/lib/hash-submission");
    row = (await listHashReviewQueue()).find((entry) => entry.id === hashId) ?? null;
  } else if (usesWorkerKysely()) {
    const { getWorkerDb } = await import("@/lib/worker-kysely");
    row = (await getWorkerDb().selectFrom("HashSubmission")
      .select(["algorithm", "quality", "submittedAt", "caseId"])
      .where("id", "=", hashId)
      .executeTakeFirst()) ?? null;
  } else {
    row = await db.hashSubmission.findUnique({
      where: { id: hashId },
      select: { algorithm: true, quality: true, submittedAt: true, caseId: true },
    });
  }
  if (!row) return null;
  return {
    algorithm: row.algorithm,
    quality: row.quality,
    caseMode: await routingCaseMode(row.caseId),
    ageHours: routingAgeHours(row.submittedAt, now),
  };
}

async function findingFacts(findingId: string, now: Date): Promise<RoutingFacts | null> {
  if (isDevNoDb()) {
    const { crawlMemory } = await import("@/lib/crawl-store");
    const finding = crawlMemory().findings.get(findingId);
    if (!finding) return null;
    const consent = finding.crawlConsentId ? crawlMemory().consents.find((item) => item.id === finding.crawlConsentId) ?? null : null;
    const source = crawlMemory().sources.get(finding.sourceId) ?? null;
    const labels = [
      ...(finding.labelAiMade ? ["ai_made"] : []),
      ...(finding.labelSexual ? ["sexual"] : []),
      ...(finding.labelPossibleMinor ? ["possible_minor"] : []),
    ];
    return {
      method: finding.method,
      distance: finding.distance,
      quality: finding.quality,
      consentScope: consent?.scope ?? null,
      sourceKind: source?.origin ?? null,
      labels,
      ageHours: routingAgeHours(finding.firstSeenAt, now),
    };
  }
  if (usesWorkerKysely()) {
    const { getWorkerDb } = await import("@/lib/worker-kysely");
    const row = await getWorkerDb().selectFrom("CrawlFinding as f")
      .leftJoin("CrawlConsent as cc", "cc.id", "f.crawlConsentId")
      .leftJoin("CrawlSource as cs", "cs.id", "f.sourceId")
      .select([
        "f.method", "f.distance", "f.quality", "f.firstSeenAt",
        "f.labelAiMade", "f.labelSexual", "f.labelPossibleMinor",
        "cc.scope as consentScope", "cs.origin as sourceKind",
      ])
      .where("f.id", "=", findingId)
      .executeTakeFirst();
    if (!row) return null;
    const labels = [
      ...(row.labelAiMade ? ["ai_made"] : []),
      ...(row.labelSexual ? ["sexual"] : []),
      ...(row.labelPossibleMinor ? ["possible_minor"] : []),
    ];
    return {
      method: row.method,
      distance: row.distance ?? null,
      quality: row.quality,
      consentScope: row.consentScope ?? null,
      sourceKind: row.sourceKind ?? null,
      labels,
      ageHours: routingAgeHours(row.firstSeenAt, now),
    };
  }
  const row = await db.crawlFinding.findUnique({
    where: { id: findingId },
    select: {
      method: true, distance: true, quality: true, firstSeenAt: true,
      labelAiMade: true, labelSexual: true, labelPossibleMinor: true,
      crawlConsentId: true,
      source: { select: { origin: true } },
    },
  });
  if (!row) return null;
  // CrawlFinding carries no relation to CrawlConsent (the id is provenance
  // only), so the authorisation's scope is a second lookup by id.
  const consent = row.crawlConsentId
    ? await db.crawlConsent.findUnique({ where: { id: row.crawlConsentId }, select: { scope: true } })
    : null;
  const labels = [
    ...(row.labelAiMade ? ["ai_made"] : []),
    ...(row.labelSexual ? ["sexual"] : []),
    ...(row.labelPossibleMinor ? ["possible_minor"] : []),
  ];
  return {
    method: row.method,
    distance: row.distance,
    quality: row.quality,
    consentScope: consent?.scope ?? null,
    sourceKind: row.source?.origin ?? null,
    labels,
    ageHours: routingAgeHours(row.firstSeenAt, now),
  };
}

async function partnerApplicationFacts(applicationId: string, now: Date): Promise<RoutingFacts | null> {
  let row: { websiteDomain: string; createdAt: Date | string } | null = null;
  if (isDevNoDb()) {
    row = (await listPartnerApplications()).find((entry) => entry.id === applicationId) ?? null;
  } else if (usesWorkerKysely()) {
    const { getWorkerDb } = await import("@/lib/worker-kysely");
    row = (await getWorkerDb().selectFrom("PlatformPartnerApplication")
      .select(["websiteDomain", "createdAt"])
      .where("id", "=", applicationId)
      .executeTakeFirst()) ?? null;
  } else {
    row = await db.platformPartnerApplication.findUnique({
      where: { id: applicationId },
      select: { websiteDomain: true, createdAt: true },
    });
  }
  if (!row) return null;
  // The applicant's website domain against the platform directory, the same
  // resolution the app itself uses for a submitted host (link-check.ts);
  // nothing is fetched, and an unknown domain reads as empty.
  const platform = findPlatformByDomain(row.websiteDomain);
  return {
    platformTier: platform?.tier ?? null,
    ageHours: routingAgeHours(row.createdAt, now),
  };
}

// ---------------------------------------------------------------------------
// Flagged links — the single approve/reject routes
// (src/app/api/admin/review-queue/[caseId]/[urlId]/{approve,reject}).

const flaggedLinkAdapter: ReviewAdapter = {
  kind: "FLAGGED_LINK",
  permission: "cases:review",
  decisions: [
    { code: "approve", label: "Approve link", reasonKind: "approve" },
    { code: "reject", label: "Reject link", reasonKind: "reject" },
  ],
  async listOpenSubjects() {
    if (isDevNoDb()) {
      const { cases } = await import("@/lib/store");
      const subjects: ReviewSubjectState[] = [];
      for (const record of cases.values()) {
        for (const url of record.urls) {
          if (isAwaitingReview(url)) subjects.push({ subjectId: url.id, caseId: record.id, minorHold: false });
        }
      }
      return subjects;
    }
    const { db: prisma } = await import("@/lib/db");
    const rows = await prisma.submittedUrl.findMany({
      where: { OR: [{ status: "PENDING_REVIEW" }, { flaggedForReview: true, status: "NOTICE_QUEUED" }] },
      select: { id: true, caseId: true },
      orderBy: { submittedAt: "asc" },
    });
    return rows.map((row) => ({ subjectId: row.id, caseId: row.caseId, minorHold: false }));
  },
  subjectNeedsReview: flaggedLinkSubject,
  routingFields: LINK_ROUTING_FIELDS,
  routingFacts: flaggedLinkFacts,
  async decide(urlId, decision, ctx) {
    if (!hasAdminPermission(ctx.role, "cases:review")) return { ok: false, error: "permission_denied" };
    // The console's reasons are internal (WP142): they are recorded on the
    // ReviewDecision and never passed to the survivor-visible flagReason,
    // exactly like the Flagged page's one-click buttons, which pass none.
    const caseId = ctx.caseId ?? (await flaggedLinkSubject(urlId))?.caseId ?? null;
    if (!caseId) return { ok: false, error: "url_not_found" };
    try {
      await reviewSubmittedUrl({
        caseId,
        urlId,
        decision: decision === "approve" ? "approve" : "reject",
        reviewerId: ctx.reviewerId,
      });
      return { ok: true, resolved: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "review_failed" };
    }
  },
};

// ---------------------------------------------------------------------------
// Fingerprints — the hashes approve/reject routes
// (src/app/api/admin/hashes/[hashId]/{approve,reject}).

const fingerprintAdapter: ReviewAdapter = {
  kind: "FINGERPRINT",
  permission: "cases:review",
  decisions: [
    { code: "approve", label: "Approve fingerprint", reasonKind: "approve" },
    { code: "reject", label: "Reject fingerprint", reasonKind: "reject" },
  ],
  async listOpenSubjects() {
    const { listHashReviewQueue } = await import("@/lib/hash-submission");
    return (await listHashReviewQueue()).map((row) => ({
      subjectId: row.id,
      caseId: row.caseId,
      minorHold: false,
    }));
  },
  async subjectNeedsReview(hashSubmissionId) {
    const { listHashReviewQueue } = await import("@/lib/hash-submission");
    const row = (await listHashReviewQueue()).find((item) => item.id === hashSubmissionId);
    return row ? { subjectId: hashSubmissionId, caseId: row.caseId, minorHold: false } : null;
  },
  routingFields: FINGERPRINT_ROUTING_FIELDS,
  routingFacts: fingerprintFacts,
  async decide(hashSubmissionId, decision, ctx) {
    if (!hasAdminPermission(ctx.role, "cases:review")) return { ok: false, error: "permission_denied" };
    // The hashes routes are off when hash upload is off; same refusal here.
    if (process.env.ENABLE_HASH_UPLOAD !== "true") return { ok: false, error: "hash_upload_disabled" };
    try {
      await reviewHashSubmission({
        hashSubmissionId,
        decision: decision === "approve" ? "approve" : "reject",
        reviewerId: ctx.reviewerId,
        // As on the hashes page, the console's internal reason never reaches
        // the row's flagReason; the ReviewDecision keeps it.
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "review_failed" };
    }
    if (isDevNoDb()) {
      // The dev store holds no signed advisory and no signed annex, so the
      // database-only follow-ups below have nothing to act on.
      return { ok: true, resolved: true };
    }
    if (decision === "reject") {
      // Unsent signatures that list this fingerprint can never be dispatched;
      // void them so the survivor can sign the current set again, exactly as
      // the reject route does. Best-effort: dispatch re-checks anyway.
      try {
        const caseId = ctx.caseId ?? (await db.hashSubmission.findUnique({ where: { id: hashSubmissionId }, select: { caseId: true } }))?.caseId;
        if (caseId) await voidSignaturesWithRejectedFingerprints(caseId, { trigger: "rejection", actorId: ctx.reviewerId });
      } catch (err) {
        console.error("Voiding signatures after rejection failed; dispatch will retry", err);
      }
      return { ok: true, resolved: true };
    }
    // The survivor signed one advisory for every platform they chose; once
    // all its fingerprints are approved it goes to each of them, exactly as
    // the approve route sends it. Dispatch refuses until then, and a
    // platform already sent is skipped, so approving one by one is safe.
    try {
      const caseId = ctx.caseId ?? (await db.hashSubmission.findUnique({ where: { id: hashSubmissionId }, select: { caseId: true } }))?.caseId;
      if (!caseId) return { ok: true, resolved: true };
      const advisory = await db.case.findUnique({
        where: { id: caseId },
        select: { signedHashAdvisoryPdf: true, hashAdvisoryPlatformIds: true },
      });
      if (advisory?.signedHashAdvisoryPdf && advisory.hashAdvisoryPlatformIds.length > 0) {
        try {
          await dispatchHashAdvisories({
            caseId,
            platformIds: [...new Set(advisory.hashAdvisoryPlatformIds)],
            actorId: ctx.reviewerId,
          });
        } catch (err) {
          console.error("Hash advisory dispatch after approval failed", err);
        }
      }
    } catch (err) {
      console.error("Hash advisory check after approval failed", err);
    }
    return { ok: true, resolved: true };
  },
};

// ---------------------------------------------------------------------------
// Crawler findings — the findings review route
// (src/app/api/admin/findings/[id]/review) and the possible-minor label.

const findingAdapter: ReviewAdapter = {
  kind: "FINDING",
  permission: "findings:review",
  decisions: [
    { code: "approve", label: "Approve finding", reasonKind: "approve" },
    { code: "dismiss", label: "Dismiss finding", reasonKind: "reject" },
    { code: "label_possible_minor", label: "Label Possible minor", reasonKind: null },
  ],
  async listOpenSubjects() {
    const { listCrawlFindings } = await import("@/lib/crawl-findings");
    const candidates = await listCrawlFindings({ status: "CANDIDATE" });
    const held = await listCrawlFindings({ status: "MINOR_PROTOCOL" });
    return [
      ...candidates.map((row): ReviewSubjectState => ({ subjectId: row.id, caseId: row.caseId, minorHold: false })),
      ...held.map((row): ReviewSubjectState => ({ subjectId: row.id, caseId: row.caseId, minorHold: true })),
    ];
  },
  async subjectNeedsReview(findingId) {
    const { getCrawlFindingSummary } = await import("@/lib/crawl-findings");
    const row = await getCrawlFindingSummary(findingId);
    if (!row) return null;
    if (row.reviewStatus === "CANDIDATE") return { subjectId: findingId, caseId: row.caseId, minorHold: false };
    if (row.reviewStatus === "MINOR_PROTOCOL") return { subjectId: findingId, caseId: row.caseId, minorHold: true };
    return null;
  },
  routingFields: FINDING_ROUTING_FIELDS,
  routingFacts: findingFacts,
  async decide(findingId, decision, ctx) {
    if (!hasAdminPermission(ctx.role, "findings:review")) return { ok: false, error: "permission_denied" };
    if (!crawlerEnabled()) return { ok: false, error: "crawler_disabled" };
    if (decision === "label_possible_minor") {
      // The existing label function is the safety switch: while the label is
      // set the finding cannot be approved or dismissed, and clearing it needs
      // a second, different admin and a recorded reason (crawl-findings.ts).
      const outcome = await applyFindingLabel({
        findingId,
        action: "set",
        label: "possibleMinor",
        adminId: ctx.reviewerId,
      });
      if (!outcome.ok) return outcome;
      return { ok: true, resolved: true, requeueKey: "minor-hold" };
    }
    const outcome = await reviewCrawlFinding({
      findingId,
      decision: decision === "approve" ? "approve" : "dismiss",
      reviewerId: ctx.reviewerId,
    });
    if (!outcome.ok) return outcome;
    // A close match is decided by one analyst; a distant or SSCD match
    // above distance 20 needs a second, different one first, so only the
    // final approval and a dismissal resolve the subject.
    if (outcome.status === "AWAITING_SECOND_REVIEW") return { ok: true, resolved: false, status: outcome.status };
    return { ok: true, resolved: true, status: outcome.status };
  },
};

// ---------------------------------------------------------------------------
// Partner applications — the applications route
// (src/app/api/admin/partners/applications/[applicationId]).

const partnerApplicationAdapter: ReviewAdapter = {
  kind: "PARTNER_APPLICATION",
  permission: "platforms:edit",
  decisions: [
    { code: "contacted", label: "Mark contacted", reasonKind: null },
    { code: "approve", label: "Approve application", reasonKind: "approve" },
    { code: "decline", label: "Decline application", reasonKind: "reject" },
  ],
  async listOpenSubjects() {
    const rows = await listPartnerApplications();
    return rows
      .filter((row) => row.status === "NEW" || row.status === "CONTACTED")
      .map((row): ReviewSubjectState => ({ subjectId: row.id, caseId: null, minorHold: false }));
  },
  async subjectNeedsReview(applicationId) {
    const row = (await listPartnerApplications()).find((item) => item.id === applicationId);
    if (!row) return null;
    if (row.status !== "NEW" && row.status !== "CONTACTED") return null;
    return { subjectId: applicationId, caseId: null, minorHold: false };
  },
  routingFields: PARTNER_APPLICATION_ROUTING_FIELDS,
  routingFacts: partnerApplicationFacts,
  async decide(applicationId, decision, ctx) {
    if (!hasAdminPermission(ctx.role, "platforms:edit")) return { ok: false, error: "permission_denied" };
    if (decision !== "contacted" && decision !== "approve" && decision !== "decline") {
      return { ok: false, error: "invalid_payload" };
    }
    const outcome = await actOnPartnerApplication({ applicationId, action: decision }, ctx.reviewerId);
    if (!outcome.ok) return outcome;
    // "Contacted" keeps the application open for a real decision; approving
    // (it onboards the partner) and declining close it.
    return { ok: true, resolved: decision !== "contacted", status: outcome.status };
  },
};

registerComplaintReviewAdapters();
