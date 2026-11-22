import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP140's single most important rule, verified per adapter: every decision
// reaches the existing library function with the arguments today's routes
// pass (spies), the adapter's permission is enforced before anything runs,
// and the existing function's refusal passes through unchanged with the job
// left open. Placeholder ids throughout; no address is ever read here.

vi.mock("@/lib/case-ops", () => ({
  isAwaitingReview: (url: { status: string; flaggedForReview?: boolean | null }) =>
    url.status === "PENDING_REVIEW" || (Boolean(url.flaggedForReview) && url.status === "NOTICE_QUEUED"),
  reviewSubmittedUrl: vi.fn(),
}));
vi.mock("@/lib/hash-submission", () => ({
  reviewHashSubmission: vi.fn(),
  listHashReviewQueue: vi.fn(async () => []),
}));
vi.mock("@/lib/case-hash-annex", () => ({ voidSignaturesWithRejectedFingerprints: vi.fn() }));
vi.mock("@/lib/hash-dispatch", () => ({ dispatchHashAdvisories: vi.fn() }));
vi.mock("@/lib/crawler-auth", () => ({ crawlerEnabled: () => process.env.ENABLE_CRAWLER === "true" }));
vi.mock("@/lib/crawl-findings", () => ({
  applyFindingLabel: vi.fn(),
  reviewCrawlFinding: vi.fn(),
  listCrawlFindings: vi.fn(async () => []),
  getCrawlFindingSummary: vi.fn(async () => null),
}));
vi.mock("@/lib/partner-admin", () => ({ actOnPartnerApplication: vi.fn() }));
vi.mock("@/lib/platform-partners", () => ({ listPartnerApplications: vi.fn(async () => []) }));
vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: { findUnique: vi.fn() },
    case: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/lab/lab-reports", () => ({
  listLabReports: vi.fn(async () => []),
  getLabReport: vi.fn(async () => null),
  sendLabReport: vi.fn(),
}));

