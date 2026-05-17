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

import { db } from "@/lib/db";
import { processEscalationJob } from "@/jobs/escalation-worker";
import { runDueEscalationsFromDb } from "@/lib/escalation-engine";

type NoticeRow = {
  id: string;
  sentAt: Date | null;
  escalationLevel: number;
  responseType: string | null;
  submittedUrl: { id: string; caseId: string; status: string };
};

function noticeRow(overrides: Partial<NoticeRow> = {}): NoticeRow {
  return {
    id: "notice-1",
    sentAt: new Date("2026-05-10T00:00:00.000Z"),
    escalationLevel: 0,
    responseType: null,
    submittedUrl: { id: "url-1", caseId: "case-1", status: "NOTICE_SENT" },
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

  it("fires the highest due level for a notice past its window", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-12T00:00:00.000Z"); // 48h after sentAt

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.swept).toBe(1);
    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 2, action: "victim_notification" }]);
    expect(summary.errors).toHaveLength(0);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(processEscalationJob).toHaveBeenCalledWith({ caseId: "case-1", urlId: "url-1" }, 2);
  });

  it("skips notices whose URL has reached a terminal state", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ submittedUrl: { id: "url-1", caseId: "case-1", status: "REMOVED" } }),
    ] as never);
    const now = new Date("2026-05-20T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toHaveLength(0);
    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "stopped" }]);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(processEscalationJob).not.toHaveBeenCalled();
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

  it("advances level 1 only at the 24h boundary", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-11T00:00:00.000Z"); // exactly 24h

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 1, action: "email_follow_up" }]);
  });
});
