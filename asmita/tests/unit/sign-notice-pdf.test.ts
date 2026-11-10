import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Signing with names the notice PDF cannot draw: the survivor gets a clear
// error before anything is signed, and a PDF failure is never a 500.

const mocks = vi.hoisted(() => ({
  urlFindFirst: vi.fn(),
  urlUpdateMany: vi.fn(),
  templateFindFirst: vi.fn(),
  caseUpdateMany: vi.fn(),
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({
  requireSession: async () => ({ ok: true, session: { sub: "user-1" } }),
}));
vi.mock("@/lib/case-ops", () => ({
  getCaseForUser: async () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00001" }),
}));
vi.mock("@/lib/case-hash-annex", () => ({
  buildHashAnnexForSigning: async () => ({ text: "Annex", hashSubmissionIds: ["hash-1"] }),
}));
vi.mock("@/lib/encryption", () => ({
  decryptField: () => "https://example.com/reported",
  encryptField: (value: string) => `enc:${value.length}`,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/hash-dispatch", () => ({ dispatchHashAdvisories: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: mocks.urlFindFirst, updateMany: mocks.urlUpdateMany },
    noticeTemplate: { findFirst: mocks.templateFindFirst },
    case: { updateMany: mocks.caseUpdateMany, findUnique: mocks.caseFindUnique, update: mocks.caseUpdate },
    hashSubmission: { updateMany: vi.fn() },
  },
}));

import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";
import { POST as signAdvisory } from "@/app/api/cases/[caseId]/sign-hash-advisory/route";
import { templateDigest, templateRef } from "@/lib/signed-template";

const DEVANAGARI_NAME = "सुनीता";
const params = { params: Promise.resolve({ caseId: "case-1" }) };

const template = {
  id: "template-1",
  platformId: null,
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} for {{platformName}} at {{url}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

const signableUrl = {
  id: "url-1",
  status: "NOTICE_QUEUED",
  urlEncrypted: "encrypted-url",
  submittedAt: new Date(),
  signedNoticePdf: null,
  case: { referenceNumber: "ASMITA-2026-00001", declarationSignedAt: null },
  platform: {
    id: "platform-1",
    name: "Example Platform",
    noticeBasis: "IT_RULES_2021",
    isActive: true,
    lastContactVerifiedByHuman: true,
    grievanceEmail: "go@example.com",
  },
};

function signRequest(body: Record<string, unknown>) {
  return new Request("https://asmita.test/api/cases/case-1/sign-notice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urlId: "url-1", contact: "person@example.invalid", templateRef: templateRef(template), ...body }),
  });
}

describe("sign-notice and the notice PDF font", () => {
  beforeEach(() => {
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
    mocks.urlFindFirst.mockReset().mockResolvedValue(signableUrl);
    mocks.urlUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.templateFindFirst.mockReset().mockResolvedValue(template);
    mocks.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks for Latin letters when the name is in Devanagari, before touching the case", async () => {
    const res = await signNotice(signRequest({ name: DEVANAGARI_NAME, signature: "Example Person" }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_script_unsupported" });
    expect(mocks.urlFindFirst).not.toHaveBeenCalled();
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("asks for Latin letters when the typed signature is in Devanagari", async () => {
    const res = await signNotice(signRequest({ name: "Example Person", signature: DEVANAGARI_NAME }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_script_unsupported" });
  });

  it("signs an accented Latin name and pins the template it was signed against", async () => {
    const res = await signNotice(signRequest({ name: "José Müller", signature: "José Müller" }), params);
    expect(res.status).toBe(200);
    expect(mocks.urlUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedTemplateId: "template-1",
          signedTemplateDigest: templateDigest(template),
          signedHashSubmissionIds: ["hash-1"],
        }),
      }),
    );
  });

  it("accepts an accented name typed as letter plus combining accent", async () => {
    const res = await signNotice(signRequest({ name: "José", signature: "José" }), params);
    expect(res.status).toBe(200);
  });

  it("answers a clean 409, not a 500, when template text cannot be drawn, and logs no name", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const undrawable = { ...template, bodyTemplate: "Fee ₹500 for {{platformName}}" };
    mocks.templateFindFirst.mockResolvedValue(undrawable);
    const res = await signNotice(
      signRequest({ name: "Example Person", signature: "Example Person", templateRef: templateRef(undrawable) }),
      params,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_pdf_failed" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Example Person");
  });

  it("refuses to sign when another template became current after the preview", async () => {
    const previewed = templateRef(template);
    mocks.templateFindFirst.mockResolvedValue({ ...template, id: "template-2", version: 2 });
    const res = await signNotice(signRequest({ name: "Example Person", signature: "Example Person", templateRef: previewed }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to sign when the previewed template's text was edited in place", async () => {
    mocks.templateFindFirst.mockResolvedValue({ ...template, bodyTemplate: "Edited {{url}}" });
    const res = await signNotice(signRequest({ name: "Example Person", signature: "Example Person" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("requires the preview reference", async () => {
    const res = await signNotice(signRequest({ name: "Example Person", signature: "Example Person", templateRef: undefined }), params);
    expect(res.status).toBe(400);
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("answers a clean 409 when the platform name cannot be drawn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.urlFindFirst.mockResolvedValue({
      ...signableUrl,
      platform: { ...signableUrl.platform, name: "उदाहरण" },
    });
    const res = await signNotice(signRequest({ name: "Example Person", signature: "Example Person" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_pdf_failed" });
  });
});

describe("sign-hash-advisory and the notice PDF font", () => {
  const advisoryTemplate = {
    ...template,
    id: "advisory-1",
    templateType: "HASH_ADVISORY",
    bodyTemplate: "Advisory {{caseReference}} for {{platformName}}",
  };
  beforeEach(() => {
    vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
    mocks.caseFindUnique.mockReset().mockResolvedValue({ signedHashAdvisoryPdf: null, declarationSignedAt: null });
    mocks.caseUpdate.mockReset().mockResolvedValue({});
    mocks.templateFindFirst.mockReset().mockResolvedValue(advisoryTemplate);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const advisoryRequest = (name: string, ref = templateRef(advisoryTemplate)) =>
    new Request("https://asmita.test/api/cases/case-1/sign-hash-advisory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, signature: name, contact: "person@example.invalid", platformIds: ["platform-1"], templateRef: ref }),
    });

  it("refuses to sign when the advisory template changed after the preview", async () => {
    const previewed = templateRef(advisoryTemplate);
    mocks.templateFindFirst.mockResolvedValue({ ...advisoryTemplate, id: "advisory-2", version: 2 });
    const res = await signAdvisory(advisoryRequest("Example Person", previewed), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });

  it("asks for Latin letters when the name is in Devanagari", async () => {
    const res = await signAdvisory(advisoryRequest(DEVANAGARI_NAME), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_script_unsupported" });
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });

  it("signs a Latin name and pins the advisory template", async () => {
    const res = await signAdvisory(advisoryRequest("Example Person"), params);
    expect(res.status).toBe(200);
    expect(mocks.caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hashAdvisorySignedTemplateId: "advisory-1",
          hashAdvisorySignedTemplateDigest: templateDigest(advisoryTemplate),
        }),
      }),
    );
  });
});
