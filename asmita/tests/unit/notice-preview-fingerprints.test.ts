import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The preview reference binds the fingerprints the preview listed, so a
// fingerprint added or rejected before signing makes signing refuse; and a
// hash advisory that is unsigned (never signed, or voided) can be signed from
// the case page with the same call, pin and stored ids as the creation flow.

type Hash = {
  id: string;
  caseId: string;
  status: string;
  hashEncrypted: string;
  quality: number;
  clientVersion: string | null;
  submittedAt: Date;
  requestedPlatformId: string | null;
  requestedPlatform: { isActive: boolean; noticeBasis: string } | null;
};

const state = vi.hoisted(() => ({
  owner: true,
  hashes: [] as Hash[],
  caseRow: null as null | { signedHashAdvisoryPdf: string | null; hashAdvisoryPlatformIds: string[]; declarationSignedAt: Date | null },
  dispatches: 0,
  template: null as null | Record<string, unknown>,
  caseUpdateMany: vi.fn(),
  urlUpdateMany: vi.fn(),
}));

function matches(h: Hash, where: Record<string, unknown>) {
  if (where.caseId !== undefined && h.caseId !== where.caseId) return false;
  const status = where.status as { not?: string } | undefined;
  if (status?.not && h.status === status.not) return false;
  const ids = where.id as { in?: string[] } | undefined;
  if (ids?.in && !ids.in.includes(h.id)) return false;
  const platform = where.requestedPlatform as { isActive?: boolean; noticeBasis?: { not: string } } | undefined;
  if (platform) {
    if (!h.requestedPlatform) return false;
    if (platform.isActive !== undefined && h.requestedPlatform.isActive !== platform.isActive) return false;
    if (platform.noticeBasis && h.requestedPlatform.noticeBasis === platform.noticeBasis.not) return false;
  }
  return true;
}

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/case-ops", () => ({
  getCaseForUser: async () => (state.owner ? { id: "case-1", referenceNumber: "ASMITA-2026-00001" } : null),
}));
vi.mock("@/lib/encryption", () => ({
  decryptField: () => "ab".repeat(32),
  encryptField: (value: string) => `enc:${value.length}`,
}));
vi.mock("@/lib/notice-pdf", () => ({ generateNoticePdf: async () => Buffer.from("%PDF-synthetic"), noticePdfErrorCode: () => "notice_pdf_failed" }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/hash-dispatch", () => ({ dispatchHashAdvisories: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const rows = state.hashes.filter((h) => matches(h, where)).sort((a, b) => +a.submittedAt - +b.submittedAt);
        return select ? rows.map((h) => Object.fromEntries(Object.keys(select).map((k) => [k, h[k as keyof Hash]]))) : rows;
      },
      updateMany: vi.fn(),
    },
    case: { findUnique: async () => state.caseRow, updateMany: state.caseUpdateMany },
    hashDispatch: { count: async () => state.dispatches },
    noticeTemplate: { findFirst: async () => state.template },
    submittedUrl: {
      findFirst: async () => ({
        id: "url-1",
        status: "NOTICE_QUEUED",
        urlEncrypted: "encrypted-url",
        submittedAt: new Date(),
        signedNoticePdf: null,
        case: { referenceNumber: "ASMITA-2026-00001", declarationSignedAt: null },
        platform: { id: "platform-1", name: "Example Platform", noticeBasis: "IT_RULES_2021", isActive: true, lastContactVerifiedByHuman: true, grievanceEmail: "go@example.com" },
      }),
      updateMany: state.urlUpdateMany,
    },
  },
}));

import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";
import { POST as signAdvisory } from "@/app/api/cases/[caseId]/sign-hash-advisory/route";
import { GET as previewAdvisory } from "@/app/api/cases/[caseId]/preview-hash-advisory/route";
import { buildHashAnnexForSigning, signableHashIds } from "@/lib/case-hash-annex";
import { findSignableHashAdvisory } from "@/lib/signable-notice";
import { templateDigest, templateRef } from "@/lib/signed-template";

const params = { params: Promise.resolve({ caseId: "case-1" }) };
const ID_A = "5f0c1d2e-0000-4000-8000-00000000000a";
const ID_B = "5f0c1d2e-0000-4000-8000-00000000000b";
const EMAIL_PLATFORM = "7a1b2c3d-0000-4000-8000-000000000001";
const FORM_PLATFORM = "7a1b2c3d-0000-4000-8000-000000000002";

const noticeTemplate = {
  id: "9e8d7c6b-0000-4000-8000-000000000001",
  platformId: null,
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} at {{url}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};
const advisoryTemplate = { ...noticeTemplate, id: "9e8d7c6b-0000-4000-8000-000000000002", templateType: "HASH_ADVISORY", bodyTemplate: "Advisory {{caseReference}}" };

