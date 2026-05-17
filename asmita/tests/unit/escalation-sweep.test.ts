import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findMany: vi.fn(), update: vi.fn() },
    escalation: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/jobs/escalation-worker", () => ({
  processEscalationJob: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

vi.mock("@/lib/notice-dispatch", () => ({
  dispatchEscalationFollowUp: vi.fn().mockResolvedValue({ dispatched: true, notice: { messageId: "mock" } }),
}));

import { db } from "@/lib/db";
import { processEscalationJob } from "@/jobs/escalation-worker";
import { writeAuditLog } from "@/lib/audit";
import { dispatchEscalationFollowUp } from "@/lib/notice-dispatch";
import { runDueEscalationsFromDb } from "@/lib/escalation-engine";

type NoticeRow = {
  id: string;
  sentAt: Date | null;
  escalationLevel: number;
  responseType: string | null;
  templateId: string | null;
  submittedUrl: {
    id: string;
    caseId: string;
    status: string;
    domain: string;
    platform: {
      name: string;
      grievanceEmail: string | null;
      lastContactVerifiedByHuman: boolean;
    } | null;
    case: { referenceNumber: string };
  };
  template: {
    bodyTemplate: string;
    subjectTemplate: string;
    reviewedByLegal: boolean;
  } | null;
};

function noticeRow(overrides: Partial<NoticeRow> = {}): NoticeRow {
  return {
    id: "notice-1",
    sentAt: new Date("2026-05-10T00:00:00.000Z"),
    escalationLevel: 0,
    responseType: null,
    templateId: "tmpl-1",
    submittedUrl: {
      id: "url-1",
      caseId: "case-1",
      status: "NOTICE_SENT",
      domain: "platform.com",
      platform: {
        name: "Platform Inc",
        grievanceEmail: "go@platform.com",
        lastContactVerifiedByHuman: true,
      },
      case: { referenceNumber: "ASMITA-2026-00042" },
    },
    template: {
      bodyTemplate:
        "Dear {{platformName}} GO, takedown for case {{caseReference}} URL {{url}} declaration {{declarationReference}}.",
      subjectTemplate: "Takedown for {{caseReference}}",
      reviewedByLegal: true,
    },
    ...overrides,
  };
}

describe("runDueEscalationsFromDb", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires L2 with audit-only worker when the 48h boundary has passed", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-12T00:00:00.000Z"); // 48h after sentAt

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.swept).toBe(1);
    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 2, action: "victim_notification" }]);
    expect(summary.errors).toHaveLength(0);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(processEscalationJob).toHaveBeenCalledWith({ caseId: "case-1", urlId: "url-1" }, 2);
    // L1 follow-up dispatcher should NOT fire when L2 is the highest due level
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
  });

  it("skips notices whose URL has reached a terminal state", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        submittedUrl: {
          ...noticeRow().submittedUrl,
          status: "REMOVED",
        },
      }),
    ] as never);
    const now = new Date("2026-05-20T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toHaveLength(0);
    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "stopped" }]);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(processEscalationJob).not.toHaveBeenCalled();
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
  });

  it("skips notices whose platform responded ACKNOWLEDGED", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ responseType: "ACKNOWLEDGED" }),
    ] as never);
    const now = new Date("2026-05-20T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "stopped" }]);
  });

  it("does nothing when no notices qualify", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([] as never);

    const summary = await runDueEscalationsFromDb(new Date("2026-05-12T00:00:00.000Z"));

    expect(summary).toEqual({ swept: 0, fired: [], skipped: [], errors: [] });
  });

  it("records errors per notice without aborting the sweep", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ id: "notice-a" }),
      noticeRow({ id: "notice-b" }),
    ] as never);
    vi.mocked(db.$transaction)
      .mockRejectedValueOnce(new Error("constraint violation"))
      .mockResolvedValueOnce([] as never);
    const now = new Date("2026-05-12T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.swept).toBe(2);
    expect(summary.fired).toHaveLength(1);
    expect(summary.errors).toEqual([{ noticeId: "notice-a", error: "constraint violation" }]);
  });
});

describe("runDueEscalationsFromDb — L1 follow-up", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches a verbatim-body follow-up with a [Follow-up #1] subject prefix at 24h", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-11T00:00:00.000Z"); // exactly 24h

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 1, action: "email_follow_up" }]);
    expect(dispatchEscalationFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        urlId: "url-1",
        level: 1,
        recipientEmail: "go@platform.com",
        subject: "[Follow-up #1] Takedown for ASMITA-2026-00042",
        body: expect.stringContaining("case ASMITA-2026-00042"),
      }),
    );
    // Body must be rendered from the original template, not synthesized
    const call = vi.mocked(dispatchEscalationFollowUp).mock.calls[0][0];
    expect(call.body).toContain("Dear Platform Inc GO");
  });

  it("blocks L1 send when the template is not legally reviewed and records NOTICE_FAILED", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ template: { ...noticeRow().template!, reviewedByLegal: false } }),
    ] as never);
    const now = new Date("2026-05-11T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toHaveLength(0);
    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_legal_review", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    // Critically: the level was NOT bumped. Next sweep will re-check once
    // legal flips the flag.
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ reason: "template_not_legal_reviewed", escalationLevel: 1 }),
      }),
    );
  });

  it("blocks L1 send when the platform recipient is not human-verified", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        submittedUrl: {
          ...noticeRow().submittedUrl,
          platform: { name: "Platform Inc", grievanceEmail: null, lastContactVerifiedByHuman: false },
        },
      }),
    ] as never);
    const now = new Date("2026-05-11T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_no_recipient", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks L1 send when no template is attached to the notice", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow({ template: null })] as never);
    const now = new Date("2026-05-11T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_no_template", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
  });
});
