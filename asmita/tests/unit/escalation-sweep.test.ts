import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findMany: vi.fn(), update: vi.fn() },
    noticeTemplate: { findFirst: vi.fn() },
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
import { templateDigest } from "@/lib/signed-template";

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
    signedTemplateDigest?: string | null;
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

  it("does not chase a platform that acknowledged, but still tells the survivor her next steps", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ responseType: "ACKNOWLEDGED" }),
    ] as never);

    // At 24h the platform follow-up is skipped once, not retried every hour.
    const first = await runDueEscalationsFromDb(new Date("2026-05-11T00:00:00.000Z"));
    expect(first.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_platform_answered", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledOnce();

    // At 48h the survivor email still goes out.
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ responseType: "ACKNOWLEDGED", escalationLevel: 1 }),
    ] as never);
    const later = await runDueEscalationsFromDb(new Date("2026-05-12T01:00:00.000Z"));
    expect(later.fired).toEqual([{ noticeId: "notice-1", level: 2, action: "victim_notification" }]);
  });

  it("only sweeps original notices, never their follow-up rows", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([] as never);
    await runDueEscalationsFromDb(new Date("2026-05-20T00:00:00.000Z"));
    expect(vi.mocked(db.notice.findMany).mock.calls[0][0]).toMatchObject({ where: { followUpOf: null } });
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

const cover = {
  bodyTemplate: "Follow-up to {{platformName}}: complaint {{caseReference}} served on {{originalSentAt}}.",
  subjectTemplate: "Follow-up: {{caseReference}}",
  reviewedByLegal: true,
};

describe("runDueEscalationsFromDb — L1 follow-up", () => {
  beforeEach(() => {
    vi.mocked(db.$transaction).mockImplementation(async () => []);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(cover as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches the reviewed covering letter followed by the original complaint text at 24h", async () => {
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
        subject: "Follow-up: ASMITA-2026-00042",
        body: expect.stringContaining("case ASMITA-2026-00042"),
      }),
    );
    // Cover first, then the complaint rendered from its own template, unchanged.
    const call = vi.mocked(dispatchEscalationFollowUp).mock.calls[0][0];
    expect(call.body).toBe(
      "Follow-up to Platform Inc: complaint ASMITA-2026-00042 served on 10 May 2026 at 5:30 am IST.\n\n" +
        "Dear Platform Inc GO, takedown for case ASMITA-2026-00042 URL platform.com declaration ASMITA-2026-00042.",
    );
    expect(vi.mocked(db.noticeTemplate.findFirst).mock.calls[0][0]).toMatchObject({
      where: { templateType: "ESCALATION_L1", isActive: true },
    });
  });

  it("holds the follow-up until its covering letter is legally reviewed, and retries", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue({ ...cover, reviewedByLegal: false } as never);

    const summary = await runDueEscalationsFromDb(new Date("2026-05-11T00:00:00.000Z"));

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_legal_review", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "follow_up_cover_not_legal_reviewed" }) }),
    );
  });

  it("holds the follow-up when no covering letter exists", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow()] as never);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(null as never);

    const summary = await runDueEscalationsFromDb(new Date("2026-05-11T00:00:00.000Z"));

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_legal_review", level: 1 }]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "follow_up_cover_missing" }) }),
    );
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
    // Nothing is sent and the level is not bumped: once legal review is done,
    // the next sweep sends the follow-up.
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
    // Retried once the contact is verified.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("holds the follow-up, visibly, when the template text changed since it was signed and sent", async () => {
    const sent = noticeRow();
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({
        submittedUrl: { ...sent.submittedUrl, signedTemplateDigest: templateDigest({ ...sent.template!, bodyTemplate: "The text that was served" }) },
      }),
    ] as never);

    const summary = await runDueEscalationsFromDb(new Date("2026-05-11T00:00:00.000Z"));

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_template_changed", level: 1 }]);
    expect(summary.errors).toHaveLength(0);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    // Not marked done: the case page shows the held step (NOTICE_FAILED, level 1).
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        entityId: "notice-1",
        data: { reason: "template_changed_since_sent", escalationLevel: 1 },
      }),
    );
  });

  it("sends the follow-up when the template text is still the text that was signed", async () => {
    const sent = noticeRow();
    vi.mocked(db.notice.findMany).mockResolvedValue([
      noticeRow({ submittedUrl: { ...sent.submittedUrl, signedTemplateDigest: templateDigest(sent.template!) } }),
    ] as never);

    const summary = await runDueEscalationsFromDb(new Date("2026-05-11T00:00:00.000Z"));

    expect(summary.fired).toEqual([{ noticeId: "notice-1", level: 1, action: "email_follow_up" }]);
    expect(dispatchEscalationFollowUp).toHaveBeenCalledOnce();
  });

  it("blocks L1 send when no template is attached to the notice", async () => {
    vi.mocked(db.notice.findMany).mockResolvedValue([noticeRow({ template: null })] as never);
    const now = new Date("2026-05-11T00:00:00.000Z");

    const summary = await runDueEscalationsFromDb(now);

    expect(summary.skipped).toEqual([{ noticeId: "notice-1", reason: "blocked_no_template", level: 1 }]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    // A notice with no template on record can never send it: skipped once.
    expect(db.$transaction).toHaveBeenCalledOnce();
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
      "l2:notice-1",
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
      "l2:notice-1",
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
    // The account is gone: recorded once so the hourly sweep stops retrying.
    expect(db.$transaction).toHaveBeenCalledOnce();
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
      "en",
      "l3:notice-1",
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
    // The account is gone: recorded once so the hourly sweep stops retrying.
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ reason: "user_missing", escalationLevel: 3 }),
      }),
    );
  });
});
