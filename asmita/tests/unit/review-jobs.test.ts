import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP140 (review-console-spec.md) on the memory backend, which every Asmita
// module tests first: the lease (two reviewers never share a job, an expired
// lease is handed over, a refresh gets the same job back), the
// reviewer-scoped skip, one open job per subject, the sync opening and
// closing jobs for each kind through the adapters, minor-hold precedence
// and the refusal to move out of it, idempotent decide, claim_lost, reason
// enforcement, queue visibility, and that no job, decision, claim or skip
// row ever carries an address. Placeholder ids and invented hosts throughout.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { crawlMemory, resetCrawlMemory, type MemoryCrawlFinding } from "@/lib/crawl-store";
import { resetLabMemory, labMemory } from "@/lib/lab/lab-store";
import { partnerApplications } from "@/lib/platform-partners";
import { decryptField, encryptField } from "@/lib/encryption";
import { MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { resetReviewAdapters, getReviewAdapter, reviewVisibilityPermission } from "@/lib/review-adapters";
import { addHashesToCase, resetMemoryHashStore, reviewHashSubmission } from "@/lib/hash-submission";
import { applyFindingLabel } from "@/lib/crawl-findings";
import {
  CLAIM_MINUTES,
  SKIP_MINUTES,
  SYSTEM_REVIEWER,
  canSeeReviewQueue,
  claimNextJob,
  decideJob,
  enqueueForReview,
  ensureSystemQueues,
  extendClaim,
  getReviewQueueByKey,
  listReviewQueues,
  maybeSyncReviewJobs,
  moveJob,
  queueSummaries,
  releaseJob,
  resetReviewMemory,
  reviewMemory,
  skipJob,
  syncReviewJobs,
} from "@/lib/review-jobs";

const NOW = new Date("2026-11-22T10:00:00Z");
const MINUTE = 60_000;
const SUPER = "SUPER_ADMIN" as const;
const REVIEWER = "CASE_REVIEWER" as const;

function reviewer(n: string) {
  return `hash-${n}`;
}

/** One of her cases with one flagged link on an invented host. */
async function seedFlaggedLink(url = "https://forum.example.test/post/1") {
  const record = await createCase("user-1");
  const [result] = await storeAddUrls(record.id, [url], { flagReasons: ["many_unrelated_domains"] });
  if (!result.ok) throw new Error("expected accepted URL");
  return { caseId: record.id, urlId: result.url.id };
}

/** A crawler finding candidate, the memory twin of the seeded fixtures in the crawler tests. */
function seedFinding(overrides: Partial<MemoryCrawlFinding> = {}) {
  const finding: MemoryCrawlFinding = {
    id: `finding-${randomId()}`,
    caseId: "case-finding",
    hashSubmissionId: "hash-finding",
    crawlConsentId: null,
    pageUrlEncrypted: encryptField("https://forum.example.test/page/1"),
    imageUrlEncrypted: encryptField("https://cdn.example.test/img/1"),
    urlDigest: `digest-${randomId()}`,
    distance: 5,
    sscdSimilarity: null,
    quality: 90,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    sourceId: "source-1",
    runId: "run-1",
    reviewStatus: "CANDIDATE",
    method: "PDQ",
    reviewedById: null,
    reviewedAt: null,
    secondReviewedById: null,
    secondReviewedAt: null,
    labelAiMade: false,
    labelAiMadeById: null,
    labelAiMadeAt: null,
    labelSexual: false,
    labelSexualById: null,
    labelSexualAt: null,
    labelPossibleMinor: false,
    labelPossibleMinorById: null,
    labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null,
    labelPossibleMinorClearedAt: null,
    labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
    ...overrides,
  };
  crawlMemory().findings.set(finding.id, finding);
  return finding;
}

function seedPartnerApplication(status: "NEW" | "CONTACTED" = "NEW") {
  const application = {
    id: `application-${randomId()}`,
    organisationName: "Example Trust",
    platformName: "Example Forum",
    websiteDomain: "forum.example.test",
    platformType: "FORUM" as const,
    userBase: "UNDER_100K" as const,
    contactName: "Example Contact",
    contactRole: "Trust & Safety",
    contactEmail: "contact@example.test",
    interests: ["FINGERPRINT_ALERTS" as const],
    message: "We would like to join.",
    status,
    createdAt: new Date().toISOString(),
  };
  partnerApplications.push(application);
  return application;
}

function seedLabDraft() {
  const report = {
    id: `lab-report-${randomId()}`,
    chokepointId: "chokepoint-missing",
    templateKind: "HOST" as const,
    channel: null,
    subject: "Example abuse report",
    body: "The text the analyst reviewed.",
    status: "DRAFT" as const,
    toAddress: null,
    sentAt: null,
    sentById: null,
    providerReference: null,
    outcome: null,
    outcomeAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  labMemory().reports.set(report.id, report);
  return report;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Serialises every review row the memory backend holds, for the no-address assertions. */
function allReviewRows(): string {
  const memory = reviewMemory();
  return JSON.stringify({
    queues: [...memory.queues.values()],
    jobs: [...memory.jobs.values()],
    decisions: [...memory.decisions.values()],
    claims: memory.claims,
    skips: [...memory.skips.values()],
  });
}

async function claimLinks(emailHash: string, now = NOW) {
  const linksQueue = await getReviewQueueByKey("links");
  if (!linksQueue) throw new Error("links queue missing");
  return claimNextJob({ queueId: linksQueue.id, reviewerEmailHash: emailHash, now });
}

async function decide(input: Parameters<typeof decideJob>[0]) {
  return decideJob({ ...input, now: input.now ?? NOW });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  resetReviewMemory();
  resetCrawlMemory();
  resetLabMemory();
  resetMemoryHashStore();
  cases.clear();
  partnerApplications.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("system queues", () => {
  it("seeds the six system queues idempotently, one default per kind, minor-hold protected", async () => {
    await ensureSystemQueues();
    await ensureSystemQueues();
    const queues = await listReviewQueues();
    expect(queues.map((queue) => queue.key)).toEqual([
      "links",
      "fingerprints",
      "findings",
      "partners",
      "lab-reports",
      "minor-hold",
    ]);
    expect(queues).toHaveLength(6);
    for (const kind of ["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION", "LAB_REPORT"] as const) {
      const defaults = queues.filter((queue) => queue.subjectKind === kind && queue.isDefault);
      expect(defaults, kind).toHaveLength(1);
    }
    const minorHold = queues.find((queue) => queue.key === MINOR_HOLD_QUEUE_KEY)!;
    expect(minorHold.protected).toBe(true);
    expect(minorHold.subjectKind).toBeNull();
  });

  it("shows a queue exactly to the roles the spec allows", async () => {
    await ensureSystemQueues();
    const queues = await listReviewQueues();
    const byKey = new Map(queues.map((queue) => [queue.key, queue]));

    // cases:read sees the complaint queues (a support agent can look, but
    // only cases:review decides); the adapter's permission sees partner
    // applications; lab:manage sees lab reports; minor-hold is SUPER_ADMIN only.
    expect(canSeeReviewQueue(REVIEWER, byKey.get("links")!)).toBe(true);
    expect(canSeeReviewQueue(REVIEWER, byKey.get("fingerprints")!)).toBe(true);
    expect(canSeeReviewQueue(REVIEWER, byKey.get("findings")!)).toBe(true);
    expect(canSeeReviewQueue(REVIEWER, byKey.get("partners")!)).toBe(false);
    expect(canSeeReviewQueue(REVIEWER, byKey.get("lab-reports")!)).toBe(false);
    expect(canSeeReviewQueue(REVIEWER, byKey.get("minor-hold")!)).toBe(false);
    expect(canSeeReviewQueue(SUPER, byKey.get("minor-hold")!)).toBe(true);
    expect(canSeeReviewQueue("GO_EDITOR" as const, byKey.get("partners")!)).toBe(true);
    expect(canSeeReviewQueue("GO_EDITOR" as const, byKey.get("links")!)).toBe(false);
    expect(canSeeReviewQueue("LEGAL_ADVISOR" as const, byKey.get("links")!)).toBe(true);
    expect(canSeeReviewQueue("SUPPORT_AGENT" as const, byKey.get("links")!)).toBe(true);
    expect(reviewVisibilityPermission("FINDING")).toBe("cases:read");
  });
});

describe("sync: jobs follow the source of truth", () => {
  it("opens a job per flagged link, fingerprint, finding, application and lab report", async () => {
    const link = await seedFlaggedLink();
    await addHashesToCase("case-hash", [{ hash: "a".repeat(64), quality: 80 }]);
    seedFinding();
    seedPartnerApplication();
    seedLabDraft();

    // The entry-point hooks already opened some jobs; start from a clean
    // review store to prove the sync alone finds every subject.
    resetReviewMemory();
    const result = await syncReviewJobs(NOW);
    expect(result.enqueued).toBe(5);
    expect(result.kindsWithoutAdapters).toEqual([]);

    const queues = await queueSummaries({ role: SUPER, emailHash: reviewer("none") }, NOW);
    const counts = Object.fromEntries(queues.map((queue) => [queue.key, queue.pending]));
    expect(counts).toEqual({
      links: 1,
      fingerprints: 1,
      findings: 1,
      partners: 1,
      "lab-reports": 1,
      "minor-hold": 0,
    });
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === link.urlId);
    expect(job?.caseId).toBe(link.caseId);
  });

  it("closes a job whose subject was decided elsewhere, with a system close_stale decision", async () => {
    const link = await seedFlaggedLink();
    resetReviewMemory();
    await syncReviewJobs(NOW);
    const [jobId] = [...reviewMemory().jobs.keys()];

    // The Flagged page's own button decides the link outside the console.
    const { reviewSubmittedUrl } = await import("@/lib/store");
    await reviewSubmittedUrl({ caseId: link.caseId, urlId: link.urlId, decision: "reject", reviewerId: "admin-1" });

    const result = await syncReviewJobs(new Date(NOW.getTime() + MINUTE));
    expect(result.closed).toBe(1);
    const job = reviewMemory().jobs.get(jobId)!;
    expect(job.status).toBe("CLOSED");
    expect(job.closedReason).toBe("resolved_elsewhere");
    const decision = reviewMemory().decisions.get(jobId)!;
    expect(decision.reviewerEmailHash).toBe(SYSTEM_REVIEWER);
    expect(decision.decision).toBe("close_stale");
  });

  it("keeps one open job per subject: a second enqueue merges, never duplicates", async () => {
    const link = await seedFlaggedLink();
    const first = await enqueueForReview("FLAGGED_LINK", link.urlId, { caseId: link.caseId, now: NOW });
    const second = await enqueueForReview("FLAGGED_LINK", link.urlId, { caseId: link.caseId, now: NOW });
    expect(first).toMatchObject({ ok: true, merged: false });
    expect(second).toMatchObject({ ok: true, merged: true, jobId: first.ok ? first.jobId : null });
    const open = [...reviewMemory().jobs.values()].filter((job) => job.status === "PENDING");
    expect(open).toHaveLength(1);
  });

  it("throttles the lazy sync to once per 30 seconds per isolate", async () => {
    await seedFlaggedLink();
    await maybeSyncReviewJobs(NOW);
    expect([...reviewMemory().jobs.values()]).toHaveLength(1);

    await seedFlaggedLink("https://forum.example.test/post/2");
    await maybeSyncReviewJobs(new Date(NOW.getTime() + 29_000));
    expect([...reviewMemory().jobs.values()]).toHaveLength(1);

    await maybeSyncReviewJobs(new Date(NOW.getTime() + 31_000));
    expect([...reviewMemory().jobs.values()]).toHaveLength(2);
  });
});

describe("the lease", () => {
  it("never gives one job to two reviewers, hands an expired lease over, and returns a held job to its holder", async () => {
    await seedFlaggedLink();
    await seedFlaggedLink("https://forum.example.test/post/2");
    await syncReviewJobs(NOW);

    const first = await claimLinks(reviewer("a"));
    const second = await claimLinks(reviewer("b"));
    expect(first.job?.id).toBeTruthy();
    expect(second.job?.id).toBeTruthy();
    expect(first.job!.id).not.toBe(second.job!.id);
    expect(await claimLinks(reviewer("c"), new Date(NOW.getTime() + MINUTE))).toEqual({ job: null, claimId: null });

    // A refresh gets the same job back, with a fresh lease.
    const refreshed = await claimLinks(reviewer("a"), new Date(NOW.getTime() + 2 * MINUTE));
    expect(refreshed.job?.id).toBe(first.job!.id);

    // After the lease expires the job goes to the next reviewer.
    const later = new Date(NOW.getTime() + (CLAIM_MINUTES + 1) * MINUTE);
    const takenOver = await claimLinks(reviewer("b"), later);
    expect(takenOver.job?.id).toBe(second.job!.id);

    // Every claim is a ReviewJobClaim row.
    expect(reviewMemory().claims.filter((claim) => claim.reviewerEmailHash === reviewer("a"))).toHaveLength(2);
  });

  it("extends only the caller's own lease", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));
    expect(job).toBeTruthy();

    expect(await extendClaim(job!.id, reviewer("b"), new Date(NOW.getTime() + MINUTE))).toEqual({
      ok: false,
      error: "claim_lost",
    });
    expect(await extendClaim(job!.id, reviewer("a"), new Date(NOW.getTime() + MINUTE))).toEqual({ ok: true });
    const stored = reviewMemory().jobs.get(job!.id)!;
    expect(stored.claimedUntil!.getTime()).toBe(new Date(NOW.getTime() + MINUTE + CLAIM_MINUTES * MINUTE).getTime());
  });

  it("releases the caller's lease without a decision", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));
    expect(await releaseJob(job!.id, reviewer("b"), NOW)).toEqual({ ok: false, error: "claim_lost" });
    expect(await releaseJob(job!.id, reviewer("a"), NOW)).toEqual({ ok: true });
    const stored = reviewMemory().jobs.get(job!.id)!;
    expect(stored.claimedBy).toBeNull();
    const claim = reviewMemory().claims.find((item) => item.jobId === job!.id)!;
    expect(claim.outcome).toBe("released");
  });

  it("skips a job for this reviewer only, for 30 minutes", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));

    expect(await skipJob(job!.id, reviewer("a"), NOW)).toEqual({ ok: true });
    // The skip released the lease; inside the skip window the skipper does
    // not get the job back even though it is free.
    expect(await claimLinks(reviewer("a"), new Date(NOW.getTime() + MINUTE))).toEqual({ job: null, claimId: null });
    // Another reviewer is not affected by the skip at all.
    const other = await claimLinks(reviewer("b"), new Date(NOW.getTime() + 2 * MINUTE));
    expect(other.job?.id).toBe(job!.id);
    expect(await skipJob(other.job!.id, reviewer("b"), new Date(NOW.getTime() + 2 * MINUTE))).toEqual({ ok: true });

    // After the skip window the job is offered to the skipper again.
    const later = new Date(NOW.getTime() + (SKIP_MINUTES + 1) * MINUTE);
    const again = await claimLinks(reviewer("a"), later);
    expect(again.job?.id).toBe(job!.id);
    const skip = reviewMemory().skips.get(`${reviewer("a")}\u0000${job!.id}`)!;
    expect(skip.until.getTime()).toBe(new Date(NOW.getTime() + SKIP_MINUTES * MINUTE).getTime());
  });
});

