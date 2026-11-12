import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: vi.fn() },
    noticeTemplate: { findFirst: vi.fn() },
    hashSubmission: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn(() => "https://example.com/reported"),
}));

vi.mock("@/lib/notice-dispatch", () => ({
  dispatchTier2Notice: vi.fn().mockResolvedValue({ dispatched: true, notice: { messageId: "msg-1" } }),
  dispatchTier1ApiNotice: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice, dispatchTier1ApiNotice } from "@/lib/notice-dispatch";
import { createCsrfPair } from "@/lib/csrf";
import { POST } from "@/app/api/notices/dispatch/route";

function csrfPost(body: unknown) {
  const { nonce, token } = createCsrfPair();
  return new Request("https://asmita.test/api/notices/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `asmita_csrf=${nonce}`,
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
}

function noCsrfPost(body: unknown) {
  return new Request("https://asmita.test/api/notices/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const okAdmin = {
  ok: true as const,
  session: {
    sub: "admin-1",
    role: "ADMIN" as const,
    ageOver18: true,
    emailHash: "hash-admin",
    namespace: "admin" as const,
    adminRole: "SUPER_ADMIN" as const,
  },
};

const dispatchableUrl = {
  id: "url-1",
  caseId: "case-1",
  urlEncrypted: "encrypted-url",
  submittedAt: new Date(),
  domain: "example.com",
  status: "NOTICE_QUEUED",
  signedNoticePdf: "encrypted-signed-pdf",
  signedHashSubmissionIds: [],
  case: {
    referenceNumber: "ASMITA-2026-00001",
    declarationSignedAt: new Date("2026-06-01T00:00:00.000Z"),
  },
  platform: {
    id: "platform-1",
    name: "Example Platform",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "go@example.com",
    lastContactVerifiedByHuman: true,
    isActive: true,
  },
};

const reviewedTemplate = {
  id: "template-1",
  platformId: null,
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} for {{platformName}} at {{url}} declaration {{declarationReference}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

describe("POST /api/notices/dispatch", () => {
  beforeEach(() => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue(dispatchableUrl as never);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(reviewedTemplate as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_PLATFORM_API;
    delete process.env.TIER1_API_ENABLED_PLATFORMS;
    delete process.env.TIER1_API_ACCESS_TOKEN;
  });

  it("rejects without CSRF", async () => {
    const res = await POST(noCsrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(403);
  });

  it("requires an admin with case review permission", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({
      ok: false,
      status: 403,
      error: "admin_required",
    } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(403);
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied recipient and body fields", async () => {
    const res = await POST(
      csrfPost({
        caseId: "case-1",
        urlId: "url-1",
        recipientEmail: "attacker@example.com",
        subject: "Injected",
        body: "Injected",
      }),
    );
    expect(res.status).toBe(400);
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("blocks dispatch when the survivor has not signed the notice", async () => {
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      signedNoticePdf: null,
    } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "signature_required" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("blocks dispatch when the platform contact is not human verified", async () => {
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: { ...dispatchableUrl.platform, lastContactVerifiedByHuman: false },
    } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "verified_platform_contact_required" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("blocks dispatch when no legally reviewed template exists", async () => {
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(null);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "reviewed_template_required" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("dispatches using DB-derived recipient and rendered reviewed template", async () => {
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(200);
    expect(dispatchTier2Notice).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        urlId: "url-1",
        recipientEmail: "go@example.com",
        subject: "Notice ASMITA-2026-00001",
        body: expect.stringContaining("[Reported URL is in the attached signed notice]"),
        signedNoticePdf: expect.any(Buffer),
      }),
    );
    const calledBody = vi.mocked(dispatchTier2Notice).mock.calls[0][0].body;
    expect(calledBody).not.toContain("/r/");
    expect(calledBody).not.toContain("https://example.com/reported");
  });

  it("blocks templates that still claim the URL is a secure portal", async () => {
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue({ ...reviewedTemplate, bodyTemplate: "Secure Content Locator: {{url}}" } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  const apiNotice = {
    dispatched: true,
    notice: {
      idempotencyKey: "k",
      caseId: "case-1",
      urlId: "url-1",
      recipientEmail: "",
      messageId: "plat-ref-1",
      sentAt: "2026-11-12T00:00:00.000Z",
      payloadHash: "h",
    },
    referenceId: "plat-ref-1",
  };

  function enablePlatformApi() {
    process.env.ENABLE_PLATFORM_API = "true";
    process.env.TIER1_API_ENABLED_PLATFORMS = "platform-1";
    process.env.TIER1_API_ACCESS_TOKEN = "partner-token";
  }

  it("dispatches via the platform API when the channel is configured", async () => {
    enablePlatformApi();
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: {
        ...dispatchableUrl.platform,
        tier: "TIER_1",
        apiEndpoint: "https://api.partner.example/removals",
      },
    } as never);
    vi.mocked(dispatchTier1ApiNotice).mockResolvedValue(apiNotice as never);

    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dispatched: true, transport: "platform_api" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
    expect(dispatchTier1ApiNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://api.partner.example/removals",
        accessToken: "partner-token",
        body: expect.stringContaining("[Reported URL is in the attached signed notice]"),
      }),
    );
  });

  it("falls back to email when the API rejects with a 4xx and a verified contact exists", async () => {
    enablePlatformApi();
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: {
        ...dispatchableUrl.platform,
        tier: "TIER_1",
        apiEndpoint: "https://api.partner.example/removals",
      },
    } as never);
    vi.mocked(dispatchTier1ApiNotice).mockResolvedValue({
      dispatched: false,
      reason: "api_send_failed",
      status: 422,
    } as never);

    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ transport: "email", fellBackFromPlatformApi: 422 });
    expect(dispatchTier2Notice).toHaveBeenCalledTimes(1);
  });

  it("never emails after an ambiguous API failure (5xx, timeout, network)", async () => {
    enablePlatformApi();
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: {
        ...dispatchableUrl.platform,
        tier: "TIER_1",
        apiEndpoint: "https://api.partner.example/removals",
      },
    } as never);
    vi.mocked(dispatchTier1ApiNotice).mockResolvedValue({
      dispatched: false,
      reason: "api_send_failed",
      status: 503,
    } as never);

    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "platform_api_ambiguous", status: 503 });
    // A verified email contact exists, but the platform may have processed the
    // API request before the failure, so a second channel would double-send.
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("returns 502 when the API rejects with a 4xx and no verified email contact exists", async () => {
    enablePlatformApi();
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: {
        ...dispatchableUrl.platform,
        grievanceEmail: null,
        tier: "TIER_1",
        apiEndpoint: "https://api.partner.example/removals",
      },
    } as never);
    vi.mocked(dispatchTier1ApiNotice).mockResolvedValue({
      dispatched: false,
      reason: "api_send_failed",
      status: 422,
    } as never);

    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "platform_api_failed" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("keeps the email channel when the platform API switch is off", async () => {
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({
      ...dispatchableUrl,
      platform: {
        ...dispatchableUrl.platform,
        tier: "TIER_1",
        apiEndpoint: "https://api.partner.example/removals",
      },
    } as never);

    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));

    expect(res.status).toBe(200);
    expect(dispatchTier1ApiNotice).not.toHaveBeenCalled();
    expect(dispatchTier2Notice).toHaveBeenCalledTimes(1);
  });
});
