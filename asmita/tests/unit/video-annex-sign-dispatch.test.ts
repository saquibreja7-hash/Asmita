import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Videos in notices, consent and review (video-fingerprints spec WP19).
// A video fingerprint is one annex entry everywhere the single annex builder
// feeds - the advisory she signs, the email the platform receives - and
// dispatch sends exactly the signed set: a video added after signing never
// rides an old signature, and admin approval of a video behaves like an
// image (auto-dispatch only to the platforms on her signed advisory list).
//
// Real annex, sign, approval and dispatch code; only the database, email
// and PDF modules are faked. Synthetic frame hashes only - no video bytes
// exist anywhere in this suite.

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  caseRow: {} as Record<string, unknown>,
  templates: {} as Record<string, Record<string, unknown>>,
  platforms: {} as Record<string, Record<string, unknown>>,
  dispatchRows: [] as Array<Record<string, unknown>>,
  emails: [] as Array<{ to: string; subject: string; body: string; attachment: string }>,
  pdfBodies: [] as string[],
}));

type FindWhere = {
  caseId?: string;
  status?: { not?: string; in?: string[] };
  id?: { in?: string[] };
};

vi.mock("@/lib/db", () => {
  const project = (row: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row };
  const rows = () => state.rows as Array<Record<string, unknown> & { id: string; caseId: string; status: string; submittedAt: Date }>;
  return {
    db: {
      hashSubmission: {
        findMany: vi.fn(async ({ where = {}, select }: { where?: FindWhere; select?: Record<string, boolean> }) =>
          rows()
            .filter(
              (row) =>
                (where.caseId === undefined || row.caseId === where.caseId) &&
                (where.status?.not !== undefined ? row.status !== where.status.not : true) &&
                (where.id?.in ? where.id.in.includes(row.id) : true),
            )
            .sort((a, b) => +a.submittedAt - +b.submittedAt)
            .map((row) => project(row, select)),
        ),
        findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const row = rows().find((r) => r.id === where.id);
          return row ? project(row, select) : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows().find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row ? { ...row } : null;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id?: { in?: string[] }; status?: string }; data: Record<string, unknown> }) => {
          const matching = rows().filter(
            (row) => (where.id?.in ? where.id.in.includes(row.id) : true) && (where.status ? row.status === where.status : true),
          );
          for (const row of matching) Object.assign(row, data);
          return { count: matching.length };
        }),
      },
      case: {
        findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          if (where.id !== state.caseRow.id) return null;
          return select ? Object.fromEntries(Object.keys(select).map((key) => [key, state.caseRow[key]])) : { ...state.caseRow };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; signedHashAdvisoryPdf?: string | null }; data: Record<string, unknown> }) => {
          const applies =
            where.id === state.caseRow.id &&
            (where.signedHashAdvisoryPdf === undefined ||
              (where.signedHashAdvisoryPdf === null ? state.caseRow.signedHashAdvisoryPdf === null : true));
          if (applies) Object.assign(state.caseRow, data);
          return { count: applies ? 1 : 0 };
        }),
      },
      noticeTemplate: {
        findFirst: vi.fn(async ({ where }: { where: { templateType: string } }) => state.templates[where.templateType] ?? null),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          Object.values(state.templates).find((template) => template.id === where.id) ?? null,
        ),
      },
      platform: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.platforms[where.id] ?? null),
      },
      hashDispatch: {
        findUnique: vi.fn(async () => null),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          state.dispatchRows.push(...data);
          return { count: data.length };
        }),
      },
    },
  };
});

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: async () => ({ ok: true, session: { sub: "admin-1" } }) }));
vi.mock("@/lib/case-ops", () => ({
  getCaseForUser: async () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00001" }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendNoticeDraft: vi.fn(async (to: string, subject: string, body: string, attachments?: Array<{ content: Buffer }>) => {
    state.emails.push({ to, subject, body, attachment: attachments?.[0]?.content.toString("utf8") ?? "" });
    return { id: "email-1" };
  }),
}));
vi.mock("@/lib/notice-dispatch", () => ({ assertVerifiedNoticeRecipient: vi.fn() }));
vi.mock("@/lib/notice-pdf", () => ({
  generateNoticePdf: vi.fn(async (input: { noticeBody: string }) => {
    state.pdfBodies.push(input.noticeBody);
    return Buffer.from("%PDF-advisory");
  }),
  noticePdfErrorCode: () => "notice_pdf_failed",
}));