describe("decisions", () => {
  it("goes through the existing function, closes the job and its claim, and is idempotent on retry", async () => {
    // A known platform: the existing review approves it (an unknown platform
    // is refused by the existing function, which the next test asserts).
    const link = await seedFlaggedLink("https://instagram.com/p/example");
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));
    expect(job).toBeTruthy();

    const before = inMemoryAuditLog.length;
    const result = await decide({
      jobId: job!.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    if (result.ok && result.closed) expect(result.decision.decision).toBe("approve");
    // The existing function's audit event (URL_APPROVED), nothing new.
    expect(inMemoryAuditLog.slice(before).map((event) => event.eventType)).toEqual(["URL_APPROVED"]);

    const stored = reviewMemory().jobs.get(job!.id)!;
    expect(stored.status).toBe("CLOSED");
    expect(stored.closedReason).toBe("approve");
    expect(stored.claimedBy).toBeNull();
    const claim = reviewMemory().claims.find((item) => item.jobId === job!.id)!;
    expect(claim.outcome).toBe("decided");
    const decision = reviewMemory().decisions.get(job!.id)!;
    expect(decision.caseId).toBe(link.caseId);
    expect(decision.reviewerEmailHash).toBe(reviewer("a"));

    // A retried submit returns the earlier decision instead of a second one.
    const retry = await decide({
      jobId: job!.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
    });
    expect(retry).toMatchObject({ ok: true, closed: true, idempotent: true });
    expect(reviewMemory().decisions.size).toBe(1);

    // And the link really was decided through the existing review.
    const record = cases.get(link.caseId)!;
    expect(record.urls[0].status).toBe("NOTICE_QUEUED");
  });

  it("refuses a decision without the lease, on a closed job, and from a role without the permission", async () => {
    const link = await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));

    // Another reviewer does not hold the lease.
    expect(
      await decide({ jobId: job!.id, me: reviewer("b"), reviewerId: "admin-2", role: REVIEWER, decision: "approve" }),
    ).toMatchObject({ ok: false, error: "claim_lost" });

    // An expired lease is a lost claim.
    expect(
      await decide({
        jobId: job!.id,
        me: reviewer("a"),
        reviewerId: "admin-1",
        role: REVIEWER,
        decision: "approve",
        now: new Date(NOW.getTime() + (CLAIM_MINUTES + 1) * MINUTE),
      }),
    ).toMatchObject({ ok: false, error: "claim_lost" });

    // The role check is the adapter's own: a support agent cannot approve.
    await extendClaim(job!.id, reviewer("a"), new Date(NOW.getTime() + MINUTE));
    expect(
      await decide({
        jobId: job!.id,
        me: reviewer("a"),
        reviewerId: "admin-1",
        role: "SUPPORT_AGENT" as const,
        decision: "approve",
      }),
    ).toMatchObject({ ok: false, error: "permission_denied" });
    expect(cases.get(link.caseId)!.urls[0].status).toBe("PENDING_REVIEW");

    // Unknown decision codes are refused before anything runs.
    expect(
      await decide({ jobId: job!.id, me: reviewer("a"), reviewerId: "admin-1", role: REVIEWER, decision: "explode" }),
    ).toMatchObject({ ok: false, error: "unknown_decision" });

    // The existing function's own safety rule passes through unchanged: an
    // unknown platform cannot be approved, and the job stays open.
    expect(
      await decide({ jobId: job!.id, me: reviewer("a"), reviewerId: "admin-1", role: REVIEWER, decision: "approve" }),
    ).toMatchObject({ ok: false, error: "unknown_platform_requires_investigation" });
    expect(reviewMemory().jobs.get(job!.id)!.status).toBe("PENDING");

    // The queue's reason flag is enforced on the server.
    expect(
      await decide({ jobId: job!.id, me: reviewer("a"), reviewerId: "admin-1", role: REVIEWER, decision: "reject" }),
    ).toMatchObject({ ok: false, error: "reason_required" });
    const rejected = await decide({
      jobId: job!.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      reasonCode: "not_the_content",
      reasonNote: "Checked twice: not a link to the reported content.",
    });
    expect(rejected).toMatchObject({ ok: true, closed: true });
    // The internal note is stored encrypted and never reaches the row the
    // survivor sees.
    const record = cases.get(link.caseId)!;
    expect(record.urls[0].flagReason ?? null).toBeNull();
    const decision = reviewMemory().decisions.get(job!.id)!;
    expect(decision.reasonNote).not.toContain("Checked twice");
    expect(decision.reasonCode).toBe("not_the_content");
    expect(decision.reasonNote && decryptField(decision.reasonNote)).toBe(
      "Checked twice: not a link to the reported content.",
    );
  });

  it("keeps the job open when the existing function needs a second analyst, and releases the lease", async () => {
    // A distant finding needs two analysts; the first approval is recorded by
    // the existing function only, and the job waits for the second one.
    const finding = seedFinding({ distance: 30 });
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === finding.id)!;
    const firstClaim = await claimNextJob({ queueId: job.queueId, reviewerEmailHash: reviewer("a"), now: NOW });
    expect(firstClaim.job?.id).toBe(job.id);

    const first = await decide({
      jobId: job.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
    });
    expect(first).toMatchObject({ ok: true, closed: false });
    const stored = reviewMemory().jobs.get(job.id)!;
    expect(stored.status).toBe("PENDING");
    expect(stored.claimedBy).toBeNull();
    expect(reviewMemory().decisions.has(job.id)).toBe(false);
    expect(crawlMemory().findings.get(finding.id)!.reviewStatus).toBe("CANDIDATE");
    expect(crawlMemory().findings.get(finding.id)!.reviewedById).toBe("admin-1");

    // The same analyst cannot second their own approval (the existing rule).
    const second = await claimNextJob({
      queueId: stored.queueId,
      reviewerEmailHash: reviewer("a"),
      now: new Date(NOW.getTime() + MINUTE),
    });
    expect(second.job?.id).toBe(job.id);
    const refused = await decide({
      jobId: job.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
      now: new Date(NOW.getTime() + 2 * MINUTE),
    });
    expect(refused).toMatchObject({ ok: false, error: "second_reviewer_required" });
    expect(reviewMemory().jobs.get(job.id)!.status).toBe("PENDING");
  });

  it("decides fingerprints through the existing review and closes the job", async () => {
    const [added] = await addHashesToCase("case-fp", [{ hash: "b".repeat(64), quality: 90 }]);
    if (!added.ok || added.duplicate) throw new Error("expected a new fingerprint");
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === added.submission.id);
    expect(job).toBeTruthy();

    const claimed = await claimNextJob({
      queueId: job!.queueId,
      reviewerEmailHash: reviewer("a"),
      now: new Date(NOW.getTime() + MINUTE),
    });
    expect(claimed.job?.id).toBe(job!.id);
    const result = await decide({
      jobId: job!.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      now: new Date(NOW.getTime() + 2 * MINUTE),
      reasonNote: "Low quality hash.",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    // The existing memory review did the work: the row is no longer
    // PENDING_REVIEW, so a second review through the same function refuses.
    const second = await reviewHashSubmission({
      hashSubmissionId: added.submission.id,
      decision: "reject",
    }).then(
      () => "reviewed",
      (err: Error) => err.message,
    );
    expect(second).toBe("hash_submission_already_reviewed");
  });

  it("decides partner applications through the existing action, and keeps contacted applications open", async () => {
    const application = seedPartnerApplication();
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === application.id);
    expect(job).toBeTruthy();
    const claimed = await claimNextJob({ queueId: job!.queueId, reviewerEmailHash: reviewer("g"), now: NOW });
    expect(claimed.job?.id).toBe(job!.id);

    const contacted = await decide({
      jobId: job!.id,
      me: reviewer("g"),
      reviewerId: "admin-9",
      role: "GO_EDITOR" as const,
      decision: "contacted",
    });
    expect(contacted).toMatchObject({ ok: true, closed: false });
    expect(reviewMemory().jobs.get(job!.id)!.status).toBe("PENDING");
    expect(partnerApplications[0].status).toBe("CONTACTED");

    // "Contacted" released the lease; take it again before declining.
    const reclaimed = await claimNextJob({
      queueId: job!.queueId,
      reviewerEmailHash: reviewer("g"),
      now: new Date(NOW.getTime() + MINUTE),
    });
    expect(reclaimed.job?.id).toBe(job!.id);
    const declined = await decide({
      jobId: job!.id,
      me: reviewer("g"),
      reviewerId: "admin-9",
      role: "GO_EDITOR" as const,
      decision: "decline",
      now: new Date(NOW.getTime() + 2 * MINUTE),
      reasonNote: "Platform not covered.",
    });
    expect(declined).toMatchObject({ ok: true, closed: true });
    expect(partnerApplications[0].status).toBe("DECLINED");
  });

  it("sends a lab report through the existing send and closes the job", async () => {
    const report = seedLabDraft();
    const adapter = await getReviewAdapter("LAB_REPORT");
    expect(adapter?.decisions.map((item) => item.code)).toEqual(["send_email", "send_web_form"]);

    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === report.id);
    expect(job).toBeTruthy();
    const claimed = await claimNextJob({ queueId: job!.queueId, reviewerEmailHash: reviewer("l"), now: NOW });
    expect(claimed.job?.id).toBe(job!.id);

    const result = await decide({
      jobId: job!.id,
      me: reviewer("l"),
      reviewerId: "admin-l",
      role: SUPER,
      decision: "send_web_form",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    expect(labMemory().reports.get(report.id)!.status).toBe("SENT");
  });
});

