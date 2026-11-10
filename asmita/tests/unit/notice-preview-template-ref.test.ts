import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The preview names the template text it shows, and a preview asked for a
// held reference never shows other text under it.

const mocks = vi.hoisted(() => ({ signable: vi.fn(), templateFindFirst: vi.fn() }));

vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: async () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00001" }) }));
vi.mock("@/lib/signable-notice", () => ({ findSignableNotice: mocks.signable }));
vi.mock("@/lib/case-hash-annex", () => ({ buildHashAnnexForSigning: async () => ({ text: "Annex", hashSubmissionIds: ["hash-1"] }) }));
vi.mock("@/lib/encryption", () => ({ decryptField: () => "https://example.com/reported" }));
vi.mock("@/lib/notice-pdf", () => ({ generateNoticePdf: async () => Buffer.from("%PDF"), noticePdfErrorCode: () => "notice_pdf_failed" }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { submittedUrl: { count: vi.fn() }, noticeTemplate: { findFirst: mocks.templateFindFirst } } }));

import { GET as previewNotice } from "@/app/api/cases/[caseId]/preview-notice/route";
import { GET as previewAdvisory } from "@/app/api/cases/[caseId]/preview-hash-advisory/route";
import { templateRef } from "@/lib/signed-template";

const params = { params: Promise.resolve({ caseId: "case-1" }) };
const template = {
  id: "template-1",
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} at {{url}}",
};
const advisory = { ...template, id: "advisory-1", templateType: "HASH_ADVISORY", bodyTemplate: "Advisory {{caseReference}}" };

describe("preview template reference", () => {
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

  it("returns the reference of the notice template it rendered", async () => {
    const res = await previewNotice(new NextRequest("https://asmita.test/api/cases/case-1/preview-notice"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Notice-Template-Ref")).toBe(templateRef(template));
  });

  it("renders a held reference that still matches, and refuses one that does not", async () => {
    const base = "https://asmita.test/api/cases/case-1/preview-notice?urlId=url-1&templateRef=";
    const ok = await previewNotice(new NextRequest(base + encodeURIComponent(templateRef(template))), params);
    expect(ok.status).toBe(200);
    const stale = await previewNotice(new NextRequest(base + encodeURIComponent("template-0.old")), params);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "notice_changed_since_preview" });
  });

  it("does the same for the hash advisory", async () => {
    const base = "https://asmita.test/api/cases/case-1/preview-hash-advisory";
    const first = await previewAdvisory(new NextRequest(base), params);
    expect(first.headers.get("X-Notice-Template-Ref")).toBe(templateRef(advisory));
    const stale = await previewAdvisory(new NextRequest(`${base}?templateRef=${encodeURIComponent("advisory-0.old")}`), params);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "notice_changed_since_preview" });
  });
});