function hash(id: string, extra: Partial<Hash> = {}): Hash {
  return {
    id,
    caseId: "case-1",
    status: "PENDING_REVIEW",
    hashEncrypted: "encrypted-hash",
    quality: 90,
    clientVersion: "pdq-test",
    submittedAt: new Date(id === ID_A ? "2026-11-01T00:00:00Z" : "2026-11-02T00:00:00Z"),
    requestedPlatformId: EMAIL_PLATFORM,
    requestedPlatform: { isActive: true, noticeBasis: "IT_RULES_2021" },
    ...extra,
  };
}

const details = { name: "Example Person", signature: "Example Person", contact: "person@example.invalid" };
const noticeSign = (ref: string) =>
  new Request("https://asmita.test/api/cases/case-1/sign-notice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urlId: "url-1", templateRef: ref, ...details }),
  });
const advisorySign = (ref: string, platformIds: string[]) =>
  new Request("https://asmita.test/api/cases/case-1/sign-hash-advisory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templateRef: ref, platformIds, ...details }),
  });

beforeEach(() => {
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
  state.owner = true;
  state.hashes = [hash(ID_A)];
  state.caseRow = { signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [], declarationSignedAt: new Date("2026-11-01T00:00:00Z") };
  state.dispatches = 0;
  state.template = advisoryTemplate;
  state.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  state.urlUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("the preview reference binds the fingerprints", () => {
  it("contains no fingerprint id and stays within the schema limit", () => {
    const ref = templateRef(advisoryTemplate, [ID_A, ID_B]);
    expect(ref).not.toContain(ID_A);
    expect(ref).not.toContain(ID_B);
    expect(ref.length).toBeLessThanOrEqual(200);
    // Order does not matter; the set does.
    expect(templateRef(advisoryTemplate, [ID_B, ID_A])).toBe(ref);
    expect(templateRef(advisoryTemplate, [ID_A])).not.toBe(ref);
  });

  it("the sign page's id-only lookup gives the same ids as the annex the preview renders", async () => {
    state.hashes = [hash(ID_B), hash(ID_A), hash("5f0c1d2e-0000-4000-8000-00000000000c", { status: "REJECTED" })];
    expect(await signableHashIds("case-1")).toEqual((await buildHashAnnexForSigning("case-1")).hashSubmissionIds);
    expect(await signableHashIds("case-1")).toEqual([ID_A, ID_B]);
  });

  it("URL notice: accepts an unchanged set, refuses a fingerprint added or rejected since preview", async () => {
    state.template = noticeTemplate;
    const previewed = templateRef(noticeTemplate, [ID_A]);

    state.hashes = [hash(ID_A), hash(ID_B)];
    const added = await signNotice(noticeSign(previewed), params);
    expect(added.status).toBe(409);
    expect(await added.json()).toEqual({ error: "notice_changed_since_preview" });

    state.hashes = [hash(ID_A, { status: "REJECTED" })];
    const rejected = await signNotice(noticeSign(previewed), params);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(state.urlUpdateMany).not.toHaveBeenCalled();

    state.hashes = [hash(ID_A)];
    const unchanged = await signNotice(noticeSign(previewed), params);
    expect(unchanged.status).toBe(200);
    expect(state.urlUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signedHashSubmissionIds: [ID_A] }) }),
    );
  });

  it("hash advisory: accepts an unchanged set, refuses a fingerprint added or rejected since preview", async () => {
    const previewed = templateRef(advisoryTemplate, [ID_A]);

    state.hashes = [hash(ID_A), hash(ID_B)];
    const added = await signAdvisory(advisorySign(previewed, [EMAIL_PLATFORM]), params);
    expect(added.status).toBe(409);
    expect(await added.json()).toEqual({ error: "notice_changed_since_preview" });

    state.hashes = [hash(ID_A, { status: "REJECTED" }), hash(ID_B)];
    const rejected = await signAdvisory(advisorySign(previewed, [EMAIL_PLATFORM]), params);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(state.caseUpdateMany).not.toHaveBeenCalled();

    state.hashes = [hash(ID_A)];
    const unchanged = await signAdvisory(advisorySign(previewed, [EMAIL_PLATFORM]), params);
    expect(unchanged.status).toBe(200);
  });

  it("a held preview reference is refused by the advisory preview once a fingerprint is added", async () => {
    const first = await previewAdvisory(new NextRequest("https://asmita.test/api/cases/case-1/preview-hash-advisory"), params);
    const ref = first.headers.get("X-Notice-Template-Ref")!;
    expect(ref).toBe(templateRef(advisoryTemplate, [ID_A]));
    state.hashes = [hash(ID_A), hash(ID_B)];
    const stale = await previewAdvisory(
      new NextRequest(`https://asmita.test/api/cases/case-1/preview-hash-advisory?templateRef=${encodeURIComponent(ref)}`),
      params,
    );
    expect(stale.status).toBe(409);
  });
});

