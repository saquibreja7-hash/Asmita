import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Owner decision 2026-11-18: her full name is her signature. The signing
// forms no longer ask for a separate typed signature; the routes accept a
// request without one and draw her full name on the declaration's signature
// line. Placeholder data only.

const mocks = vi.hoisted(() => ({
  urlFindFirst: vi.fn(),
  urlUpdateMany: vi.fn(),
  templateFindFirst: vi.fn(),
  caseUpdateMany: vi.fn(),
  caseFindUnique: vi.fn(),
  pdfInputs: [] as Array<Record<string, unknown>>,
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
vi.mock("@/lib/notice-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notice-pdf")>();
  return {
    ...actual,
    generateNoticePdf: async (input: Parameters<typeof actual.generateNoticePdf>[0]) => {
      mocks.pdfInputs.push({ ...input });
      return actual.generateNoticePdf(input);
    },
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: mocks.urlFindFirst, updateMany: mocks.urlUpdateMany },
    noticeTemplate: { findFirst: mocks.templateFindFirst },
    case: { updateMany: mocks.caseUpdateMany, findUnique: mocks.caseFindUnique, update: vi.fn() },
    hashSubmission: { updateMany: vi.fn() },
  },
}));

import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";
import { POST as signAdvisory } from "@/app/api/cases/[caseId]/sign-hash-advisory/route";
import { templateRef } from "@/lib/signed-template";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";

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
const advisoryTemplate = { ...template, id: "advisory-1", templateType: "HASH_ADVISORY", bodyTemplate: "Advisory {{caseReference}} for {{platformName}}" };
const signableUrl = {
  id: "url-1",
  status: "NOTICE_QUEUED",
  urlEncrypted: "encrypted-url",
  submittedAt: new Date(),
  signedNoticePdf: null,
  case: { referenceNumber: "ASMITA-2026-00001", declarationSignedAt: null },
  platform: { id: "platform-1", name: "Example Platform", noticeBasis: "IT_RULES_2021", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: "go@example.com" },
};

const post = (path: string, body: Record<string, unknown>) =>
  new Request(`https://asmita.test/api/cases/case-1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  mocks.pdfInputs.length = 0;
  mocks.urlFindFirst.mockReset().mockResolvedValue(signableUrl);
  mocks.urlUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.caseFindUnique.mockReset().mockResolvedValue({ signedHashAdvisoryPdf: null, declarationSignedAt: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("sign-notice: the full name is the signature", () => {
  beforeEach(() => mocks.templateFindFirst.mockReset().mockResolvedValue(template));

  it("signs without a separate signature and draws the full name on the signature line", async () => {
    const res = await signNotice(post("sign-notice", {
      urlId: "url-1", name: "Example Person", contact: "person@example.invalid", templateRef: templateRef(template, ["hash-1"]),
    }), params);
    expect(res.status).toBe(200);
    expect(mocks.pdfInputs).toHaveLength(1);
    expect(mocks.pdfInputs[0]).toMatchObject({ survivorName: "Example Person", signature: "Example Person" });
    expect(mocks.urlUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("still refuses a name the PDF cannot draw, with no separate signature", async () => {
    const res = await signNotice(post("sign-notice", {
      urlId: "url-1", name: "सुनीता", contact: "person@example.invalid", templateRef: templateRef(template, ["hash-1"]),
    }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_script_unsupported" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("still requires a name", async () => {
    const res = await signNotice(post("sign-notice", {
      urlId: "url-1", contact: "person@example.invalid", templateRef: templateRef(template, ["hash-1"]),
    }), params);
    expect(res.status).toBe(400);
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });
});

describe("sign-hash-advisory: the full name is the signature", () => {
  beforeEach(() => mocks.templateFindFirst.mockReset().mockResolvedValue(advisoryTemplate));

  it("signs without a separate signature and draws the full name on the signature line", async () => {
    const res = await signAdvisory(post("sign-hash-advisory", {
      name: "Example Person", contact: "person@example.invalid", platformIds: ["platform-1"], templateRef: templateRef(advisoryTemplate, ["hash-1"]),
    }), params);
    expect(res.status).toBe(200);
    expect(mocks.pdfInputs[0]).toMatchObject({ survivorName: "Example Person", signature: "Example Person" });
  });
});

describe("signing forms ask for the name once", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("no survivor signing form has a separate signature field or sends one", () => {
    for (const path of [
      "src/app/(victim)/case/[caseId]/sign/SignNoticeForm.tsx",
      "src/app/(victim)/review-sign/ReviewSignForm.tsx",
      "src/app/(victim)/case/[caseId]/CrawlConsent.tsx",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/setSignature|signature:|sign\.sig\.|review\.sign\.sig\./);
    }
  });

  it("tells her, under the name field, that typing her name is signing", () => {
    expect((en as Record<string, string>)["sign.name.signature"]).toContain("Your full name is your signature");
    expect((en as Record<string, string>)["sign.name.signature"]).toContain("confirm the declaration in the notice is accurate");
    expect((hi as Record<string, string>)["sign.name.signature"]).toBeTruthy();
    expect(status.machineTranslated.keys).toContain("sign.name.signature");
    expect(read("src/app/(victim)/case/[caseId]/sign/SignNoticeForm.tsx")).toContain('"sign.name.signature"');
    expect(read("src/app/(victim)/review-sign/ReviewSignForm.tsx")).toContain('"sign.name.signature"');
  });
});