import { POST as signAdvisory } from "@/app/api/cases/[caseId]/sign-hash-advisory/route";
import { POST as approveHash } from "@/app/api/admin/hashes/[hashId]/approve/route";
import { buildHashAnnexForSigning, buildSignedHashAnnex, buildRepresentativeHashAnnex } from "@/lib/case-hash-annex";
import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { encryptField } from "@/lib/encryption";
import { templateDigest, templateRef } from "@/lib/signed-template";

const IMG_ID = "5f0c1d2e-0000-4000-8000-00000000000a";
const VID_ID = "5f0c1d2e-0000-4000-8000-00000000000b";
const P1 = "7a1b2c3d-0000-4000-8000-000000000001";
const P2 = "7a1b2c3d-0000-4000-8000-000000000002";
const P3 = "7a1b2c3d-0000-4000-8000-000000000003";

const IMG_HASH = "a".repeat(64);
const F1 = "b".repeat(64);
const F2 = "c".repeat(64);
const F3 = "d".repeat(64);
const FRAMES = [
  { hash: F1, quality: 80, t: 0 },
  { hash: F2, quality: 95, t: 1 },
  { hash: F3, quality: 60, t: 2 },
];

const advisoryTemplate = {
  id: "advisory-t1",
  platformId: null,
  templateType: "HASH_ADVISORY",
  subjectTemplate: "Hash advisory {{caseReference}}",
  bodyTemplate: "Advisory body for {{platformName}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

const SIGNED_PDF_BYTES = "%PDF-advisory";

function imageRow(id: string, submittedAt: Date, status = "PENDING_REVIEW") {
  return {
    id,
    caseId: "case-1",
    algorithm: "PDQ",
    hashEncrypted: encryptField(IMG_HASH),
    hashDigest: `digest-${id}`,
    quality: 92,
    clientVersion: "pdq-1",
    videoFramesEncrypted: null,
    videoFrameCount: null,
    videoDurationSec: null,
    status,
    flaggedForReview: false,
    flagReason: null,
    submittedAt,
    reviewedAt: null,
    reviewedById: null,
    requestedPlatformId: P1,
  };
}

function videoRow(id: string, submittedAt: Date, status = "PENDING_REVIEW") {
  // As WP17 stores it: the best frame's hash on the row, the frame list
  // encrypted beside it, both written the way the submission route does.
  return {
    ...imageRow(id, submittedAt, status),
    algorithm: "VPDQ",
    hashEncrypted: encryptField(F2),
    quality: 95,
    clientVersion: "vpdq-0.1.0",
    hashDigest: `digest-${id}`,
    videoFramesEncrypted: encryptField(JSON.stringify(FRAMES)),
    videoFrameCount: FRAMES.length,
    videoDurationSec: 300,
  };
}

function signedCase(signedIds: string[], platformIds: string[]) {
  return {
    id: "case-1",
    referenceNumber: "ASMITA-2026-00001",
    signedHashAdvisoryPdf: encryptField(Buffer.from(SIGNED_PDF_BYTES).toString("base64")),
    hashAdvisorySignedHashIds: signedIds,
    hashAdvisorySignedTemplateId: advisoryTemplate.id,
    hashAdvisorySignedTemplateDigest: templateDigest(advisoryTemplate),
    hashAdvisoryPlatformIds: platformIds,
    declarationSignedAt: new Date("2026-11-01T00:00:00Z"),
  };
}

const params = { params: Promise.resolve({ caseId: "case-1" }) };
const approveParams = (hashId: string) => ({ params: Promise.resolve({ hashId }) });
const signRequest = (ref: string) =>
  new Request("https://asmita.test/api/cases/case-1/sign-hash-advisory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Example Person",
      contact: "person@example.invalid",
      platformIds: [P1],
      templateRef: ref,
    }),
  });
const approveRequest = (hashId: string) =>
  new Request(`https://asmita.test/api/admin/hashes/${hashId}/approve`, { method: "POST" });

const EMAIL_PLATFORMS = {
  [P1]: { id: P1, name: "One", isActive: true, noticeBasis: "IT_RULES_2021", grievanceEmail: "one@example.invalid", formUrl: null, lastContactVerifiedByHuman: true },
  [P2]: { id: P2, name: "Two", isActive: true, noticeBasis: "IT_RULES_2021", grievanceEmail: "two@example.invalid", formUrl: null, lastContactVerifiedByHuman: true },
  [P3]: { id: P3, name: "Three", isActive: true, noticeBasis: "IT_RULES_2021", grievanceEmail: "three@example.invalid", formUrl: null, lastContactVerifiedByHuman: true },
};

