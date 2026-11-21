import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One signature, every platform: the advisory a survivor signs goes to each
// platform they chose, once each. Fingerprints are added only while the case
// is being created.

const m = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdateMany: vi.fn(),
  platformCount: vi.fn(),
  platformFindMany: vi.fn(),
  platformFindUnique: vi.fn(),
  templateFindFirst: vi.fn(),
  hashFindFirst: vi.fn(),
  hashFindMany: vi.fn(),
  hashCreate: vi.fn(),
  hashUpdate: vi.fn(),
  hashSubmissionFindUnique: vi.fn(),
  dispatchFindUnique: vi.fn(),
  dispatchCount: vi.fn(),
  dispatchCreateMany: vi.fn(),
  sendNoticeDraft: vi.fn(),
  getCaseForUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    case: { findUnique: m.caseFindUnique, updateMany: m.caseUpdateMany },
    platform: { count: m.platformCount, findMany: m.platformFindMany, findUnique: m.platformFindUnique },
    noticeTemplate: { findFirst: m.templateFindFirst },
    hashSubmission: {
      findFirst: m.hashFindFirst,
      findMany: m.hashFindMany,
      create: m.hashCreate,
      update: m.hashUpdate,
      updateMany: vi.fn(),
      findUnique: m.hashSubmissionFindUnique,
    },
    hashDispatch: { findUnique: m.dispatchFindUnique, count: m.dispatchCount, createMany: m.dispatchCreateMany },
  },
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1", emailHash: "h" } }) }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: async () => ({ ok: true, session: { sub: "admin-1" } }) }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: m.getCaseForUser }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ encryptField: (v: string) => `enc:${v.length}`, decryptField: () => Buffer.from("pdf").toString("base64") }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendNoticeDraft: m.sendNoticeDraft }));
vi.mock("@/lib/notice-dispatch", () => ({ assertVerifiedNoticeRecipient: vi.fn() }));
vi.mock("@/lib/case-hash-annex", () => ({
  buildSignedHashAnnex: async () => ({ ok: true, annex: { text: "Annex", hashSubmissionIds: ["hash-1"] } }),
  voidSignaturesWithRejectedFingerprints: vi.fn(),
  signableHashIds: async () => ["hash-1"],
}));

import { POST as addHashes } from "@/app/api/cases/[caseId]/hashes/route";
import { POST as approve } from "@/app/api/admin/hashes/[hashId]/approve/route";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { fingerprintsClosed } from "@/lib/hash-submission";
import { findSignableHashAdvisory } from "@/lib/signable-notice";

const P1 = "7a1b2c3d-0000-4000-8000-000000000001";
const P2 = "7a1b2c3d-0000-4000-8000-000000000002";
const P3 = "7a1b2c3d-0000-4000-8000-000000000003";
const FORM = "7a1b2c3d-0000-4000-8000-000000000004";

const template = {
  id: "advisory-v1",
  templateType: "HASH_ADVISORY",
  subjectTemplate: "Advisory {{caseReference}}",
  bodyTemplate: "Advisory body",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

const platforms: Record<string, Record<string, unknown>> = {
  [P1]: { id: P1, name: "One", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: "one@example.invalid", formUrl: null },
  [P2]: { id: P2, name: "Two", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: "two@example.invalid", formUrl: null },
  [P3]: { id: P3, name: "Three", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: "three@example.invalid", formUrl: null },
  [FORM]: { id: FORM, name: "Form", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: null, formUrl: "https://form.example.invalid" },
};

const signedCase = {
  id: "case-1",
  referenceNumber: "ASMITA-2026-00001",
  signedHashAdvisoryPdf: "enc",
  hashAdvisorySignedHashIds: ["hash-1"],
  hashAdvisorySignedTemplateId: null,
  hashAdvisorySignedTemplateDigest: null,
};

const approvedRow = {
  id: "hash-1", algorithm: "PDQ", hashDigest: "d", quality: 90, status: "APPROVED",
  flaggedForReview: false, flagReason: null, submittedAt: new Date(),
};

beforeEach(() => {
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
  m.caseFindUnique.mockReset().mockResolvedValue(signedCase);
  m.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  m.platformCount.mockReset().mockResolvedValue(1);
  m.platformFindMany.mockReset().mockResolvedValue([]);
  m.platformFindUnique.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) => platforms[where.id] ?? null);
  m.templateFindFirst.mockReset().mockResolvedValue(template);
  m.hashFindFirst.mockReset().mockResolvedValue(null);
  m.hashFindMany.mockReset().mockResolvedValue([]);
  m.hashCreate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...approvedRow, hashDigest: data.hashDigest, status: "PENDING_REVIEW",
  }));
  m.hashUpdate.mockReset().mockResolvedValue(approvedRow);
  m.hashSubmissionFindUnique.mockReset().mockResolvedValue({ caseId: "case-1", id: "hash-1", status: "PENDING_REVIEW", flagReason: null });
  m.dispatchFindUnique.mockReset().mockResolvedValue(null);
  m.dispatchCount.mockReset().mockResolvedValue(0);
  m.dispatchCreateMany.mockReset().mockResolvedValue({ count: 1 });
  m.sendNoticeDraft.mockReset().mockImplementation(async (to: string) => ({ id: `msg-${to}` }));
  m.getCaseForUser.mockReset().mockResolvedValue({ id: "case-1", createdAt: new Date().toISOString() });
});
afterEach(() => vi.unstubAllEnvs());

