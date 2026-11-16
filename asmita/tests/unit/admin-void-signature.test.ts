import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An admin can void a signature dispatch refuses because of its template, so
// the survivor signs again. Only that, only while nothing was sent, recorded.

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  auth: vi.fn(),
  urlFindFirst: vi.fn(),
  urlUpdateMany: vi.fn(),
  urlCount: vi.fn(),
  caseFindUnique: vi.fn(),
  caseUpdateMany: vi.fn(),
  caseCount: vi.fn(),
  templateFindUnique: vi.fn(),
  hashDispatchCount: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: mocks.csrf }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: mocks.auth }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: mocks.urlFindFirst, updateMany: mocks.urlUpdateMany, count: mocks.urlCount },
    case: { findUnique: mocks.caseFindUnique, updateMany: mocks.caseUpdateMany, count: mocks.caseCount },
    noticeTemplate: { findUnique: mocks.templateFindUnique },
    hashDispatch: { count: mocks.hashDispatchCount },
  },
}));

import { POST } from "@/app/api/admin/signatures/void/route";
import { templateDigest } from "@/lib/signed-template";

const template = {
  id: "template-1",
  platformId: null,
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Body {{url}}",
  isActive: true,
  reviewedByLegal: true,
};
const withdrawn = { ...template, isActive: false };

const signedLink = {
  id: "url-1",
  signedNoticePdf: "encrypted-pdf",
  signedTemplateId: "template-1",
  signedTemplateDigest: templateDigest(template),
  platform: { id: "platform-1", noticeBasis: "IT_RULES_2021" },
  _count: { notices: 0 },
};

const request = (body: unknown) =>
  new Request("https://asmita.test/api/admin/signatures/void", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const urlVoid = { target: "url", caseId: "case-1", urlId: "url-1", reason: "template_withdrawn" };

describe("POST /api/admin/signatures/void", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
    mocks.csrf.mockReset().mockReturnValue(true);
    mocks.auth.mockReset().mockResolvedValue({ ok: true, session: { sub: "admin-1" } });
    mocks.urlFindFirst.mockReset().mockResolvedValue(signedLink);
    mocks.urlUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.urlCount.mockReset().mockResolvedValue(0);
    mocks.templateFindUnique.mockReset().mockResolvedValue(withdrawn);
    mocks.caseFindUnique.mockReset();
    mocks.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.caseCount.mockReset().mockResolvedValue(0);
    mocks.hashDispatchCount.mockReset().mockResolvedValue(0);
    mocks.audit.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires CSRF and the send permission", async () => {
    mocks.csrf.mockReturnValue(false);
    expect((await POST(request(urlVoid))).status).toBe(403);
    mocks.csrf.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: false, error: "permission_denied", status: 403 });
    const denied = await POST(request(urlVoid));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "permission_denied" });
    expect(mocks.auth).toHaveBeenCalledWith("cases:review");
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("requires a reason from the fixed list", async () => {
    expect((await POST(request({ ...urlVoid, reason: undefined }))).status).toBe(400);
    expect((await POST(request({ ...urlVoid, reason: "survivor name here" }))).status).toBe(400);
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("voids a refused, unsent link signature and records the admin trigger and reason", async () => {
    const res = await POST(request(urlVoid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, voided: true });
    expect(mocks.urlUpdateMany).toHaveBeenCalledWith({
      where: { id: "url-1", signedNoticePdf: "encrypted-pdf", notices: { none: {} } },
      data: { signedNoticePdf: null, signedHashSubmissionIds: [], signedTemplateId: null, signedTemplateDigest: null },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      eventType: "ADMIN_ACTION",
      entityType: "Case",
      entityId: "case-1",
      actorId: "admin-1",
      data: { action: "signatures_voided", trigger: "admin", reason: "template_withdrawn", urlIds: ["url-1"], hashAdvisory: false },
    });
  });

  it("refuses to void a signature dispatch would send as it is", async () => {
    mocks.templateFindUnique.mockResolvedValue(template);
    const res = await POST(request(urlVoid));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signature_not_refused" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an unpinned signature, which dispatch never refuses for its template", async () => {
    mocks.urlFindFirst.mockResolvedValue({ ...signedLink, signedTemplateId: null, signedTemplateDigest: null });
    expect((await POST(request(urlVoid))).status).toBe(409);
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("keeps a signature a notice was already sent under", async () => {
    mocks.urlFindFirst.mockResolvedValue({ ...signedLink, _count: { notices: 1 } });
    const res = await POST(request(urlVoid));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_already_sent" });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
  });

  it("is idempotent: once voided, a repeat changes nothing and records nothing", async () => {
    mocks.urlFindFirst.mockResolvedValue({ ...signedLink, signedNoticePdf: null, signedTemplateId: null });
    const res = await POST(request(urlVoid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, voided: false });
    expect(mocks.urlUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reports a signature that changed under it instead of claiming success", async () => {
    mocks.urlUpdateMany.mockResolvedValue({ count: 0 });
    mocks.urlCount.mockResolvedValue(1);
    const res = await POST(request(urlVoid));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "signature_not_voided" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  describe("hash advisory", () => {
    const advisoryTemplate = { ...template, id: "advisory-1", templateType: "HASH_ADVISORY" };
    const signedCase = {
      signedHashAdvisoryPdf: "encrypted-advisory",
      hashAdvisorySignedHashIds: ["hash-1"],
      hashAdvisorySignedTemplateId: "advisory-1",
      hashAdvisorySignedTemplateDigest: templateDigest(advisoryTemplate),
    };
    const advisoryVoid = { target: "hash_advisory", caseId: "case-1", reason: "other" };

    beforeEach(() => {
      mocks.caseFindUnique.mockResolvedValue(signedCase);
      mocks.templateFindUnique.mockResolvedValue({ ...advisoryTemplate, reviewedByLegal: false });
    });

    it("voids a refused, unsent advisory with the admin trigger", async () => {
      const res = await POST(request(advisoryVoid));
      expect(await res.json()).toEqual({ ok: true, voided: true });
      expect(mocks.caseUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "case-1", signedHashAdvisoryPdf: "encrypted-advisory" } }),
      );
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { action: "signatures_voided", trigger: "admin", reason: "other", urlIds: [], hashAdvisory: true },
        }),
      );
    });

    it("keeps an advisory a platform already received", async () => {
      mocks.hashDispatchCount.mockResolvedValue(1);
      mocks.caseCount.mockResolvedValue(1);
      const res = await POST(request(advisoryVoid));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "signature_not_voided" });
      expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    });

    it("refuses an advisory dispatch would send", async () => {
      mocks.templateFindUnique.mockResolvedValue(advisoryTemplate);
      expect((await POST(request(advisoryVoid))).status).toBe(409);
      expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
    });
  });
});