beforeEach(() => {
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  state.rows = [];
  state.caseRow = {
    id: "case-1",
    referenceNumber: "ASMITA-2026-00001",
    signedHashAdvisoryPdf: null,
    hashAdvisorySignedHashIds: [],
    hashAdvisorySignedTemplateId: null,
    hashAdvisorySignedTemplateDigest: null,
    hashAdvisoryPlatformIds: [],
    declarationSignedAt: null,
  };
  state.templates = { HASH_ADVISORY: advisoryTemplate };
  state.platforms = EMAIL_PLATFORMS;
  state.dispatchRows = [];
  state.emails = [];
  state.pdfBodies = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("annex, sign and dispatch with a mix of image and video fingerprints", () => {
  it("signing records the video's submission id like an image's, and the PDF lists both entries", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z")),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")),
    ];
    const ids = (await buildHashAnnexForSigning("case-1")).hashSubmissionIds;
    expect(ids).toEqual([IMG_ID, VID_ID]);

    const res = await signAdvisory(signRequest(templateRef(advisoryTemplate, ids)), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, pendingReview: true });

    // The signed document lists exactly the annex's ids, video included.
    expect(state.caseRow.hashAdvisorySignedHashIds).toEqual([IMG_ID, VID_ID]);
    // The PDF she signs lists the image hash and the video entry with its frame hashes.
    const pdfBody = state.pdfBodies[0];
    expect(pdfBody).toContain(`  1. ${IMG_HASH} (quality: 92/100)`);
    expect(pdfBody).toContain("  2. Video fingerprint (vPDQ, 3 frames)");
    expect(pdfBody).toContain(`       ${F1}`);
    expect(pdfBody).toContain(`       ${F2}`);
    expect(pdfBody).toContain(`       ${F3}`);
  });

  it("the dispatch email body and the signed PDF list the same entries, and both fingerprints are recorded as sent", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z")),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")),
    ];
    const ids = (await buildHashAnnexForSigning("case-1")).hashSubmissionIds;
    const signed = await signAdvisory(signRequest(templateRef(advisoryTemplate, ids)), params);
    expect(signed.status).toBe(200);
    const pdfBodyAtSigning = state.pdfBodies[0];

    // Both fingerprints are approved after signing; dispatch is the admin's step.
    for (const row of state.rows) (row as { status: string }).status = "APPROVED";
    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: [P1] });

    expect(results).toEqual([{ platformId: P1, dispatched: true, messageId: "email-1", hashCount: 2 }]);
    const email = state.emails[0];
    // The email body is byte-identical to the body of the PDF she signed,
    // so both list the same entries - the image hash and the video entry.
    expect(email.body).toBe(pdfBodyAtSigning);
    expect(email.body).toContain("  2. Video fingerprint (vPDQ, 3 frames)");
    // The attached PDF is the signed one.
    expect(email.attachment).toBe(SIGNED_PDF_BYTES);
    // Both the image and the video are recorded as dispatched to the platform.
    expect(state.dispatchRows).toEqual([
      { hashSubmissionId: IMG_ID, platformId: P1 },
      { hashSubmissionId: VID_ID, platformId: P1 },
    ]);
  });

  it("a video fingerprint added after signing is not sent under that signature", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z"), "APPROVED"),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"), "APPROVED"),
    ];
    // The advisory was signed over the image only, before the video existed.
    state.caseRow = signedCase([IMG_ID], [P1]);

    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: [P1] });
    expect(results[0]).toMatchObject({ dispatched: true, hashCount: 1 });

    const email = state.emails[0];
    expect(email.body).toContain(IMG_HASH);
    expect(email.body).not.toContain("Video fingerprint");
    // No frame hash of the later video reaches the platform.
    for (const frame of [F1, F2, F3]) expect(email.body).not.toContain(frame);
    expect(state.dispatchRows).toEqual([{ hashSubmissionId: IMG_ID, platformId: P1 }]);
  });

  it("signing refuses a video added since the preview, exactly as for an image", async () => {
    state.rows = [imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z"))];
    const previewed = templateRef(advisoryTemplate, [IMG_ID]);
    // She previews with one image; the video is submitted before she signs.
    state.rows.push(videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")));
    const res = await signAdvisory(signRequest(previewed), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notice_changed_since_preview" });
    expect(state.caseRow.signedHashAdvisoryPdf).toBeNull();
    expect(state.pdfBodies).toHaveLength(0);
  });
});

describe("a signed video whose frame list is gone", () => {
  it("is refused at dispatch rather than sent as one frame", async () => {
    const row = videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"), "APPROVED") as Record<string, unknown>;
    row.videoFramesEncrypted = null;
    state.rows = [row];
    expect(await buildSignedHashAnnex([VID_ID])).toEqual({ ok: false, reason: "signed_fingerprints_changed" });
  });
});

describe("admin approval of a video fingerprint behaves like an image", () => {
  it("auto-dispatches the signed advisory, only to the platforms on her signed list", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z"), "APPROVED"),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")),
    ];
    state.caseRow = signedCase([IMG_ID, VID_ID], [P1, P2]);

    const res = await approveHash(approveRequest(VID_ID), approveParams(VID_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submission).toMatchObject({ id: VID_ID, status: "APPROVED" });

    // Exactly the platforms on her signed advisory list - not every platform.
    expect(body.dispatchResults.map((r: { platformId: string }) => r.platformId)).toEqual([P1, P2]);
    expect(state.emails.map((email) => email.to)).toEqual(["one@example.invalid", "two@example.invalid"]);
    // The email the platform receives lists the video as one entry with its frame hashes.
    expect(state.emails[0].body).toContain("  2. Video fingerprint (vPDQ, 3 frames)");
    expect(state.emails[0].body).toContain(`       ${F1}`);
    expect(state.dispatchRows).toEqual([
      { hashSubmissionId: IMG_ID, platformId: P1 },
      { hashSubmissionId: VID_ID, platformId: P1 },
      { hashSubmissionId: IMG_ID, platformId: P2 },
      { hashSubmissionId: VID_ID, platformId: P2 },
    ]);
  });

  it("sends nothing while a fingerprint signed on the advisory is still pending review", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z")),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")),
    ];
    state.caseRow = signedCase([IMG_ID, VID_ID], [P1]);

    // Approving the video is accepted, but the image on the signed advisory
    // is still pending, so nothing is sent - the same gate an image approval
    // runs into when the other fingerprint is a video.
    const res = await approveHash(approveRequest(VID_ID), approveParams(VID_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submission).toMatchObject({ id: VID_ID, status: "APPROVED" });
    // The image on the signed advisory is still pending, so nothing is sent -
    // the same gate an image approval runs into.
    expect(body.dispatchResult).toMatchObject({ dispatched: false, reason: "fingerprints_pending_review" });
    expect(state.emails).toHaveLength(0);
    expect(state.dispatchRows).toHaveLength(0);
  });

  it("does not dispatch when no advisory was signed, whatever the algorithm", async () => {
    state.rows = [videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"))];
    state.caseRow = {
      ...signedCase([VID_ID], []),
      signedHashAdvisoryPdf: null,
      hashAdvisoryPlatformIds: [],
    };
    const res = await approveHash(approveRequest(VID_ID), approveParams(VID_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).dispatchResults).toBeNull();
    expect(state.emails).toHaveLength(0);
  });
});

