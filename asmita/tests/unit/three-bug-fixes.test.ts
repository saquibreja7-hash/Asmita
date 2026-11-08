import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The three bugs found while building the admin console:
// 1. a sent notice never moved its link to NOTICE_SENT;
// 2. reviewing a link did not check it was still waiting for review;
// 3. survivor feedback lived only in the Worker's memory.

vi.mock("@/lib/db", () => ({
  db: {
    notice: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: unknown) => ({ op: "notice.create", args })),
    },
    submittedUrl: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn((args: unknown) => ({ op: "submittedUrl.updateMany", args })),
    },
    feedback: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/email", () => ({
  sendNoticeDraft: vi.fn().mockResolvedValue({ id: "resend-message-1" }),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

vi.mock("@/lib/encryption", () => ({
  encryptField: vi.fn((value: string) => `enc:${value}`),
}));

import { db } from "@/lib/db";
import { dispatchedFollowUps, dispatchedNotices, dispatchEscalationFollowUp, dispatchTier2Notice } from "@/lib/notice-dispatch";
import { reviewSubmittedUrl } from "@/lib/case-ops";
import { listFeedbackRatings, recordFeedback } from "@/lib/feedback";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as {
  notice: { findFirst: Mock; create: Mock };
  submittedUrl: { findFirst: Mock; findUniqueOrThrow: Mock; updateMany: Mock };
  feedback: { create: Mock; findMany: Mock };
  $transaction: Mock;
};

describe("a sent notice moves its link to sent", () => {
  beforeEach(() => {
    vi.stubEnv("NOTICE_DISPATCH_PERSISTENCE", "database");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    dispatchedNotices.clear();
    dispatchedFollowUps.clear();
  });

  it("records the notice and moves an approved link to NOTICE_SENT in one transaction", async () => {
    await dispatchTier2Notice({
      caseId: "c1",
      urlId: "u1",
      recipientEmail: "grievance@platform.example",
      subject: "Notice",
      body: "Body",
    });

    expect(mocked.$transaction).toHaveBeenCalledTimes(1);
    const [ops] = mocked.$transaction.mock.calls[0];
    expect(ops[0]).toMatchObject({ op: "notice.create", args: { data: { urlId: "u1", followUpOf: null } } });
    // Only an approved link moves; a removed one keeps its status.
    expect(ops[1]).toEqual({
      op: "submittedUrl.updateMany",
      args: { where: { id: "u1", status: "NOTICE_QUEUED" }, data: { status: "NOTICE_SENT" } },
    });
  });

  it("leaves the link alone for a follow-up", async () => {
    await dispatchEscalationFollowUp({
      caseId: "c1",
      urlId: "u1",
      level: 1,
      recipientEmail: "grievance@platform.example",
      subject: "Follow-up",
      body: "Body",
      noticeId: "n1",
    });

    expect(mocked.notice.create).toHaveBeenCalledTimes(1);
    expect(mocked.$transaction).not.toHaveBeenCalled();
    expect(mocked.submittedUrl.updateMany).not.toHaveBeenCalled();
  });
});

describe("reviewing a link only decides links still waiting", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(["REJECTED", "NOTICE_SENT", "REMOVED"])("refuses to re-decide a %s link", async (status) => {
    mocked.submittedUrl.findFirst.mockResolvedValue({ id: "u1", caseId: "c1", status, flaggedForReview: false, platformId: "p1" });

    await expect(
      reviewSubmittedUrl({ caseId: "c1", urlId: "u1", decision: "approve", reviewerId: "admin-1" }),
    ).rejects.toThrow("not_awaiting_review");
    expect(mocked.submittedUrl.updateMany).not.toHaveBeenCalled();
  });

  it("guards the update itself, so a concurrent decision wins only once", async () => {
    mocked.submittedUrl.findFirst.mockResolvedValue({
      id: "u1",
      caseId: "c1",
      status: "PENDING_REVIEW",
      flaggedForReview: true,
      platformId: "p1",
    });
    mocked.submittedUrl.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      reviewSubmittedUrl({ caseId: "c1", urlId: "u1", decision: "approve", reviewerId: "admin-1" }),
    ).rejects.toThrow("not_awaiting_review");
    expect(mocked.submittedUrl.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        caseId: "c1",
        OR: [{ status: "PENDING_REVIEW" }, { flaggedForReview: true, status: "NOTICE_QUEUED" }],
      },
      data: { status: "NOTICE_QUEUED", flaggedForReview: false, flagReason: null },
    });
  });

  it("approves a flagged queued link", async () => {
    const link = { id: "u1", caseId: "c1", status: "NOTICE_QUEUED", flaggedForReview: true, platformId: "p1", domain: "x.com", urlHash: "h", flagReason: null };
    mocked.submittedUrl.findFirst.mockResolvedValue(link);
    mocked.submittedUrl.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.submittedUrl.findUniqueOrThrow.mockResolvedValue({ ...link, flaggedForReview: false });

    const reviewed = await reviewSubmittedUrl({ caseId: "c1", urlId: "u1", decision: "approve", reviewerId: "admin-1" });
    expect(reviewed.status).toBe("NOTICE_QUEUED");
  });
});

describe("feedback is stored in the database", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    mocked.feedback.create.mockResolvedValue({ id: "f1", createdAt: new Date("2026-11-09T00:00:00.000Z") });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("stores the rating, the reference as text and the comment encrypted", async () => {
    const record = await recordFeedback({ rating: 4, caseReference: "ASMITA-2026-ABCDEF", comment: "  Helpful  " });

    expect(mocked.feedback.create).toHaveBeenCalledWith({
      data: { rating: 4, caseReference: "ASMITA-2026-ABCDEF", comment: "enc:Helpful" },
      select: { id: true, createdAt: true },
    });
    expect(record).toMatchObject({ id: "f1", rating: 4 });
  });

  it("stores no comment when there is none, and rejects links before storing", async () => {
    await recordFeedback({ rating: 2, comment: "   " });
    expect(mocked.feedback.create.mock.calls[0][0].data.comment).toBeNull();

    await expect(recordFeedback({ rating: 2, comment: "see https://example.invalid/x" })).rejects.toThrow(
      "feedback_url_not_allowed",
    );
    expect(mocked.feedback.create).toHaveBeenCalledTimes(1);
  });

  it("reads ratings only for analytics", async () => {
    mocked.feedback.findMany.mockResolvedValue([{ rating: 5 }]);
    expect(await listFeedbackRatings()).toEqual([{ rating: 5 }]);
    expect(mocked.feedback.findMany).toHaveBeenCalledWith({ select: { rating: true } });
  });
});
