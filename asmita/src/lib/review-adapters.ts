import { hasAdminPermission, type AdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { isAwaitingReview, reviewSubmittedUrl } from "@/lib/case-ops";
import { reviewHashSubmission } from "@/lib/hash-submission";
import { voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { applyFindingLabel, reviewCrawlFinding } from "@/lib/crawl-findings";
import { actOnPartnerApplication } from "@/lib/partner-admin";
import { listPartnerApplications } from "@/lib/platform-partners";
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
  // that module registers itself. A failure (never expected) leaves the kind
  // unregistered and callers answer "adapter_unavailable".
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
