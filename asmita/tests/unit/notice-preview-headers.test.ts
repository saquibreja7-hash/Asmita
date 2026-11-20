import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP44 A2: the sign screens frame the notice preview and now also link to it
// ("Open the notice (PDF)", Android Chrome draws no PDF in a frame). The
// routes must keep serving that document inline and unstored, and stay
// framable only by the site itself, so the link and the frame always open the
// same PDF she signs.

const mocks = vi.hoisted(() => ({ signable: vi.fn(), templateFindFirst: vi.fn() }));

vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: async () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00001" }) }));
vi.mock("@/lib/signable-notice", () => ({ findSignableNotice: mocks.signable, findHashAdvisoryTemplate: () => mocks.templateFindFirst() }));
vi.mock("@/lib/case-hash-annex", () => ({ buildHashAnnexForSigning: async () => ({ text: "Annex", hashSubmissionIds: ["hash-1"] }) }));
vi.mock("@/lib/encryption", () => ({ decryptField: () => "https://example.com/reported" }));
vi.mock("@/lib/notice-pdf", () => ({ generateNoticePdf: async () => Buffer.from("%PDF"), noticePdfErrorCode: () => "notice_pdf_failed" }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { submittedUrl: { count: vi.fn() }, noticeTemplate: { findFirst: mocks.templateFindFirst } } }));

import { GET as previewNotice } from "@/app/api/cases/[caseId]/preview-notice/route";
import { GET as previewAdvisory } from "@/app/api/cases/[caseId]/preview-hash-advisory/route";
import nextConfig from "../../next.config";

const params = { params: Promise.resolve({ caseId: "case-1" }) };
const template = {
  id: "template-1",
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} at {{url}}",
};
const advisory = { ...template, id: "advisory-1", templateType: "HASH_ADVISORY", bodyTemplate: "Advisory {{caseReference}}" };

describe("notice preview response headers", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
    mocks.signable.mockReset().mockResolvedValue({
      id: "url-1",
      urlEncrypted: "encrypted",
      submittedAt: new Date(),
      platform: { id: "platform-1", name: "Example Platform", noticeBasis: "IT_RULES_2021", grievanceEmail: "go@example.com" },
      template,
    });
    mocks.templateFindFirst.mockReset().mockResolvedValue(advisory);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves the URL notice preview inline, never stored", async () => {
    const res = await previewNotice(new NextRequest("https://asmita.test/api/cases/case-1/preview-notice"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="notice-preview-/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the fingerprint advisory preview inline, never stored", async () => {
    const res = await previewAdvisory(new NextRequest("https://asmita.test/api/cases/case-1/preview-hash-advisory"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="hash-advisory-preview-/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps both preview routes framable only by the site itself", async () => {
    // next.config.ts relaxes framing for exactly these two routes; every
    // other response stays at frame-ancestors 'none' / X-Frame-Options DENY.
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const source of ["/api/cases/:caseId/preview-notice", "/api/cases/:caseId/preview-hash-advisory"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeTruthy();
      const headers = Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, String(h.value)]));
      expect(headers["X-Frame-Options"], source).toBe("SAMEORIGIN");
      expect(headers["Content-Security-Policy"], source).toContain("frame-ancestors 'self'");
    }
  });
});