import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { reviewSubmittedUrl } from "@/lib/case-ops";
import { reviewHashSubmission } from "@/lib/hash-submission";
import { voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { applyFindingLabel, reviewCrawlFinding } from "@/lib/crawl-findings";
import { actOnPartnerApplication } from "@/lib/partner-admin";
import { getReviewAdapter, type ReviewDecisionCtx } from "@/lib/review-adapters";
import { sendLabReport } from "@/lib/lab/lab-reports";
import {
  claimNextJob,
  decideJob,
  getReviewQueueByKey,
  resetReviewMemory,
  reviewMemory,
  syncReviewJobs,
} from "@/lib/review-jobs";

const NOW = new Date("2026-11-22T10:00:00Z");
const REVIEWER = "CASE_REVIEWER" as const;
const GO_EDITOR = "GO_EDITOR" as const;

function ctx(role: ReviewDecisionCtx["role"], caseId: string | null = null): ReviewDecisionCtx {
  return { reviewerId: "admin-1", reviewerEmailHash: "hash-a", role, caseId };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("ENABLE_LAB", "true");
  resetReviewMemory();
  cases.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Seeds one flagged link and claims its job for reviewer "hash-a". */
async function claimedFlaggedLinkJob() {
  const record = await createCase("user-1");
  const [added] = await storeAddUrls(record.id, ["https://forum.example.test/post/1"], {
    flagReasons: ["many_unrelated_domains"],
  });
  if (!added.ok) throw new Error("expected accepted URL");
  await syncReviewJobs(NOW);
  const queue = await getReviewQueueByKey("links");
  const claimed = await claimNextJob({ queueId: queue!.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
  if (!claimed.job) throw new Error("expected a job");
  return { caseId: record.id, urlId: added.url.id, jobId: claimed.job.id };
}

describe("the flagged-link adapter", () => {
  it("approves through reviewSubmittedUrl with today's arguments", async () => {
    const seeded = await claimedFlaggedLinkJob();
    vi.mocked(reviewSubmittedUrl).mockResolvedValue({} as never);

    const result = await decideJob({
      jobId: seeded.jobId,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    expect(reviewSubmittedUrl).toHaveBeenCalledWith({
      caseId: seeded.caseId,
      urlId: seeded.urlId,
      decision: "approve",
      reviewerId: "admin-1",
    });
    // The console's reasons are internal: nothing is passed as the
    // survivor-visible flagReason, exactly like the page's one-click buttons.
    expect(vi.mocked(reviewSubmittedUrl).mock.calls[0]![0]).not.toHaveProperty("reason");
  });

  it("refuses a role without cases:review before the existing function runs", async () => {
    const seeded = await claimedFlaggedLinkJob();
    const result = await decideJob({
      jobId: seeded.jobId,
      me: "hash-a",
      reviewerId: "admin-1",
      role: "LEGAL_ADVISOR" as const,
      decision: "approve",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, error: "permission_denied" });
    expect(reviewSubmittedUrl).not.toHaveBeenCalled();
    expect(reviewMemory().jobs.get(seeded.jobId)!.status).toBe("PENDING");
  });

  it("passes the existing function's refusal through unchanged", async () => {
    const seeded = await claimedFlaggedLinkJob();
    vi.mocked(reviewSubmittedUrl).mockRejectedValue(new Error("unknown_platform_requires_investigation"));

    const result = await decideJob({
      jobId: seeded.jobId,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "approve",
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "unknown_platform_requires_investigation" });
    expect(reviewMemory().jobs.get(seeded.jobId)!.status).toBe("PENDING");
    expect(reviewMemory().decisions.size).toBe(0);
  });
});

describe("the fingerprint adapter", () => {
  it("rejects through reviewHashSubmission and voids the signatures that listed it", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    vi.mocked(reviewHashSubmission).mockResolvedValue({} as never);
    const adapter = (await getReviewAdapter("FINGERPRINT"))!;

    const result = await adapter.decide("hash-1", "reject", ctx(REVIEWER, "case-1"));
    expect(result).toMatchObject({ ok: true, resolved: true });
    expect(reviewHashSubmission).toHaveBeenCalledWith({
      hashSubmissionId: "hash-1",
      decision: "reject",
      reviewerId: "admin-1",
    });
    expect(voidSignaturesWithRejectedFingerprints).toHaveBeenCalledWith("case-1", {
      trigger: "rejection",
      actorId: "admin-1",
    });
  });

  it("approves through reviewHashSubmission and sends the signed advisory, as the approve route does", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    vi.mocked(reviewHashSubmission).mockResolvedValue({} as never);
    const { db } = await import("@/lib/db");
    vi.mocked(db.case.findUnique).mockResolvedValue({
      signedHashAdvisoryPdf: "pdf",
      hashAdvisoryPlatformIds: ["platform-1", "platform-1"],
    } as never);
    vi.mocked(dispatchHashAdvisories).mockResolvedValue([] as never);
    const adapter = (await getReviewAdapter("FINGERPRINT"))!;

    const result = await adapter.decide("hash-1", "approve", ctx(REVIEWER, "case-1"));
    expect(result).toMatchObject({ ok: true, resolved: true });
    expect(dispatchHashAdvisories).toHaveBeenCalledWith({
      caseId: "case-1",
      platformIds: ["platform-1"],
      actorId: "admin-1",
    });
  });

  it("refuses while hash upload is off, and a role without cases:review", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    vi.stubEnv("ENABLE_HASH_UPLOAD", "false");
    const adapter = (await getReviewAdapter("FINGERPRINT"))!;
    expect(await adapter.decide("hash-1", "approve", ctx(REVIEWER, "case-1"))).toMatchObject({
      ok: false,
      error: "hash_upload_disabled",
    });

    vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
    expect(await adapter.decide("hash-1", "approve", ctx("SUPPORT_AGENT" as const, "case-1"))).toMatchObject({
      ok: false,
      error: "permission_denied",
    });
    expect(reviewHashSubmission).not.toHaveBeenCalled();
  });
});

describe("the finding adapter", () => {
  it("reviews through reviewCrawlFinding and keeps the job open for the second analyst", async () => {
    const adapter = (await getReviewAdapter("FINDING"))!;
    vi.mocked(reviewCrawlFinding).mockResolvedValue({ ok: true, status: "AWAITING_SECOND_REVIEW" } as never);

    const result = await adapter.decide("finding-1", "approve", ctx(REVIEWER, "case-1"));
    expect(result).toMatchObject({ ok: true, resolved: false });
    expect(reviewCrawlFinding).toHaveBeenCalledWith({
      findingId: "finding-1",
      decision: "approve",
      reviewerId: "admin-1",
    });
  });

  it("sets the possible-minor label through applyFindingLabel and asks for minor-hold", async () => {
    const adapter = (await getReviewAdapter("FINDING"))!;
    vi.mocked(applyFindingLabel).mockResolvedValue({ ok: true, changed: true } as never);

    const result = await adapter.decide("finding-1", "label_possible_minor", ctx(REVIEWER, "case-1"));
    expect(result).toMatchObject({ ok: true, resolved: true, requeueKey: "minor-hold" });
    expect(applyFindingLabel).toHaveBeenCalledWith({
      findingId: "finding-1",
      action: "set",
      label: "possibleMinor",
      adminId: "admin-1",
    });
  });

  it("refuses while the crawler is off, and a role without findings:review", async () => {
    const adapter = (await getReviewAdapter("FINDING"))!;
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect(await adapter.decide("finding-1", "approve", ctx(REVIEWER, "case-1"))).toMatchObject({
      ok: false,
      error: "crawler_disabled",
    });

    vi.stubEnv("ENABLE_CRAWLER", "true");
    expect(await adapter.decide("finding-1", "approve", ctx(GO_EDITOR, "case-1"))).toMatchObject({
      ok: false,
      error: "permission_denied",
    });
    expect(reviewCrawlFinding).not.toHaveBeenCalled();
  });
});

describe("the partner-application adapter", () => {
  it("acts through actOnPartnerApplication: contacted stays open, a decision closes", async () => {
    const adapter = (await getReviewAdapter("PARTNER_APPLICATION"))!;
    vi.mocked(actOnPartnerApplication).mockResolvedValue({ ok: true, status: "CONTACTED" } as never);
    expect(await adapter.decide("application-1", "contacted", ctx(GO_EDITOR))).toMatchObject({
      ok: true,
      resolved: false,
    });

    vi.mocked(actOnPartnerApplication).mockResolvedValue({ ok: true, status: "DECLINED" } as never);
    expect(await adapter.decide("application-1", "decline", ctx(GO_EDITOR))).toMatchObject({
      ok: true,
      resolved: true,
    });
    expect(actOnPartnerApplication).toHaveBeenCalledWith({ applicationId: "application-1", action: "decline" }, "admin-1");
  });

  it("refuses a role without platforms:edit, and passes the existing error through", async () => {
    const adapter = (await getReviewAdapter("PARTNER_APPLICATION"))!;
    expect(await adapter.decide("application-1", "approve", ctx(REVIEWER))).toMatchObject({
      ok: false,
      error: "permission_denied",
    });

    vi.mocked(actOnPartnerApplication).mockResolvedValue({ ok: false, error: "partner_exists" } as never);
    expect(await adapter.decide("application-1", "approve", ctx(GO_EDITOR))).toEqual({
      ok: false,
      error: "partner_exists",
    });
    expect(actOnPartnerApplication).toHaveBeenCalled();
  });
});

describe("the Lab adapter (registered from the Lab side)", () => {
  it("sends through sendLabReport with the page's own prefill rule", async () => {
    const adapter = await getReviewAdapter("LAB_REPORT");
    expect(adapter).not.toBeNull();

    vi.mocked(sendLabReport).mockResolvedValue({ ok: true, report: {}, messageId: null } as never);
    const result = await adapter!.decide("report-1", "send_web_form", ctx("SUPER_ADMIN" as const));
    expect(result).toMatchObject({ ok: true, resolved: true });
    expect(sendLabReport).toHaveBeenCalledWith("report-1", { channel: "WEB_FORM" }, "admin-1");

    const { getLabReport } = await import("@/lib/lab/lab-reports");
    vi.mocked(getLabReport).mockResolvedValue({
      id: "report-1",
      status: "DRAFT",
      abuseContact: "abuse@example.test",
    } as never);
    await adapter!.decide("report-1", "send_email", ctx("SUPER_ADMIN" as const));
    expect(sendLabReport).toHaveBeenCalledWith("report-1", { channel: "EMAIL", to: "abuse@example.test" }, "admin-1");
  });

  it("refuses a role without lab:manage and a chokepoint without an email address", async () => {
    const adapter = (await getReviewAdapter("LAB_REPORT"))!;
    expect(await adapter.decide("report-1", "send_web_form", ctx(GO_EDITOR))).toMatchObject({
      ok: false,
      error: "permission_denied",
    });
    expect(sendLabReport).not.toHaveBeenCalled();

    const { getLabReport } = await import("@/lib/lab/lab-reports");
    vi.mocked(getLabReport).mockResolvedValue({
      id: "report-1",
      status: "DRAFT",
      abuseContact: "https://example.test/form",
    } as never);
    expect(await adapter.decide("report-1", "send_email", ctx("SUPER_ADMIN" as const))).toMatchObject({
      ok: false,
      error: "no_abuse_email",
    });
  });
});