describe("dispatch to every chosen platform", () => {
  it("emails each email platform once, and never emails a form-only platform", async () => {
    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: [P1, P2, FORM] });
    expect(results.map((r) => [r.platformId, r.dispatched])).toEqual([[P1, true], [P2, true], [FORM, false]]);
    expect(results[2]).toMatchObject({ reason: "form_only", formUrl: "https://form.example.invalid" });
    expect(m.sendNoticeDraft.mock.calls.map((c) => c[0])).toEqual(["one@example.invalid", "two@example.invalid"]);
  });

  it("a retry after a partial failure sends only to the platforms not yet sent", async () => {
    m.sendNoticeDraft.mockImplementation(async (to: string) => {
      if (to === "two@example.invalid") throw new Error("resend_down");
      return { id: `msg-${to}` };
    });
    const first = await dispatchHashAdvisories({ caseId: "case-1", platformIds: [P1, P2, P3] });
    expect(first.map((r) => r.dispatched)).toEqual([true, false, true]);
    expect(first[1]).toMatchObject({ reason: "send_failed" });
    // P1 and P3 are recorded as sent; P2 is not.
    const sentRows = m.dispatchCreateMany.mock.calls.map((c) => c[0].data[0].platformId);
    expect(sentRows).toEqual([P1, P3]);

    m.sendNoticeDraft.mockClear().mockImplementation(async (to: string) => ({ id: `msg-${to}` }));
    m.dispatchFindUnique.mockImplementation(async ({ where }: { where: { hashSubmissionId_platformId: { platformId: string } } }) =>
      sentRows.includes(where.hashSubmissionId_platformId.platformId) ? { id: "row" } : null,
    );
    const retry = await dispatchHashAdvisories({ caseId: "case-1", platformIds: [P1, P2, P3] });
    expect(retry.map((r) => (r.dispatched ? "sent" : (r as { reason: string }).reason))).toEqual([
      "already_dispatched",
      "sent",
      "already_dispatched",
    ]);
    expect(m.sendNoticeDraft.mock.calls.map((c) => c[0])).toEqual(["two@example.invalid"]);
  });
});

describe("admin approval sends to the platforms on the signed advisory", () => {
  const approveRequest = () => new Request("https://asmita.test/api/admin/hashes/hash-1/approve", { method: "POST" });
  const ctx = { params: Promise.resolve({ hashId: "hash-1" }) };

  it("sends to every platform recorded on the advisory, not only one platform", async () => {
    m.caseFindUnique.mockResolvedValue({ ...signedCase, hashAdvisoryPlatformIds: [P1, P2, FORM] });
    const res = await approve(approveRequest(), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dispatchResults.map((r: { platformId: string }) => r.platformId)).toEqual([P1, P2, FORM]);
    expect(m.sendNoticeDraft.mock.calls.map((c) => c[0])).toEqual(["one@example.invalid", "two@example.invalid"]);
  });

  it("does not dispatch for a case whose advisory was never signed", async () => {
    m.caseFindUnique.mockResolvedValue({ signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [P1] });
    const res = await approve(approveRequest(), ctx);
    expect((await res.json()).dispatchResults).toBeNull();
    expect(m.sendNoticeDraft).not.toHaveBeenCalled();
  });
});

describe("fingerprints are added only while the case is being created", () => {
  const HASH = "ab".repeat(32);
  const post = (platformIds?: string[]) =>
    addHashes(
      new Request("https://asmita.test/api/cases/case-1/hashes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hashes: [{ hash: HASH, quality: 90 }], declaration: true, ...(platformIds ? { platformIds } : {}) }),
      }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );

  it("fingerprintsClosed: open while unsigned, closed once signed", () => {
    expect(fingerprintsClosed({ declarationSignedAt: null })).toBe(false);
    expect(fingerprintsClosed({ declarationSignedAt: new Date() })).toBe(true);
  });

  it("the creation flow's post right after the case row exists is accepted and records every email platform", async () => {
    m.caseFindUnique.mockResolvedValue({ declarationSignedAt: null, hashAdvisoryPlatformIds: [] });
    m.platformCount.mockResolvedValue(3);
    m.platformFindMany.mockResolvedValue([{ id: P1 }, { id: P2 }]);
    const res = await post([P1, P2, FORM]);
    expect(res.status).toBe(200);
    expect(m.hashCreate).toHaveBeenCalledTimes(1);
    expect(m.caseUpdateMany).toHaveBeenCalledWith({
      where: { id: "case-1", signedHashAdvisoryPdf: null },
      data: { hashAdvisoryPlatformIds: [P1, P2] },
    });
  });

  it("is refused with fingerprints_closed once the survivor has signed, even after a void", async () => {
    // A void nulls the signed PDF but never declarationSignedAt.
    m.caseFindUnique.mockResolvedValue({ declarationSignedAt: new Date(), signedHashAdvisoryPdf: null });
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "fingerprints_closed" });
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("a voided advisory can still be signed again from the case page, covering every recorded platform", async () => {
    m.caseFindUnique.mockResolvedValue({ signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [P1, P2] });
    m.hashFindMany.mockResolvedValue([{ id: "hash-1" }]);
    const found = await findSignableHashAdvisory("case-1", false);
    expect(found).toMatchObject({ hashIds: ["hash-1"], platformIds: [P1, P2] });
  });
});