describe("edge shapes of the video annex entry", () => {
  it("a VPDQ row whose frame list was cleared still lists one entry, holding the stored best frame", async () => {
    // Account erasure clears the encrypted frame list but keeps the row
    // (WP17); a preview falls back to the stored best frame's hash. Dispatch
    // of an already signed annex refuses instead (review fix, tested above):
    // it must never send something different from what she signed.
    const cleared = { ...videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"), "APPROVED"), videoFramesEncrypted: null };
    state.rows = [cleared];

    const annex = await buildHashAnnexForSigning("case-1");
    expect(annex.text).toContain("  1. Video fingerprint (vPDQ, 3 frames)");
    expect(annex.text).toContain(`       ${F2}`);
    // The best frame's hash appears exactly once: as the one listed frame.
    expect(annex.text.split(F2).length - 1).toBe(1);
  });

  it("the representative notice annex lists a matched video fingerprint as one entry", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z"), "APPROVED"),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"), "APPROVED"),
    ];
    const annex = await buildRepresentativeHashAnnex("case-1", [VID_ID]);
    expect(annex.ok).toBe(true);
    if (!annex.ok) return;
    expect(annex.annex.hashSubmissionIds).toEqual([VID_ID]);
    expect(annex.annex.text).toContain("  1. Video fingerprint (vPDQ, 3 frames)");
    expect(annex.annex.text).toContain(`       ${F2}`);
    expect(annex.annex.text).not.toContain(IMG_HASH);
  });
});
