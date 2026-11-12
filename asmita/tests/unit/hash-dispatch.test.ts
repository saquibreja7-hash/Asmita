import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    case: { findUnique: vi.fn() },
    noticeTemplate: { findFirst: vi.fn() },
    platform: { findUnique: vi.fn() },
    hashDispatch: { findUnique: vi.fn().mockResolvedValue(null), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    hashSubmission: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn(() => "pdq-value-decrypted"),
}));

vi.mock("@/lib/email", () => ({
  sendNoticeDraft: vi.fn().mockResolvedValue({ id: "email-message-1" }),
}));

vi.mock("@/lib/notice-dispatch", () => ({
  assertVerifiedNoticeRecipient: vi.fn(),
}));

vi.mock("@/lib/case-hash-annex", () => ({
  buildSignedHashAnnex: vi.fn().mockResolvedValue({
    ok: true,
    annex: { text: "Fingerprint annex text", hashSubmissionIds: ["hash-1"] },
  }),
  voidSignaturesWithRejectedFingerprints: vi.fn(),
}));

vi.mock("@/lib/platform-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-api")>();
  return { ...actual, sendNoticeToPlatformApi: vi.fn() };
});

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { sendNoticeDraft } from "@/lib/email";
import { sendNoticeToPlatformApi } from "@/lib/platform-api";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";

const dbCase = {
  id: "case-1",
  referenceNumber: "ASMITA-2026-00001",
  signedHashAdvisoryPdf: "advisory-pdf-encrypted",
  hashAdvisorySignedHashIds: ["hash-1"],
};

const reviewedTemplate = {
  id: "template-1",
  subjectTemplate: "Hash advisory {{caseReference}}",
  bodyTemplate: "Advisory body for {{platformName}}",
  version: 2,
};

const apiPlatform = {
  id: "platform-1",
  name: "Partner Platform",
  tier: "TIER_1",
  noticeBasis: "IT_RULES_2021",
  grievanceEmail: "go@partner.example",
  formUrl: null,
  apiEndpoint: "https://api.partner.example/removals",
  lastContactVerifiedByHuman: true,
  isActive: true,
};

function setup(platform: unknown = apiPlatform) {
  vi.mocked(db.case.findUnique).mockResolvedValue(dbCase as never);
  vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(reviewedTemplate as never);
  vi.mocked(db.platform.findUnique).mockResolvedValue(platform as never);
  vi.mocked(db.hashSubmission.findMany).mockResolvedValue([{ hashEncrypted: "enc-1", quality: 90 }] as never);
}

describe("dispatchHashAdvisories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.hashDispatch.findUnique).mockResolvedValue(null);
    setup();
  });

  afterEach(() => {
    delete process.env.ENABLE_PLATFORM_API;
    delete process.env.TIER1_API_ENABLED_PLATFORMS;
    delete process.env.TIER1_API_ACCESS_TOKEN;
  });

  it("sends the advisory via the platform API when the channel is configured", async () => {
    process.env.ENABLE_PLATFORM_API = "true";
    process.env.TIER1_API_ENABLED_PLATFORMS = "platform-1";
    process.env.TIER1_API_ACCESS_TOKEN = "partner-token";
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: true, status: 201, referenceId: "adv-ref-1" });

    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });

    expect(results).toEqual([
      { platformId: "platform-1", dispatched: true, messageId: "adv-ref-1", hashCount: 1 },
    ]);
    expect(sendNoticeDraft).not.toHaveBeenCalled();
    const call = vi.mocked(sendNoticeToPlatformApi).mock.calls[0][0];
    expect(call.endpoint).toBe("https://api.partner.example/removals");
    expect(call.accessToken).toBe("partner-token");
    expect(call.payload.kind).toBe("HASH_ADVISORY");
    expect(call.payload.fingerprints).toEqual([
      { algorithm: "PDQ", digest: "pdq-value-decrypted", quality: 90 },
    ]);
    expect(call.payload.signedNoticePdfBase64).toBeTruthy();
    expect(db.hashDispatch.createMany).toHaveBeenCalledWith({
      data: [{ hashSubmissionId: "hash-1", platformId: "platform-1" }],
      skipDuplicates: true,
    });
    expect(db.hashSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["hash-1"] }, status: "APPROVED" },
        data: { status: "DISPATCHED" },
      }),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "HASH_DISPATCHED",
        data: expect.objectContaining({ transport: "platform_api", referenceId: "adv-ref-1" }),
      }),
    );
  });

  it("falls back to the email channel when the API send fails", async () => {
    process.env.ENABLE_PLATFORM_API = "true";
    process.env.TIER1_API_ENABLED_PLATFORMS = "platform-1";
    process.env.TIER1_API_ACCESS_TOKEN = "partner-token";
    vi.mocked(sendNoticeToPlatformApi).mockResolvedValue({ ok: false, status: 500 });

    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });

    expect(results).toEqual([
      { platformId: "platform-1", dispatched: true, messageId: "email-message-1", hashCount: 1 },
    ]);
    expect(sendNoticeDraft).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NOTICE_FAILED",
        data: expect.objectContaining({
          transport: "platform_api",
          kind: "hash_advisory",
          reason: 500,
          fellBackTo: "email",
        }),
      }),
    );
  });

  it("keeps using email when the platform API switch is off", async () => {
    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });

    expect(sendNoticeToPlatformApi).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ dispatched: true, messageId: "email-message-1" });
  });

  it("reports already-dispatched hashes without sending anything", async () => {
    vi.mocked(db.hashDispatch.findUnique).mockResolvedValue({ id: "existing" } as never);

    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });

    expect(results).toEqual([{ platformId: "platform-1", dispatched: false, reason: "already_dispatched" }]);
    expect(sendNoticeToPlatformApi).not.toHaveBeenCalled();
    expect(sendNoticeDraft).not.toHaveBeenCalled();
  });
});