describe("minor hold", () => {
  it("moves a labelled finding to minor-hold on the next sync, whatever queue held it", async () => {
    const finding = seedFinding();
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === finding.id)!;
    expect((await getReviewQueueByKey("findings"))!.id).toBe(job.queueId);

    // The findings page's own label button (the existing function).
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1" });

    await syncReviewJobs(new Date(NOW.getTime() + MINUTE));
    const moved = reviewMemory().jobs.get(job.id)!;
    expect(moved.queueId).toBe((await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY))!.id);
    expect(moved.status).toBe("PENDING");

    // Only SUPER_ADMIN sees the queue, and the job with it.
    const reviewerSummaries = await queueSummaries({ role: REVIEWER, emailHash: reviewer("a") }, NOW);
    expect(reviewerSummaries.find((queue) => queue.key === MINOR_HOLD_QUEUE_KEY)).toBeUndefined();
    const superSummaries = await queueSummaries({ role: SUPER, emailHash: reviewer("s") }, NOW);
    expect(superSummaries.find((queue) => queue.key === MINOR_HOLD_QUEUE_KEY)?.pending).toBe(1);
  });

  it("closes the job with a possible_minor decision and reopens it in minor-hold", async () => {
    const finding = seedFinding();
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === finding.id)!;
    const claimed = await claimNextJob({ queueId: job.queueId, reviewerEmailHash: reviewer("a"), now: NOW });
    expect(claimed.job?.id).toBe(job.id);

    const result = await decide({
      jobId: job.id,
      me: reviewer("a"),
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "label_possible_minor",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    expect(reviewMemory().decisions.get(job.id)!.decision).toBe("label_possible_minor");
    expect(crawlMemory().findings.get(finding.id)!.reviewStatus).toBe("MINOR_PROTOCOL");

    const open = [...reviewMemory().jobs.values()].filter((item) => item.status === "PENDING");
    expect(open).toHaveLength(1);
    expect(open[0].queueId).toBe((await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY))!.id);
    expect(open[0].enqueueSource).toBe("MOVED");
  });

  it("refuses every decision and every move out of minor-hold", async () => {
    const finding = seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1" });
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === finding.id)!;

    const superAdmin = await claimNextJob({
      queueId: (await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY))!.id,
      reviewerEmailHash: reviewer("s"),
      now: NOW,
    });
    expect(superAdmin.job?.id).toBe(job.id);

    // No decision continues the adult flow from the protected queue.
    expect(
      await decide({
        jobId: job.id,
        me: reviewer("s"),
        reviewerId: "admin-s",
        role: SUPER,
        decision: "approve",
      }),
    ).toMatchObject({ ok: false, error: "minor_hold" });
    expect(
      await decide({
        jobId: job.id,
        me: reviewer("s"),
        reviewerId: "admin-s",
        role: SUPER,
        decision: "label_possible_minor",
      }),
    ).toMatchObject({ ok: false, error: "minor_hold" });

    // And no hand moves it out: only clearing the label (the existing,
    // second-admin flow) brings the subject back, which the sync follows.
    const findingsQueue = await getReviewQueueByKey("findings");
    expect(await moveJob(job.id, reviewer("s"), findingsQueue!.id, { now: NOW })).toMatchObject({
      ok: false,
      error: "minor_hold",
    });

    // Clearing the label through the existing function moves the open job
    // back to the findings queue on the next sync.
    await applyFindingLabel({
      findingId: finding.id,
      action: "clear",
      label: "possibleMinor",
      adminId: "admin-2",
      reason: "Second analyst confirmed an adult; cleared after review.",
    });
    expect(crawlMemory().findings.get(finding.id)!.reviewStatus).toBe("CANDIDATE");
    await syncReviewJobs(new Date(NOW.getTime() + MINUTE));
    expect(reviewMemory().jobs.get(job.id)!.queueId).toBe(findingsQueue!.id);
  });

  it("refuses a move to a queue of another kind", async () => {
    const link = await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === link.urlId)!;
    const fingerprintsQueue = await getReviewQueueByKey("fingerprints");
    expect(await moveJob(job.id, reviewer("a"), fingerprintsQueue!.id, { now: NOW })).toMatchObject({
      ok: false,
      error: "queue_kind_mismatch",
    });
  });
});

