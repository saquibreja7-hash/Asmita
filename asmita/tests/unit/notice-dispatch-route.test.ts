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
}));

vi.mock("@/lib/url-portal", () => ({
  createPortalToken: vi.fn().mockResolvedValue({ token: "abc123token", accessCode: "TEST-1234" }),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice } from "@/lib/notice-dispatch";
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
  domain: "example.com",
  status: "NOTICE_QUEUED",
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
        // Body contains the portal link (not the raw URL) and the access code block.
        body: expect.stringContaining("meriasmita.org/r/abc123token"),
        signedNoticePdf: null,
      }),
    );
    const calledBody = vi.mocked(dispatchTier2Notice).mock.calls[0][0].body;
    expect(calledBody).toContain("Access code: TEST-1234");
    expect(calledBody).not.toContain("https://example.com/reported");
  });
});
