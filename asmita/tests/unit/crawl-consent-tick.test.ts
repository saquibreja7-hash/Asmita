import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Owner decision 2026-11-18: she switches the search for more copies on with
// one tick. No name, contact or signature is asked for or stored; the
// authorisation record (PDF, template id and digest, fingerprint ids) is
// still created, and every other gate still holds. Placeholder data only.

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  annex: vi.fn(),
  templateFindFirst: vi.fn(),
  consentFindMany: vi.fn(),
  consentFindFirst: vi.fn(),
  consentCreate: vi.fn(),
  consentUpdateMany: vi.fn(),
  hashUpdateMany: vi.fn(),
  urlUpdateMany: vi.fn(),
  findingDeleteMany: vi.fn(),
  pdfInputs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/case-ops", () => ({
  getCaseForUser: async () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00001", userId: "user-1", createdAt: "", status: "OPEN", urls: [] }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/case-hash-annex", () => ({ buildHashAnnexForSigning: mocks.annex, hasSearchableFingerprint: async () => true }));
vi.mock("@/lib/encryption", () => ({ encryptField: (value: string) => `enc:${value.length}`, decryptField: (v: string) => v }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
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
vi.mock("@/lib/db", () => {
  const db = {
    noticeTemplate: { findFirst: mocks.templateFindFirst },
    crawlConsent: { findMany: mocks.consentFindMany, findFirst: mocks.consentFindFirst, create: mocks.consentCreate, updateMany: mocks.consentUpdateMany },
    hashSubmission: { updateMany: mocks.hashUpdateMany },
    submittedUrl: { updateMany: mocks.urlUpdateMany },
    crawlFinding: { deleteMany: mocks.findingDeleteMany },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import { DELETE, GET, POST } from "@/app/api/cases/[caseId]/crawl-consent/route";
import { crawlAgreementRecord } from "@/lib/crawl-consent";
import { templateDigest, templateRef } from "@/lib/signed-template";

const template = {
  id: "crawl-template-1",
  platformId: null,
  templateType: "CRAWL_AUTHORISATION",
  subjectTemplate: "Authorisation {{caseReference}}",
  bodyTemplate: "AUTHORISATION for {{caseReference}} ({{declarationReference}})",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};
const adult = { ok: true, session: { sub: "user-1", ageOver18: true } };
const minor = { ok: false, status: 403, error: "minor_pathway_required" };
const params = { params: Promise.resolve({ caseId: "case-1" }) };
const req = (method: string, body?: unknown) =>
  new Request("https://asmita.test/api/cases/case-1/crawl-consent", {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const ref = () => templateRef(template, ["hash-1", "hash-2"]);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "false");
  mocks.pdfInputs.length = 0;
  mocks.session.mockReset().mockResolvedValue(adult);
  mocks.annex.mockReset().mockResolvedValue({ text: "FINGERPRINT ANNEX hash-1 hash-2", hashSubmissionIds: ["hash-1", "hash-2"] });
  mocks.templateFindFirst.mockReset().mockResolvedValue(template);
  mocks.consentFindMany.mockReset().mockResolvedValue([]);
  mocks.consentFindFirst.mockReset().mockResolvedValue(null);
  mocks.consentCreate.mockReset().mockResolvedValue({ id: "consent-1" });
  mocks.consentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.hashUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.urlUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.findingDeleteMany.mockReset().mockResolvedValue({ count: 2 });
});
afterEach(() => vi.unstubAllEnvs());

describe("crawl consent by tick", () => {
  it("creates the authorisation record with the template digest and fingerprint ids, and no name", async () => {
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, fingerprintCount: 2 });

    expect(mocks.consentCreate).toHaveBeenCalledTimes(1);
    const data = mocks.consentCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      caseId: "case-1",
      templateId: "crawl-template-1",
      templateDigest: templateDigest(template),
      hashSubmissionIds: ["hash-1", "hash-2"],
    });
    expect(data.signedPdfEncrypted).toMatch(/^enc:\d+$/);
    expect(data.signedAt).toBeInstanceOf(Date);
    // Both listed fingerprints get pool ids.
    expect(mocks.hashUpdateMany).toHaveBeenCalledTimes(2);

    // The PDF: the full text, the fingerprint list and the record of the tick.
    // No name, contact or signature, so no survivor declaration page.
    expect(mocks.pdfInputs).toHaveLength(1);
    const pdf = mocks.pdfInputs[0];
    expect(pdf.survivorName).toBeUndefined();
    expect(pdf.survivorContact).toBeUndefined();
    expect(pdf.signature).toBeUndefined();
    const body = String(pdf.noticeBody);
    expect(body).toContain("AUTHORISATION for ASMITA-2026-00001");
    expect(body).toContain("FINGERPRINT ANNEX hash-1 hash-2");
    expect(body).toContain(crawlAgreementRecord({ caseReference: "ASMITA-2026-00001", agreedAt: data.signedAt }));
    expect(body.indexOf("FINGERPRINT ANNEX")).toBeLessThan(body.indexOf("RECORD OF AGREEMENT"));
  });

  it("the record says who agreed and when, by ticking, and names nobody", () => {
    const record = crawlAgreementRecord({ caseReference: "ASMITA-2026-00001", agreedAt: new Date("2026-11-18T09:30:00Z") });
    expect(record).toContain("holder of the Asmita account for case ASMITA-2026-00001");
    expect(record).toContain("ticking the box");
    expect(record).toContain("18 November 2026 at 15:00 IST");
    expect(record).toContain("verified by a one-time code");
    expect(record).toContain("No name or signature was typed");
  });

  it("refuses a request that is not a tick, and never accepts a name or signature", async () => {
    for (const body of [
      { templateRef: ref() },
      { agreed: false, templateRef: ref() },
      { agreed: true, templateRef: ref(), name: "Example Person", signature: "Example Person" },
    ]) {
      const res = await POST(req("POST", body), params);
      expect(res.status).toBe(400);
    }
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("refuses when the authorisation text or fingerprints changed since the page loaded", async () => {
    const res = await POST(req("POST", { agreed: true, templateRef: templateRef(template, ["hash-1"]) }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("refuses when no template reviewed by legal and active exists", async () => {
    mocks.templateFindFirst.mockResolvedValue(null);
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "template_missing" });
    expect(mocks.templateFindFirst.mock.calls[0][0].where).toMatchObject({ templateType: "CRAWL_AUTHORISATION", isActive: true, reviewedByLegal: true });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("refuses when she has no fingerprint that has not been rejected", async () => {
    mocks.annex.mockResolvedValue({ text: "", hashSubmissionIds: [] });
    const res = await POST(req("POST", { agreed: true, templateRef: templateRef(template, []) }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_hashes" });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("refuses a minor session on every method, before anything is read or written", async () => {
    mocks.session.mockResolvedValue(minor);
    for (const res of [
      await GET(req("GET"), params),
      await POST(req("POST", { agreed: true, templateRef: ref() }), params),
      await DELETE(req("DELETE"), params),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "minor_pathway_required" });
    }
    for (const call of mocks.session.mock.calls) expect(call[0]).toEqual({ adultOnly: true });
    expect(mocks.annex).not.toHaveBeenCalled();
    expect(mocks.consentCreate).not.toHaveBeenCalled();
    expect(mocks.consentUpdateMany).not.toHaveBeenCalled();
  });

  it("is refused when it is already on", async () => {
    mocks.consentFindMany.mockResolvedValue([{ hashSubmissionIds: ["hash-1"], signedAt: new Date(), withdrawnAt: null }]);
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_signed" });
  });
});

describe("unticking withdraws, as before", () => {
  it("withdraws: pool ids cleared, unsent crawler links stopped, unreviewed matches deleted", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(mocks.consentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: "case-1", withdrawnAt: null } }));
    expect(mocks.hashUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { crawlPoolId: null } }));
    expect(mocks.urlUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ caseId: "case-1", source: "CRAWLER" }) }));
    expect(mocks.findingDeleteMany).toHaveBeenCalledWith({ where: { caseId: "case-1", reviewStatus: "CANDIDATE" } });
  });

  it("works with the crawler switched off, and answers not_signed when nothing is on", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await DELETE(req("DELETE"), params)).status).toBe(200);
    mocks.consentUpdateMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_signed" });
  });
});