describe("no address ever reaches a review row", () => {
  it("keeps URL plaintext out of every job, decision, claim and skip row", async () => {
    const address = "https://forum.example.test/private/address/1";
    const link = await seedFlaggedLink(address);
    await syncReviewJobs(NOW);
    const { job } = await claimLinks(reviewer("a"));
    expect(job).toBeTruthy();
    await skipJob(job!.id, reviewer("a"));
    await claimLinks(reviewer("b"), new Date(NOW.getTime() + MINUTE));
    await decide({
      jobId: job!.id,
      me: reviewer("b"),
      reviewerId: "admin-b",
      role: REVIEWER,
      decision: "reject",
      reasonNote: `Not the reported content at ${address}.`,
      now: new Date(NOW.getTime() + 2 * MINUTE),
    });

    const rows = allReviewRows();
    expect(rows).not.toContain("forum.example.test");
    expect(rows).not.toContain("private/address");
    const decision = reviewMemory().decisions.get(job!.id)!;
    expect(decision.subjectId).toBe(link.urlId);
    expect(decision.reasonNote).not.toContain("forum.example.test");
  });
});

describe("entry points open jobs without waiting for the sync", () => {
  it("opens a job when a flagged link or fingerprint is submitted", async () => {
    const record = await createCase("user-2");
    const { addUrlsToCase } = await import("@/lib/case-ops");
    const [result] = await addUrlsToCase(record.id, ["https://forum.example.test/post/9"], {
      flagReasons: ["many_unrelated_domains"],
    });
    if (!result.ok) throw new Error("expected accepted URL");
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === result.url.id);
    expect(job?.subjectKind).toBe("FLAGGED_LINK");
    expect(job?.caseId).toBe(record.id);

    const [hash] = await addHashesToCase(record.id, [{ hash: "c".repeat(64), quality: 70 }]);
    if (!hash.ok || hash.duplicate) throw new Error("expected a new fingerprint");
    const hashJob = [...reviewMemory().jobs.values()].find((item) => item.subjectId === hash.submission.id);
    expect(hashJob?.subjectKind).toBe("FINGERPRINT");
  });

  it("opens a job when a partner application arrives, and does not fail the sign-up if enqueueing breaks", async () => {
    const { recordPartnerApplication } = await import("@/lib/platform-partners");
    const application = await recordPartnerApplication({
      organisationName: "Example Trust",
      platformName: "Example Forum",
      websiteDomain: "forum.example.test",
      platformType: "FORUM",
      userBase: "UNDER_100K",
      contactName: "Example Contact",
      contactRole: "Trust & Safety",
      contactEmail: "contact@example.test",
      interests: ["FINGERPRINT_ALERTS"],
      message: "Hello",
    });
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === application.id);
    expect(job?.subjectKind).toBe("PARTNER_APPLICATION");
    expect(application.id).toBeTruthy();

    // A broken queue never fails the sign-up: the subject still records.
    const queues = reviewMemory().queues;
    const partnersQueueRow = queues.get("partners")!;
    queues.delete("partners");
    const second = await recordPartnerApplication({
      organisationName: "Second Trust",
      platformName: "Second Forum",
      websiteDomain: "second.example.test",
      platformType: "FORUM",
      userBase: "UNDER_100K",
      contactName: "Second Contact",
      contactRole: "Trust & Safety",
      contactEmail: "contact@second.example.test",
      interests: [],
    });
    expect(second.id).toBeTruthy();
    expect(partnerApplications).toHaveLength(2);
    queues.set("partners", partnersQueueRow);
  });
});

