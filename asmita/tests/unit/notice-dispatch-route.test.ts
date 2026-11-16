import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    noticeTemplate: { findFirst: vi.fn(), findUnique: vi.fn() },
    hashSubmission: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn(() => "https://example.com/reported"),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

vi.mock("@/lib/notice-dispatch", () => ({
  dispatchTier2Notice: vi.fn().mockResolvedValue({ dispatched: true, notice: { messageId: "msg-1" } }),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { dispatchTier2Notice } from "@/lib/notice-dispatch";
import { createCsrfPair } from "@/lib/csrf";
import { writeAuditLog } from "@/lib/audit";
import { templateDigest } from "@/lib/signed-template";
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
});

describe("POST /api/notices/dispatch with a pinned template", () => {
  const signedTemplate = { ...reviewedTemplate, id: "template-v1", bodyTemplate: "Signed text v1 for {{platformName}} {{url}}" };
  const newerTemplate = { ...reviewedTemplate, id: "template-v2", version: 2, bodyTemplate: "Newer text v2 for {{platformName}} {{url}}" };
  const pinnedUrl = {
    ...dispatchableUrl,
    signedTemplateId: "template-v1",
    signedTemplateDigest: templateDigest(signedTemplate),
  };

  beforeEach(() => {
    vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue(pinnedUrl as never);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(newerTemplate as never);
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue(signedTemplate as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends the signed template's text even when a newer version is active", async () => {
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(200);
    const call = vi.mocked(dispatchTier2Notice).mock.calls[0][0];
    expect(call.body).toContain("Signed text v1");
    expect(call.body).not.toContain("Newer text v2");
    expect(call.templateId).toBe("template-v1");
    expect(db.noticeTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("refuses, keeping the signature, when the signed template was deactivated", async () => {
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue({ ...signedTemplate, isActive: false } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signed_template_not_dispatchable" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
    expect(db.submittedUrl.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the signed template's legal review was withdrawn", async () => {
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue({ ...signedTemplate, reviewedByLegal: false } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signed_template_not_dispatchable" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });

  it("refuses and voids the unsent signature when the signed text was changed in place", async () => {
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue({ ...signedTemplate, bodyTemplate: "Edited text {{url}}" } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signed_template_changed" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith({
      where: { id: "url-1", signedNoticePdf: "encrypted-signed-pdf", notices: { none: {} } },
      data: { signedNoticePdf: null, signedHashSubmissionIds: [], signedTemplateId: null, signedTemplateDigest: null },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "signatures_voided", trigger: "template_changed" }) }),
    );
  });

  it("refuses and voids when the signed template no longer exists", async () => {
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue(null);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signed_template_changed" });
    expect(db.submittedUrl.updateMany).toHaveBeenCalled();
  });

  it("refuses a pinned template written for a different platform", async () => {
    vi.mocked(db.noticeTemplate.findUnique).mockResolvedValue({ ...signedTemplate, platformId: "platform-other" } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signed_template_changed" });
  });

  it("keeps today's selection for a notice signed before templates were pinned", async () => {
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue({ ...dispatchableUrl, signedTemplateId: null, signedTemplateDigest: null } as never);
    const res = await POST(csrfPost({ caseId: "case-1", urlId: "url-1" }));
    expect(res.status).toBe(200);
    expect(db.noticeTemplate.findUnique).not.toHaveBeenCalled();
    const call = vi.mocked(dispatchTier2Notice).mock.calls[0][0];
    expect(call.body).toContain("Newer text v2");
    expect(call.templateId).toBe("template-v2");
  });
});