describe("signing the hash advisory from the case page", () => {
  it("a voided advisory reuses the platforms already chosen and stores the same state as the creation flow", async () => {
    // Creation flow: ref from the preview header, platforms from the draft.
    const preview = await previewAdvisory(new NextRequest("https://asmita.test/api/cases/case-1/preview-hash-advisory"), params);
    const created = await signAdvisory(advisorySign(preview.headers.get("X-Notice-Template-Ref")!, [EMAIL_PLATFORM]), params);
    expect(created.status).toBe(200);
    const creationWrite = state.caseUpdateMany.mock.calls[0][0];

    // A void clears the signature, pin and ids but keeps the platforms.
    state.caseRow = { ...state.caseRow!, signedHashAdvisoryPdf: null, hashAdvisoryPlatformIds: [EMAIL_PLATFORM] };
    state.caseUpdateMany.mockClear();
    const advisory = await findSignableHashAdvisory("case-1", false);
    expect(advisory).toMatchObject({ hashIds: [ID_A], platformIds: [EMAIL_PLATFORM] });

    // Case page: ref and platforms exactly as the sign page builds them.
    const resigned = await signAdvisory(advisorySign(templateRef(advisory!.template, advisory!.hashIds), advisory!.platformIds), params);
    expect(resigned.status).toBe(200);
    const resignWrite = state.caseUpdateMany.mock.calls[0][0];
    expect(resignWrite).toEqual(creationWrite);
    expect(resignWrite).toEqual({
      where: { id: "case-1", signedHashAdvisoryPdf: null },
      data: {
        signedHashAdvisoryPdf: expect.stringMatching(/^enc:/),
        hashAdvisoryPlatformIds: [EMAIL_PLATFORM],
        hashAdvisorySignedHashIds: [ID_A],
        hashAdvisorySignedTemplateId: advisoryTemplate.id,
        hashAdvisorySignedTemplateDigest: templateDigest(advisoryTemplate),
      },
    });
  });

  it("a never-signed advisory uses the email platforms recorded on the fingerprints", async () => {
    state.hashes = [hash(ID_A), hash(ID_B, { requestedPlatformId: FORM_PLATFORM, requestedPlatform: { isActive: true, noticeBasis: "FORM_ONLY" } })];
    expect(await findSignableHashAdvisory("case-1", false)).toMatchObject({ hashIds: [ID_A, ID_B], platformIds: [EMAIL_PLATFORM] });
  });

  it("is not offered when already signed, with no eligible fingerprint, after a send, with no email platform, or with no reviewed template", async () => {
    state.caseRow = { ...state.caseRow!, signedHashAdvisoryPdf: "enc:signed" };
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
    state.caseRow = { ...state.caseRow!, signedHashAdvisoryPdf: null };

    state.hashes = [hash(ID_A, { status: "REJECTED" })];
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
    state.hashes = [hash(ID_A)];

    state.dispatches = 1;
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
    state.dispatches = 0;

    state.hashes = [hash(ID_A, { requestedPlatformId: null, requestedPlatform: null })];
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
    state.hashes = [hash(ID_A)];

    state.template = null;
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
    state.template = advisoryTemplate;

    vi.stubEnv("ENABLE_HASH_UPLOAD", "");
    expect(await findSignableHashAdvisory("case-1", false)).toBeNull();
  });

  it("signing refuses when already signed (including a concurrent signature), with no eligible fingerprint, or for another survivor's case", async () => {
    const ref = templateRef(advisoryTemplate, [ID_A]);

    state.caseRow = { ...state.caseRow!, signedHashAdvisoryPdf: "enc:signed" };
    const signed = await signAdvisory(advisorySign(ref, [EMAIL_PLATFORM]), params);
    expect(signed.status).toBe(409);
    expect(await signed.json()).toEqual({ error: "already_signed" });
    state.caseRow = { ...state.caseRow!, signedHashAdvisoryPdf: null };

    state.caseUpdateMany.mockResolvedValueOnce({ count: 0 });
    const raced = await signAdvisory(advisorySign(ref, [EMAIL_PLATFORM]), params);
    expect(raced.status).toBe(409);
    expect(await raced.json()).toEqual({ error: "already_signed" });

    state.hashes = [hash(ID_A, { status: "REJECTED" })];
    const none = await signAdvisory(advisorySign(ref, [EMAIL_PLATFORM]), params);
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({ error: "no_hashes" });
    state.hashes = [hash(ID_A)];

    state.owner = false;
    state.caseUpdateMany.mockClear();
    const other = await signAdvisory(advisorySign(ref, [EMAIL_PLATFORM]), params);
    expect(other.status).toBe(404);
    expect(state.caseUpdateMany).not.toHaveBeenCalled();
  });
});