describe("adapters", () => {
  it("registers one adapter per kind, the Lab's through its own module", async () => {
    resetReviewAdapters();
    for (const kind of ["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION", "LAB_REPORT"] as const) {
      expect(await getReviewAdapter(kind), kind).toBeNull();
    }
    const { registerComplaintReviewAdapters, registerReviewAdapter } = await import("@/lib/review-adapters");
    registerComplaintReviewAdapters();
    for (const kind of ["FLAGGED_LINK", "FINGERPRINT", "FINDING", "PARTNER_APPLICATION"] as const) {
      expect((await getReviewAdapter(kind))?.kind, kind).toBe(kind);
    }
    // The Lab side registers through the same seam. Its module registers
    // once per process, so a second registration here models it with a stub.
    const stub = {
      kind: "LAB_REPORT" as const,
      permission: "lab:manage" as const,
      decisions: [],
      listOpenSubjects: async () => [],
      subjectNeedsReview: async () => null,
      decide: async () => ({ ok: false, error: "not_used" }) as const,
    };
    registerReviewAdapter(stub);
    expect(await getReviewAdapter("LAB_REPORT")).toBe(stub);
  });

  it("exposes the existing decisions with today's permissions", async () => {
    expect((await getReviewAdapter("FLAGGED_LINK"))?.decisions.map((item) => item.code)).toEqual(["approve", "reject"]);
    expect((await getReviewAdapter("FINGERPRINT"))?.decisions.map((item) => item.code)).toEqual(["approve", "reject"]);
    expect((await getReviewAdapter("FINDING"))?.decisions.map((item) => item.code)).toEqual([
      "approve",
      "dismiss",
      "label_possible_minor",
    ]);
    expect((await getReviewAdapter("PARTNER_APPLICATION"))?.decisions.map((item) => item.code)).toEqual([
      "contacted",
      "approve",
      "decline",
    ]);
    expect((await getReviewAdapter("FINDING"))?.permission).toBe("findings:review");
    expect((await getReviewAdapter("PARTNER_APPLICATION"))?.permission).toBe("platforms:edit");
  });
});
