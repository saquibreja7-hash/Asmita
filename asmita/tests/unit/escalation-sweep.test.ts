import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findMany: vi.fn(), update: vi.fn() },
    escalation: { create: vi.fn() },
    case: { update: vi.fn() },
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

vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn((payload: string) => `victim@example.com:${payload}`),
}));

vi.mock("@/lib/email", () => ({
  sendL2VictimNotification: vi.fn().mockResolvedValue({ id: "msg-l2" }),
  sendL3FirReadyNotification: vi.fn().mockResolvedValue({ id: "msg-l3" }),
}));

import { db } from "@/lib/db";
import { processEscalationJob } from "@/jobs/escalation-worker";
import { writeAuditLog } from "@/lib/audit";
import { dispatchEscalationFollowUp } from "@/lib/notice-dispatch";
import { decryptField } from "@/lib/encryption";
import { sendL2VictimNotification, sendL3FirReadyNotification } from "@/lib/email";
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
    case: {
      id: string;
      referenceNumber: string;
      user: {
        id: string;
        emailEncrypted: string;
        preferredLocale: string | null;
      } | null;
    };
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
      case: {
        id: "case-1",
        referenceNumber: "ASMITA-2026-00042",
        user: {
          id: "user-1",
          emailEncrypted: "iv:tag:ciphertext",
          preferredLocale: null,
        },
      },
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

  it("fires L2 victim notification when the 48h boundary has passed", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-12T00:00:00.000Z"); // 48h after sentAt

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.swept).toBe(1);
    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 2, action: "victim_notification" }]);
    expect(summary.errors).toHaveLength(0);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(processEscalationJob).toHaveBeenCalledWith({ caseId: "case-1", urlId: "url-1" }, 2);
    expect(sendL2VictimNotification).toHaveBeenCalledOnce();
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

describe("runDueEscalationsFromDb — L2 victim notification", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
    vi.mocked(decryptField).mockImplementation((payload: string) => `victim@example.com:${payload}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("decrypts the user's email and sends a victim notification at 48h", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-12T00:00:00.000Z"); // 48h after sentAt

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 2, action: "victim_notification" }]);
    expect(decryptField).toHaveBeenCalledWith("iv:tag:ciphertext");
    expect(sendL2VictimNotification).toHaveBeenCalledWith(
      "victim@example.com:iv:tag:ciphertext",
      "ASMITA-2026-00042",
      expect.stringContaining("/case/case-1"),
      "en",
    );
  });

  it("respects preferredLocale=hi when present", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        submittedUrl: {
          ...noticeRow().submittedUrl,
          case: {
            ...noticeRow().submittedUrl.case,
            user: { id: "user-1", emailEncrypted: "iv:tag:ciphertext", preferredLocale: "hi" },
          },
        },
      }),
    ] as never);
    const now = new Date("2026-05-12T00:00:00.000Z");

    await runDueEscalationsFromDb(now);

    expect(sendL2VictimNotification).toHaveBeenCalledWith(
      expect.any(String),
      "ASMITA-2026-00042",
      expect.any(String),
      "hi",
    );
  });

  it("blocks L2 send when the user record is missing", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        submittedUrl: {
          ...noticeRow().submittedUrl,
          case: { id: "case-1", referenceNumber: "ASMITA-2026-00042", user: null },
        },
      }),
    ] as never);
    const now = new Date("2026-05-12T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_no_user", level: 2 }]);
    expect(sendL2VictimNotification).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ reason: "user_missing", escalationLevel: 2 }),
      }),
    );
  });

  it("blocks L2 send when email decryption throws", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    vi.mocked(decryptField).mockImplementation(() => {
      throw new Error("Invalid encrypted payload.");
    });
    const now = new Date("2026-05-12T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_decrypt_failed", level: 2 }]);
    expect(sendL2VictimNotification).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ reason: "email_decrypt_failed", escalationLevel: 2 }),
      }),
    );
  });
});

describe("runDueEscalationsFromDb — L3 FIR ready", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
    vi.mocked(decryptField).mockImplementation((payload: string) => `victim@example.com:${payload}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends the FIR-ready email and includes the case update in the transaction at the 7-day boundary", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow({ escalationLevel: 2 })] as never);
    const now = new Date("2026-05-17T00:00:00.000Z"); // 7d after sentAt

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 3, action: "fir_package" }]);
    expect(sendL3FirReadyNotification).toHaveBeenCalledWith(
      "victim@example.com:iv:tag:ciphertext",
      "ASMITA-2026-00042",
      expect.stringContaining("/case/case-1"),
      expect.stringContaining("/api/cases/case-1/export"),
      "en",
    );
    // Transaction must include the case.firPackageGeneratedAt update
    const txArg = vi.mocked(db.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(txArg).toHaveLength(3);
  });

  it("does NOT include the case update in the transaction for L1 or L2 fires", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    const now = new Date("2026-05-12T00:00:00.000Z"); // 48h - L2

    await runDueEscalationsFromDb(now);

    const txArg = vi.mocked(db.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(txArg).toHaveLength(2);
    expect(db.case.update).not.toHaveBeenCalled();
  });

  it("blocks L3 send when the user record is missing", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        escalationLevel: 2,
        submittedUrl: {
          ...noticeRow().submittedUrl,
          case: { id: "case-1", referenceNumber: "ASMITA-2026-00042", user: null },
        },
      }),
    ] as never);
    const now = new Date("2026-05-17T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_no_user", level: 3 }]);
    expect(sendL3FirReadyNotification).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ reason: "user_missing", escalationLevel: 3 }),
      }),
    );
  });
});
