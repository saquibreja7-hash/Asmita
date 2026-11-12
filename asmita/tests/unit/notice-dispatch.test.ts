import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    submittedUrl: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

vi.mock("@/lib/platform-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-api")>();
  return { ...actual, sendNoticeToPlatformApi: vi.fn() };
});

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { sendNoticeToPlatformApi } from "@/lib/platform-api";
import {
  assertVerifiedNoticeRecipient,
  dispatchedApiNotices,
  dispatchedNotices,
  dispatchTier1ApiNotice,
  dispatchTier2Notice,
} from "@/lib/notice-dispatch";
import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";

describe("dispatchTier2Notice", () => {
  afterEach(() => dispatchedNotices.clear());

  it("uses an idempotency key to avoid duplicate sends", async () => {
    const input = {
      caseId: "case-1",
      urlId: "url-1",
      recipientEmail: "verified@example.com",
      subject: "PENDING REVIEW",
      body: "Draft notice body",
    };
    const first = await dispatchTier2Notice(input);
    const second = await dispatchTier2Notice(input);
    expect(first.dispatched).toBe(true);
    expect(second.dispatched).toBe(false);
    expect(first.notice.idempotencyKey).toBe(second.notice.idempotencyKey);
  });

  it("blocks placeholder or invalid recipients", () => {
    expect(() => assertVerifiedNoticeRecipient(HUMAN_VERIFICATION_REQUIRED)).toThrow("verified_recipient_required");
    expect(() => assertVerifiedNoticeRecipient("not-an-email")).toThrow("verified_recipient_required");
  });
});

describe("dispatchTier1ApiNotice", () => {
  const input = {
    caseId: "case-1",
    urlId: "url-1",
    caseReference: "ASMITA-2026-00001",
    platform: {
      id: "platform-1",
      name: "Partner",
      noticeBasis: "IT_RULES_2021",
      grievanceEmail: "go@partner.example",
    },
    endpoint: "https://api.partner.example/removals",
    accessToken: "partner-token",
    subject: "NCII takedown request ASMITA-2026-00001",
    body: "Notice body",
    fingerprints: [{ algorithm: "PDQ" as const, digest: "a".repeat(64), quality: 90 }],
    fingerprintIds: ["hash-1"],
    templateId: "template-1",
  };

  beforeEach(() => {
    dispatchedApiNotices.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    dispatchedApiNotices.clear();
    delete process.env.NOTICE_DISPATCH_PERSISTENCE;
  });

  it("sends the signed package to the platform and records the platform reference", async () => {
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: true, status: 201, referenceId: "plat-ref-1" });

    const result = await dispatchTier1ApiNotice(input);

    expect(result).toMatchObject({ dispatched: true, referenceId: "plat-ref-1" });
    if (!result.dispatched) return;
    expect(result.notice.messageId).toBe("plat-ref-1");
    expect(sendNoticeToPlatformApi).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://api.partner.example/removals",
        accessToken: "partner-token",
      }),
    );
    const call = vi.mocked(sendNoticeToPlatformApi).mock.calls[0][0];
    expect(call.payload.kind).toBe("URL_NOTICE");
    expect(call.payload.body).toBe("Notice body");
    expect(call.payload.fingerprints).toEqual([{ algorithm: "PDQ", digest: "a".repeat(64), quality: 90 }]);
    expect(call.payload.signedNoticePdfBase64).toBeUndefined();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_SENT",
        data: expect.objectContaining({
          transport: "platform_api",
          messageId: "plat-ref-1",
          fingerprintIds: ["hash-1"],
        }),
      }),
    );
  });

  it("is idempotent per (case, url, platform): a second call never re-sends", async () => {
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: true, status: 201 });

    const first = await dispatchTier1ApiNotice(input);
    const second = await dispatchTier1ApiNotice(input);

    expect(first.dispatched).toBe(true);
    expect(second).toMatchObject({ dispatched: false, reason: "already_dispatched" });
    expect(sendNoticeToPlatformApi).toHaveBeenCalledTimes(1);
  });

  it("returns without throwing when the platform rejects the notice", async () => {
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: false, status: 503 });

    const result = await dispatchTier1ApiNotice(input);

    expect(result).toMatchObject({ dispatched: false, reason: "api_send_failed", status: 503 });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({ transport: "platform_api", reason: 503 }),
      }),
    );
  });

  it("persists a Notice row with method API, tier 1, when database persistence is on", async () => {
    process.env.NOTICE_DISPATCH_PERSISTENCE = "database";
    vi.mocked(db.notice.findFirst).mockResolvedValue(null);
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: true, status: 200, referenceId: "ref" });

    const first = await dispatchTier1ApiNotice(input);
    expect(first.dispatched).toBe(true);
    expect(db.notice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: "API",
          routingTier: 1,
          recipientEmail: "go@partner.example",
        }),
      }),
    );

    // A persisted sent notice blocks a re-dispatch after an isolate restart.
    vi.mocked(db.notice.findFirst).mockResolvedValue({
      urlId: "url-1",
      recipientEmail: "go@partner.example",
      messageId: "ref",
      sentAt: new Date(),
      payloadHash: "x",
    } as never);
    const second = await dispatchTier1ApiNotice(input);
    expect(second).toMatchObject({ dispatched: false, reason: "already_dispatched" });
    expect(sendNoticeToPlatformApi).toHaveBeenCalledTimes(1);
  });
});
