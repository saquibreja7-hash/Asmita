import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP31: the survivor's tick to share her fingerprints with partner platforms
// (src/app/api/cases/[caseId]/partner-share/route.ts), mirroring
// crawl-consent-tick.test.ts: same hoisted mocks (csrf, session, case
// ownership, rate limit, db), the same strict-payload and minor-refusal
// gates, plus the switches (ENABLE_HASH_UPLOAD, DATABASE_URL) the route
// adds. Placeholder data only; no name, contact or signature is ever asked
// for — the tick against the pinned templateRef is the agreement.

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  caseForUser: vi.fn(),
  rateLimit: vi.fn(),
  templateFindFirst: vi.fn(),
  consentFindMany: vi.fn(),
  consentFindFirst: vi.fn(),
  consentCreate: vi.fn(),
  consentUpdateMany: vi.fn(),
  hashFindMany: vi.fn(),
  // WP32: the consent hooks sync the partner feed inside the transaction.
  feedEventFindMany: vi.fn(),
  feedEventCreateMany: vi.fn(),
  caseFindMany: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: mocks.caseForUser }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mocks.rateLimit }));
vi.mock("@/lib/encryption", () => ({
  encryptField: (value: string) => `enc:${value.length}`,
  decryptField: (value: string) => value,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => {
  const db = {
    noticeTemplate: { findFirst: mocks.templateFindFirst },
    partnerShareConsent: {
      findMany: mocks.consentFindMany,
      findFirst: mocks.consentFindFirst,
      create: mocks.consentCreate,
      updateMany: mocks.consentUpdateMany,
    },
    hashSubmission: { findMany: mocks.hashFindMany },
    // WP32: the consent hooks sync the partner feed inside the transaction.
    partnerFeedEvent: {
      findMany: mocks.feedEventFindMany,
      createMany: mocks.feedEventCreateMany,
    },
    case: { findMany: mocks.caseFindMany },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import { DELETE, GET, POST } from "@/app/api/cases/[caseId]/partner-share/route";
import { resetPartnerMemory } from "@/lib/partner-store";
import { templateDigest, templateRef } from "@/lib/signed-template";

const template = {
  id: "partner-template-1",
  platformId: null,
  templateType: "PARTNER_SHARING_CONSENT",
  subjectTemplate: "Agreement to share my image fingerprints - {{caseReference}}",
  bodyTemplate: "AGREEMENT for {{caseReference}} ({{declarationReference}})",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};
const ownedCase = { id: "case-1", referenceNumber: "ASMITA-2026-00001", userId: "user-1", createdAt: "", status: "OPEN", urls: [] };
const adult = { ok: true, session: { sub: "user-1", ageOver18: true } };
const minor = { ok: false, status: 403, error: "minor_pathway_required" };
const params = { params: Promise.resolve({ caseId: "case-1" }) };
const HEX_A = "ab".repeat(32);
const HEX_B = "cd".repeat(32);
const hashRows = [
  { id: "hash-1", hashEncrypted: HEX_A, quality: 95, clientVersion: "pdq-demo-1", algorithm: "PDQ" },
  { id: "hash-2", hashEncrypted: HEX_B, quality: 90, clientVersion: "pdq-demo-1", algorithm: "PDQ" },
];
const req = (method: string, body?: unknown) =>
  new Request("https://asmita.test/api/cases/case-1/partner-share", {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const ref = () => templateRef(template, ["hash-1", "hash-2"]);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "false");
  resetPartnerMemory();
  mocks.session.mockReset().mockResolvedValue(adult);
  mocks.caseForUser.mockReset().mockResolvedValue(ownedCase);
  mocks.rateLimit.mockReset().mockResolvedValue({ allowed: true });
  mocks.templateFindFirst.mockReset().mockResolvedValue(template);
  mocks.consentFindMany.mockReset().mockResolvedValue([]);
  mocks.consentFindFirst.mockReset().mockResolvedValue(null);
  mocks.consentCreate.mockReset().mockResolvedValue({ id: "consent-1" });
  mocks.consentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.hashFindMany.mockReset().mockResolvedValue(hashRows);
  mocks.feedEventFindMany.mockReset().mockResolvedValue([]);
  mocks.feedEventCreateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.caseFindMany.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("agreeing to share, by tick", () => {
  it("records the tick with the pinned template and the fingerprint ids she saw, and no name", async () => {
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, fingerprintCount: 2 });

    expect(mocks.consentCreate).toHaveBeenCalledTimes(1);
    const call = mocks.consentCreate.mock.calls[0][0];
    expect(call.data).toEqual({
      caseId: "case-1",
      templateId: "partner-template-1",
      templateDigest: templateDigest(template),
      hashSubmissionIds: ["hash-1", "hash-2"],
    });
    expect(call.select).toEqual({ id: true });
  });

  it("refuses a request that is not a tick, and never accepts a name or signature", async () => {
    for (const body of [
      { templateRef: ref() },
      { agreed: false, templateRef: ref() },
      { agreed: true },
      { agreed: true, templateRef: ref(), name: "Example Person", signature: "Example Person" },
    ]) {
      const res = await POST(req("POST", body), params);
      expect(res.status).toBe(400);
    }
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("refuses when the agreement text or the fingerprints changed since the page loaded", async () => {
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
    expect(mocks.templateFindFirst.mock.calls[0][0].where).toMatchObject({
      templateType: "PARTNER_SHARING_CONSENT",
      isActive: true,
      reviewedByLegal: true,
    });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("with the dev legal bypass on, the template search drops the legal gate", async () => {
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "true");
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(200);
    const where = mocks.templateFindFirst.mock.calls[0][0].where;
    expect(where).toEqual({ templateType: "PARTNER_SHARING_CONSENT", isActive: true });
    expect(where).not.toHaveProperty("reviewedByLegal");
  });

  it("refuses when she has no fingerprint approved for sharing", async () => {
    mocks.hashFindMany.mockResolvedValue([]);
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
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
    expect(mocks.consentCreate).not.toHaveBeenCalled();
    expect(mocks.consentUpdateMany).not.toHaveBeenCalled();
  });

  it("is refused when it is already on", async () => {
    mocks.consentFindMany.mockResolvedValue([{ hashSubmissionIds: ["hash-1", "hash-2"], agreedAt: new Date(), withdrawnAt: null }]);
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_agreed" });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
  });

  it("answers 404 when the case is not hers", async () => {
    mocks.caseForUser.mockResolvedValue(null);
    for (const res of [
      await GET(req("GET"), params),
      await POST(req("POST", { agreed: true, templateRef: ref() }), params),
      await DELETE(req("DELETE"), params),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
    expect(mocks.caseForUser).toHaveBeenCalledWith("case-1", "user-1");
    expect(mocks.consentCreate).not.toHaveBeenCalled();
    expect(mocks.consentUpdateMany).not.toHaveBeenCalled();
  });

  it("limits how often she can change the agreement", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(mocks.rateLimit).toHaveBeenCalledWith("partner-share-consent:user-1", 10, 60 * 60_000);
    expect(mocks.consentCreate).not.toHaveBeenCalled();
    expect(mocks.consentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("reading the agreement", () => {
  it("answers the state and the full agreement text with its templateRef while it is off", async () => {
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      status: "none",
      agreedAt: null,
      withdrawnAt: null,
      fingerprintCount: 0,
      available: true,
      draft: {
        subject: "Agreement to share my image fingerprints - ASMITA-2026-00001",
        body: expect.stringContaining("--- PERCEPTUAL HASH ANNEX ---"),
        templateRef: ref(),
      },
    });
    expect(json.draft.body).toContain("AGREEMENT for ASMITA-2026-00001 (ASMITA-2026-00001)");
    expect(json.draft.body).toContain(HEX_A);
    expect(json.draft.body).toContain(HEX_B);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("hides the agreement text once she has agreed", async () => {
    mocks.consentFindMany.mockResolvedValue([{ hashSubmissionIds: ["hash-1", "hash-2"], agreedAt: new Date(), withdrawnAt: null }]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "agreed",
      agreedAt: expect.any(String),
      withdrawnAt: null,
      fingerprintCount: 2,
      available: true,
      draft: null,
    });
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
  });
});

describe("switches and the database", () => {
  it("without a database, POST answers database_required and GET hides the draft", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const res = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_required" });
    expect(mocks.consentCreate).not.toHaveBeenCalled();

    const json = await (await GET(req("GET"), params)).json();
    expect(json).toEqual({
      status: "none",
      agreedAt: null,
      withdrawnAt: null,
      fingerprintCount: 0,
      available: true,
      draft: null,
    });
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
  });

  it("with hash upload switched off, POST is not found and DELETE still withdraws", async () => {
    vi.stubEnv("ENABLE_HASH_UPLOAD", "");
    const post = await POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(post.status).toBe(404);
    expect(await post.json()).toEqual({ error: "not_found" });
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
    expect(mocks.consentCreate).not.toHaveBeenCalled();

    const del = await DELETE(req("DELETE"), params);
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    expect(mocks.consentUpdateMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
  });
});

describe("withdrawing", () => {
  it("stops sharing at once", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.consentUpdateMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
  });

  it("answers not_agreed when nothing is live", async () => {
    mocks.consentUpdateMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_agreed" });
  });
});

// The csrf mock above covers the happy paths; this block re-imports the
// route with @/lib/csrf NOT mocked (vi.doUnmock + vi.resetModules) so the
// real header check is exercised. It stays last: after it, the route module
// in this file's registry uses the real csrf.
describe("the csrf check is the real one (csrf not mocked)", () => {
  beforeEach(() => {
    vi.doUnmock("@/lib/csrf");
    vi.resetModules();
  });

  it("refuses POST and DELETE without the csrf header", async () => {
    const route = await import("@/app/api/cases/[caseId]/partner-share/route");
    const post = await route.POST(req("POST", { agreed: true, templateRef: ref() }), params);
    expect(post.status).toBe(403);
    expect(await post.json()).toEqual({ error: "csrf_failed" });

    const del = await route.DELETE(req("DELETE"), params);
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ error: "csrf_failed" });
    expect(mocks.consentCreate).not.toHaveBeenCalled();
    expect(mocks.consentUpdateMany).not.toHaveBeenCalled();
  });
});
