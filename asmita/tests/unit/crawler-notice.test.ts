import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The representative notice path for crawler links (src/lib/crawl-notice.ts,
// /api/admin/findings/[id]/notice/{preview,dispatch}) on the Prisma path,
// against a small stateful fake of the client. One test per gate, plus
// digest binding, idempotency, withdrawal, tampering and audit content.
// Every URL and fingerprint is a placeholder.

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  findings: new Map<string, Record<string, unknown>>(),
  urls: new Map<string, Record<string, unknown>>(),
  consents: [] as Array<Record<string, unknown>>,
  templates: new Map<string, Record<string, unknown>>(),
  hashes: new Map<string, Record<string, unknown>>(),
  platforms: new Map<string, Record<string, unknown>>(),
  cases: new Map<string, Record<string, unknown>>(),
  accessLog: [] as Array<Record<string, unknown>>,
  sent: [] as Array<{ to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[]; key?: string }>,
  sendError: null as null | Error,
}));

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key];
    if (key === "notices") {
      const none = (cond as { none?: object }).none;
      if (none && Number(row._notices ?? 0) > 0) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as { in?: unknown[]; not?: unknown };
      if (c.in && !c.in.includes(value)) return false;
      if ("not" in c && (c.not === null ? value === null || value === undefined : value === c.not)) return false;
      continue;
    }
    if (cond === null ? value !== null && value !== undefined : value !== cond) return false;
  }
  return true;
}

const fakeDb = vi.hoisted(() => {
  const s = () => state;
  const self: Record<string, unknown> = {
    crawlFinding: {
      findUnique: async ({ where }: { where: { id: string } }) => s().findings.get(where.id) ?? null,
      deleteMany: async ({ where }: { where: Row }) => {
        let count = 0;
        for (const [id, f] of s().findings) if (matches(f, where)) { s().findings.delete(id); count += 1; }
        return { count };
      },
    },
    // WP28 (ADR 008): a withdrawal now deletes the case's SSCD embeddings
    // too; this fake has none to delete.
    findingEmbedding: {
      deleteMany: async () => ({ count: 0 }),
    },
    submittedUrl: {
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const row = [...s().urls.values()].find((u) => matches(u, where));
        if (!row) return null;
        if (!include) return { id: row.id };
        return {
          ...row,
          case: { referenceNumber: (s().cases.get(row.caseId as string) as Row).referenceNumber },
          platform: row.platformId ? s().platforms.get(row.platformId as string) ?? null : null,
        };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const u of s().urls.values()) if (matches(u, where)) { Object.assign(u, data); count += 1; }
        return { count };
      },
      count: async ({ where }: { where: Row }) => [...s().urls.values()].filter((u) => matches(u, where)).length,
      findUnique: async ({ where }: { where: { id: string } }) => s().urls.get(where.id) ?? null,
    },
    crawlConsent: {
      findFirst: async ({ where }: { where: Row }) => s().consents.filter((c) => matches(c, where))
        .sort((a, b) => (b.signedAt as Date).getTime() - (a.signedAt as Date).getTime())[0] ?? null,
      findMany: async ({ where }: { where: Row }) => s().consents.filter((c) => matches(c, where)),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const c of s().consents) if (matches(c, where)) { Object.assign(c, data); count += 1; }
        return { count };
      },
    },
    noticeTemplate: {
      findUnique: async ({ where }: { where: { id: string } }) => s().templates.get(where.id) ?? null,
      findFirst: async ({ where }: { where: Row }) => [...s().templates.values()].filter((t) => matches(t, where))
        .sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null,
    },
    hashSubmission: {
      findMany: async ({ where }: { where: Row }) => [...s().hashes.values()].filter((h) => matches(h, where)),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const h of s().hashes.values()) if (matches(h, where)) { Object.assign(h, data); count += 1; }
        return { count };
      },
    },
    adminAccessLog: { create: async ({ data }: { data: Row }) => { s().accessLog.push(data); return data; } },
  };
  self.$transaction = async (fn: (tx: unknown) => unknown) => fn(self);
  return self;
});

vi.mock("@/lib/db", () => ({ db: fakeDb }));
vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/email", () => ({
  sendNoticeDraft: vi.fn(async (to: string, subject: string, text: string, attachments?: { filename: string; content: Buffer }[], key?: string) => {
    if (state.sendError) throw state.sendError;
    state.sent.push({ to, subject, text, attachments, key });
    return { id: `msg-${state.sent.length}` };
  }),
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { inMemoryAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { withdrawCrawlConsent } from "@/lib/crawl-consent";
import { dispatchRepresentativeNotice, previewRepresentativeNotice, representativeReference } from "@/lib/crawl-notice";
import { decryptField, encryptField } from "@/lib/encryption";
import { dispatchedNotices } from "@/lib/notice-dispatch";
import { templateDigest } from "@/lib/signed-template";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { templateSeeds } from "../../prisma/template-seeds";
import { POST as previewRoute } from "@/app/api/admin/findings/[id]/notice/preview/route";
import { POST as dispatchRoute } from "@/app/api/admin/findings/[id]/notice/dispatch/route";

const PDQ = "ab".repeat(32);
const PDQ_OTHER = "cd".repeat(32);
const PAGE = "https://forum.example.com/thread/placeholder-1";
const IMAGE = "https://cdn.example.com/img/placeholder-1.jpg";
const seedOf = (type: string) => templateSeeds.find((t) => t.templateType === type)!;

function admin(sub = "admin-1") {
  return {
    ok: true as const,
    session: { sub, role: "ADMIN" as const, ageOver18: true, emailHash: "h", namespace: "admin" as const, adminRole: "CASE_REVIEWER" as const },
  };
}

function seed() {
  state.findings.clear(); state.urls.clear(); state.templates.clear(); state.hashes.clear(); state.platforms.clear(); state.cases.clear();
  state.consents.length = 0; state.accessLog.length = 0; state.sent.length = 0; state.sendError = null;
  dispatchedNotices.clear();
  inMemoryAuditLog.length = 0;

  state.cases.set("case-1", { id: "case-1", referenceNumber: "ASMITA-2026-00042" });
  state.cases.set("case-2", { id: "case-2", referenceNumber: "ASMITA-2026-00043" });
  const auth = seedOf("CRAWL_AUTHORISATION");
  state.templates.set("tpl-auth", { id: "tpl-auth", templateType: "CRAWL_AUTHORISATION", platformId: null, subjectTemplate: auth.subjectTemplate, bodyTemplate: auth.bodyTemplate, isActive: true, reviewedByLegal: true, version: 1 });
  const rep = seedOf("CRAWL_REPRESENTATIVE_NOTICE");
  state.templates.set("tpl-rep", { id: "tpl-rep", templateType: "CRAWL_REPRESENTATIVE_NOTICE", platformId: null, subjectTemplate: rep.subjectTemplate, bodyTemplate: rep.bodyTemplate, isActive: true, reviewedByLegal: true, version: 1 });
  state.hashes.set("h1", { id: "h1", caseId: "case-1", status: "APPROVED", hashEncrypted: encryptField(PDQ), quality: 90, clientVersion: "pdq-test", submittedAt: new Date("2026-11-01T00:00:00Z"), crawlPoolId: "fp_1" });
  state.hashes.set("h2", { id: "h2", caseId: "case-1", status: "APPROVED", hashEncrypted: encryptField(PDQ_OTHER), quality: 80, clientVersion: "pdq-test", submittedAt: new Date("2026-11-02T00:00:00Z"), crawlPoolId: "fp_2" });
  state.consents.push({
    id: "consent-1", caseId: "case-1", hashSubmissionIds: ["h1", "h2"], templateId: "tpl-auth",
    templateDigest: templateDigest(auth), signedAt: new Date("2026-11-10T06:00:00Z"), withdrawnAt: null,
  });
  state.platforms.set("platform-1", {
    id: "platform-1", name: "Example Forum", noticeBasis: "IT_RULES_2021", grievanceEmail: "grievance@example.org",
    formUrl: null, lastContactVerifiedByHuman: true, isActive: true, apiEndpoint: "https://api.example.org/notices", tier: "TIER_1",
  });
  const now = new Date();
  state.findings.set("cf-1", {
    id: "cf-1", caseId: "case-1", hashSubmissionId: "h1", pageUrlEncrypted: encryptField(PAGE), imageUrlEncrypted: encryptField(IMAGE),
    distance: 8, quality: 90, firstSeenAt: now, reviewStatus: "APPROVED", reviewedById: "admin-9", secondReviewedById: null,
  });
  const parsed = parseSubmittedUrl(PAGE);
  if (!parsed.ok) throw new Error("placeholder URL did not parse");
  state.urls.set("url-1", {
    id: "url-1", caseId: "case-1", status: "NOTICE_QUEUED", source: "CRAWLER", urlEncrypted: encryptField(parsed.normalizedUrl), urlHash: parsed.urlHash,
    submittedAt: now, crawlFindingId: "cf-1", signedNoticePdf: null, representativeNoticePdf: null, representativeNoticeDigest: null,
    crawlConsentWithdrawnAt: null, platformId: "platform-1", _notices: 0,
  });
}

const base = { findingId: "cf-1", caseId: "case-1", adminId: "admin-1" };

async function previewDigest(adminId = "admin-1") {
  const preview = await previewRepresentativeNotice({ ...base, adminId });
  if (!preview.ok) throw new Error(`preview refused: ${preview.error}`);
  return preview.notice.contentDigest;
}

async function expectRefusal(error: string, status = 409) {
  const result = await previewRepresentativeNotice(base);
  expect(result).toMatchObject({ ok: false, error, status });
  // Dispatch runs the same gates before it looks at the digest.
  const sent = await dispatchRepresentativeNotice({ ...base, contentDigest: "0".repeat(64) });
  expect(sent).toMatchObject({ ok: false, error, status });
  expect(state.sent).toHaveLength(0);
}

function csrfPost(path: string, body: unknown) {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
    body: JSON.stringify(body),
  });
}
const ctx = (id = "cf-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "");
  vi.mocked(requireAdminPermission).mockResolvedValue(admin());
  seed();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("representative notice: rendering", () => {
  it("names the page and image addresses, the matched fingerprint only, the authorisation and the representative", async () => {
    const preview = await previewRepresentativeNotice(base);
    if (!preview.ok) throw new Error(preview.error);
    const n = preview.notice;
    expect(n.pdfBody).toContain(`Page address: ${PAGE}`);
    expect(n.pdfBody).toContain(`Image address: ${IMAGE}`);
    expect(n.pdfBody).toContain(PDQ);
    expect(n.pdfBody).not.toContain(PDQ_OTHER);
    expect(n.fingerprintIds).toEqual(["h1"]);
    expect(n.pdfBody).toContain("consent-1");
    expect(n.pdfBody).toContain("agreed to by the Complainant on 10 November 2026");
    expect(n.pdfBody).toContain("For Asmita, as authorised representative of the Complainant");
    expect(n.pdfBody).toContain(representativeReference("admin-1"));
    expect(n.pdfBody).not.toContain("admin-1");
    expect(n.recipientEmail).toBe("grievance@example.org");
    expect(Buffer.from(preview.pdfBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  it("the email is the same notice with the addresses replaced, never the URLs", async () => {
    const preview = await previewRepresentativeNotice(base);
    if (!preview.ok) throw new Error(preview.error);
    const { pdfBody, emailBody } = preview.notice;
    expect(emailBody).not.toContain(PAGE);
    expect(emailBody).not.toContain(IMAGE);
    expect(emailBody).not.toContain("example.com");
    const normalise = (text: string) => text
      .replace(/Page address: .*/, "Page address: X").replace(/Image address: .*/, "Image address: X")
      .replace(/Location: .*/, "Location: X");
    expect(normalise(emailBody)).toBe(normalise(pdfBody));
  });

  it("the digest is stable for the same admin and day, and differs for another admin", async () => {
    expect(await previewDigest()).toBe(await previewDigest());
    expect(await previewDigest("admin-2")).not.toBe(await previewDigest());
  });
});

describe("representative notice: gates (each with its own code)", () => {
  it("ENABLE_CRAWLER off: 503 crawler_disabled on both routes", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await previewRoute(csrfPost("/api/admin/findings/cf-1/notice/preview", { caseId: "case-1" }), ctx())).status).toBe(503);
    const res = await dispatchRoute(csrfPost("/api/admin/findings/cf-1/notice/dispatch", { caseId: "case-1", contentDigest: "0".repeat(64) }), ctx());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "crawler_disabled" });
  });

  it("memory store: 503 database_required", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expectRefusal("database_required", 503);
  });

  it("finding missing, or named with another case: 404 finding_not_found", async () => {
    const tampered = await previewRepresentativeNotice({ ...base, caseId: "case-2" });
    expect(tampered).toMatchObject({ ok: false, status: 404, error: "finding_not_found" });
    expect(await previewRepresentativeNotice({ ...base, findingId: "cf-unknown" })).toMatchObject({ error: "finding_not_found" });
  });

  it("finding not approved: finding_not_approved", async () => {
    state.findings.get("cf-1")!.reviewStatus = "CANDIDATE";
    await expectRefusal("finding_not_approved");
  });

  it("a distant match without its second review: second_review_required", async () => {
    Object.assign(state.findings.get("cf-1")!, { distance: 25, secondReviewedById: null });
    await expectRefusal("second_review_required");
    state.findings.get("cf-1")!.secondReviewedById = "admin-8";
    expect((await previewRepresentativeNotice(base)).ok).toBe(true);
  });

  it("finding past retention or purged: 410 finding_expired", async () => {
    state.findings.get("cf-1")!.firstSeenAt = new Date(Date.now() - 31 * 24 * 3_600_000);
    await expectRefusal("finding_expired", 410);
    seed();
    Object.assign(state.findings.get("cf-1")!, { pageUrlEncrypted: "", imageUrlEncrypted: "" });
    await expectRefusal("finding_expired", 410);
  });

  it("no crawler link for the finding (approval reused the survivor's own link): crawler_link_not_found", async () => {
    Object.assign(state.urls.get("url-1")!, { source: "SURVIVOR", crawlFindingId: null });
    await expectRefusal("crawler_link_not_found");
  });

  it("a crawler link pointing at another case's finding: crawler_link_not_found", async () => {
    state.urls.get("url-1")!.caseId = "case-2";
    await expectRefusal("crawler_link_not_found");
  });

  it("link past retention: 410 url_expired", async () => {
    state.urls.get("url-1")!.submittedAt = new Date(Date.now() - 31 * 24 * 3_600_000);
    await expectRefusal("url_expired", 410);
  });

  it("link not queued (pending review, sent, removed): url_not_ready_for_dispatch", async () => {
    state.urls.get("url-1")!.status = "PENDING_REVIEW";
    await expectRefusal("url_not_ready_for_dispatch");
  });

  it("the finding's page no longer matches the link: finding_link_mismatch", async () => {
    state.findings.get("cf-1")!.pageUrlEncrypted = encryptField("https://forum.example.com/thread/other");
    await expectRefusal("finding_link_mismatch");
  });

  it("no live authorisation, or one that does not list the matched fingerprint: consent_withdrawn", async () => {
    state.consents[0].withdrawnAt = new Date();
    await expectRefusal("consent_withdrawn");
    seed();
    state.consents[0].hashSubmissionIds = ["h2"];
    await expectRefusal("consent_withdrawn");
  });

  it("a finding recorded under an earlier authorisation is never sent under the live one: consent_withdrawn", async () => {
    state.findings.get("cf-1")!.crawlConsentId = "consent-old";
    await expectRefusal("consent_withdrawn");
    seed();
    state.findings.get("cf-1")!.crawlConsentId = "consent-1";
    expect((await previewRepresentativeNotice(base)).ok).toBe(true);
    // A row without crawlConsentId, first seen before the live authorisation was signed.
    seed();
    state.findings.get("cf-1")!.firstSeenAt = new Date("2026-11-09T00:00:00Z");
    vi.useFakeTimers({ now: new Date("2026-11-20T00:00:00Z"), toFake: ["Date"] });
    try {
      await expectRefusal("consent_withdrawn");
    } finally {
      vi.useRealTimers();
    }
  });

  it("authorisation text changed since she signed: authorisation_template_changed", async () => {
    state.templates.get("tpl-auth")!.bodyTemplate = "edited in place";
    await expectRefusal("authorisation_template_changed");
  });

  it("authorisation template's legal review withdrawn: authorisation_template_not_reviewed", async () => {
    state.templates.get("tpl-auth")!.reviewedByLegal = false;
    await expectRefusal("authorisation_template_not_reviewed");
  });

  it("matched fingerprint no longer approved: fingerprint_not_approved", async () => {
    state.hashes.get("h1")!.status = "REJECTED";
    await expectRefusal("fingerprint_not_approved");
  });

  it("hash upload switched off: hash_upload_disabled", async () => {
    vi.stubEnv("ENABLE_HASH_UPLOAD", "false");
    await expectRefusal("hash_upload_disabled");
  });

  it("no representative template: template_missing", async () => {
    state.templates.delete("tpl-rep");
    await expectRefusal("template_missing");
  });

  it("representative template not reviewed by legal: template_not_reviewed; only the dev flag bypasses it", async () => {
    state.templates.get("tpl-rep")!.reviewedByLegal = false;
    await expectRefusal("template_not_reviewed");
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "true");
    expect((await previewRepresentativeNotice(base)).ok).toBe(true);
    // The bypass is inert in production (dev-flags.ts).
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENCRYPTION_KEY", "00".repeat(32)); // the same all-zero key the fixtures were encrypted with
    expect(await previewRepresentativeNotice(base)).toMatchObject({ ok: false, error: "template_not_reviewed" });
  });

  it("link with no known platform: platform_not_resolved", async () => {
    state.urls.get("url-1")!.platformId = null;
    await expectRefusal("platform_not_resolved");
  });

  it("inactive platform: platform_not_dispatchable", async () => {
    state.platforms.get("platform-1")!.isActive = false;
    await expectRefusal("platform_not_dispatchable");
  });

  it("form-only or unverified platforms are never emailed: verified_platform_contact_required", async () => {
    state.platforms.get("platform-1")!.lastContactVerifiedByHuman = false;
    await expectRefusal("verified_platform_contact_required");
    seed();
    Object.assign(state.platforms.get("platform-1")!, { noticeBasis: "FORM_ONLY", grievanceEmail: "<TO_BE_VERIFIED_BY_HUMAN>", formUrl: "https://forum.example.com/report" });
    expect(await previewRepresentativeNotice(base)).toEqual({
      ok: false, status: 409, error: "verified_platform_contact_required", formUrl: "https://forum.example.com/report",
    });
    expect(state.sent).toHaveLength(0);
  });

  it("the notice changed since preview: notice_changed", async () => {
    const digest = await previewDigest();
    state.hashes.get("h1")!.quality = 70; // the annex now reads differently
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "notice_changed" });
    // Another admin cannot send what admin-1 previewed: the signer line differs.
    seed();
    const theirs = await previewDigest("admin-1");
    expect(await dispatchRepresentativeNotice({ ...base, adminId: "admin-2", contentDigest: theirs })).toMatchObject({ ok: false, error: "notice_changed" });
    expect(state.sent).toHaveLength(0);
    expect(state.urls.get("url-1")!.representativeNoticePdf).toBeNull();
  });
});

describe("representative notice: dispatch", () => {
  it("sends once by email, stores the PDF of record in the representative fields and audits ids only", async () => {
    const digest = await previewDigest();
    const result = await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    expect(result).toMatchObject({ ok: true, dispatched: true, transport: "email", contentDigest: digest });
    expect(state.sent).toHaveLength(1);
    const [mail] = state.sent;
    expect(mail.to).toBe("grievance@example.org");
    expect(mail.text).not.toContain(PAGE);
    expect(mail.attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");

    const link = state.urls.get("url-1")!;
    expect(link.signedNoticePdf).toBeNull();
    expect(Buffer.from(decryptField(link.representativeNoticePdf as string), "base64").equals(mail.attachments![0].content)).toBe(true);
    expect(link).toMatchObject({
      representativeNoticeDigest: digest, representativeTemplateId: "tpl-rep", representativeConsentId: "consent-1",
      representativeSentById: "admin-1", representativeApprovedById: "admin-9",
      representativeTemplateDigest: templateDigest(state.templates.get("tpl-rep") as { subjectTemplate: string; bodyTemplate: string }),
    });

    const sent = inMemoryAuditLog.find((e) => e.eventType === "NOTICE_SENT");
    expect(sent).toMatchObject({ entityId: "url-1", actorId: "admin-1" });
    expect(sent!.data).toMatchObject({ source: "crawler", findingId: "cf-1", consentId: "consent-1", fingerprintIds: ["h1"], approvedById: "admin-9", sentById: "admin-1" });
    const serialized = JSON.stringify(inMemoryAuditLog);
    for (const leak of [PAGE, IMAGE, "forum.example.com", "cdn.example.com", PDQ]) expect(serialized).not.toContain(leak);
  });

  it("the dispatching admin may be the approver; both ids are recorded", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-9"));
    const digest = await previewDigest("admin-9");
    expect((await dispatchRepresentativeNotice({ ...base, adminId: "admin-9", contentDigest: digest })).ok).toBe(true);
    expect(state.urls.get("url-1")).toMatchObject({ representativeSentById: "admin-9", representativeApprovedById: "admin-9" });
  });

  it("a second dispatch never emails twice", async () => {
    const digest = await previewDigest();
    await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    const again = await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    expect(again).toMatchObject({ ok: true, dispatched: false });
    expect(state.sent).toHaveLength(1);
    // Once recorded as sent (database persistence), the link is no longer queued.
    state.urls.get("url-1")!.status = "NOTICE_SENT";
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "url_not_ready_for_dispatch" });
    expect(state.sent).toHaveLength(1);
  });

  it("a retry after an unrecorded send resends the stored bytes; Resend's refusal is email_already_sent and keeps the record", async () => {
    const digest = await previewDigest();
    await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    const firstPdf = state.sent[0].attachments![0].content;
    dispatchedNotices.clear(); // the isolate that recorded it is gone
    state.sendError = new Error("email_already_sent");
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "email_already_sent" });
    expect(state.urls.get("url-1")!.representativeNoticeDigest).toBe(digest);
    state.sendError = null;
    await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    expect(state.sent[1].attachments![0].content.equals(firstPdf)).toBe(true);
    expect(state.sent[1].key).toBe(state.sent[0].key);
  });

  it("a stored attempt with different content is never replaced: earlier_attempt_unconfirmed", async () => {
    Object.assign(state.urls.get("url-1")!, { representativeNoticePdf: encryptField("JVBERi0="), representativeNoticeDigest: "f".repeat(64) });
    const digest = await previewDigest();
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "earlier_attempt_unconfirmed" });
    expect(state.sent).toHaveLength(0);
  });

  it("a failed send keeps the stored notice, and the retry resends exactly it", async () => {
    const digest = await previewDigest();
    state.sendError = new Error("email_send_failed:network");
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, status: 502, error: "send_failed" });
    const stored = state.urls.get("url-1")!.representativeNoticePdf as string;
    expect(stored).toBeTruthy();
    state.sendError = null;
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: true, dispatched: true });
    expect(state.sent[0].attachments![0].content.equals(Buffer.from(decryptField(stored), "base64"))).toBe(true);
  });

  it("another request holding the claim: dispatch_in_progress", async () => {
    const digest = await previewDigest();
    const update = fakeDb.submittedUrl as { updateMany: (args: unknown) => Promise<{ count: number }> };
    const original = update.updateMany;
    update.updateMany = async () => ({ count: 0 });
    try {
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "dispatch_in_progress" });
    } finally {
      update.updateMany = original;
    }
    expect(state.sent).toHaveLength(0);
  });

  it("her own report converting the link just before the claim: link_now_survivor_owned, not dispatch_in_progress", async () => {
    const digest = await previewDigest();
    const update = fakeDb.submittedUrl as { updateMany: (args: unknown) => Promise<{ count: number }> };
    const original = update.updateMany;
    // Her conversion (case-ops addUrlsToCase) wins the row between the gates and the claim.
    update.updateMany = async () => {
      Object.assign(state.urls.get("url-1")!, { source: "SURVIVOR", crawlFindingId: null });
      return { count: 0 };
    };
    try {
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, status: 409, error: "link_now_survivor_owned" });
    } finally {
      update.updateMany = original;
    }
    expect(state.sent).toHaveLength(0);
  });

  it("a link gone, or stopped by a withdrawal, when the claim loses: crawler_link_not_found / consent_withdrawn", async () => {
    const digest = await previewDigest();
    const update = fakeDb.submittedUrl as { updateMany: (args: unknown) => Promise<{ count: number }> };
    const original = update.updateMany;
    try {
      update.updateMany = async () => (Object.assign(state.urls.get("url-1")!, { crawlConsentWithdrawnAt: new Date() }), { count: 0 });
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "consent_withdrawn" });
      state.urls.get("url-1")!.crawlConsentWithdrawnAt = null;
      update.updateMany = async () => (state.urls.delete("url-1"), { count: 0 });
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "crawler_link_not_found" });
    } finally {
      update.updateMany = original;
    }
    expect(state.sent).toHaveLength(0);
  });

  it("a withdrawal landing right after the claim releases it and sends nothing", async () => {
    const digest = await previewDigest();
    const consents = fakeDb.crawlConsent as { findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown> };
    const original = consents.findFirst;
    consents.findFirst = async (args) => {
      // The post-claim re-check asks by consent id: withdraw just before it.
      if (args.where.id) state.consents[0].withdrawnAt = new Date();
      return original(args);
    };
    try {
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "consent_withdrawn" });
    } finally {
      consents.findFirst = original;
    }
    expect(state.sent).toHaveLength(0);
    expect(state.urls.get("url-1")!.representativeNoticePdf).toBeNull();
  });

  it("an earlier stored attempt is never released by a withdrawal re-check", async () => {
    const digest = await previewDigest();
    state.sendError = new Error("email_send_failed:network");
    await dispatchRepresentativeNotice({ ...base, contentDigest: digest });
    state.sendError = null;
    const consents = fakeDb.crawlConsent as { findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown> };
    const original = consents.findFirst;
    consents.findFirst = async (args) => {
      if (args.where.id) state.consents[0].withdrawnAt = new Date();
      return original(args);
    };
    try {
      expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "consent_withdrawn" });
    } finally {
      consents.findFirst = original;
    }
    expect(state.urls.get("url-1")!.representativeNoticeDigest).toBe(digest);
  });

  it("stays on email even with the platform API configured for the platform", async () => {
    vi.stubEnv("ENABLE_PLATFORM_API", "true");
    vi.stubEnv("TIER1_API_ENABLED_PLATFORMS", "platform-1");
    vi.stubEnv("TIER1_API_ACCESS_TOKEN", "placeholder-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await dispatchRepresentativeNotice({ ...base, contentDigest: await previewDigest() });
    expect(result).toMatchObject({ ok: true, transport: "email" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.sent).toHaveLength(1);
    fetchSpy.mockRestore();
  });
});

describe("withdrawal between approval and dispatch", () => {
  it("stops unsent crawler links for good, even under a later authorisation; sent links are untouched", async () => {
    const parsed = parseSubmittedUrl("https://forum.example.com/thread/placeholder-sent");
    if (!parsed.ok) throw new Error("parse");
    state.urls.set("url-sent", { ...state.urls.get("url-1")!, id: "url-sent", crawlFindingId: "cf-sent", status: "NOTICE_SENT", _notices: 1, urlHash: parsed.urlHash });
    state.urls.set("url-survivor", { ...state.urls.get("url-1")!, id: "url-survivor", source: "SURVIVOR", crawlFindingId: null, _notices: 0 });
    const digest = await previewDigest();

    expect(await withdrawCrawlConsent("case-1", "user-1")).toEqual({ ok: true, candidatesDeleted: 0 });
    expect(state.urls.get("url-1")!.crawlConsentWithdrawnAt).toBeInstanceOf(Date);
    expect(state.urls.get("url-sent")!.crawlConsentWithdrawnAt).toBeNull();
    expect(state.urls.get("url-survivor")!.crawlConsentWithdrawnAt).toBeNull();
    expect(await dispatchRepresentativeNotice({ ...base, contentDigest: digest })).toMatchObject({ ok: false, error: "consent_withdrawn" });
    expect(inMemoryAuditLog.find((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN")?.data).toMatchObject({ linksStopped: 1 });

    // She signs again: the old link stays unsendable.
    state.consents.push({ ...state.consents[0], id: "consent-2", withdrawnAt: null, signedAt: new Date() });
    await expectRefusal("consent_withdrawn");
  });
});

describe("routes", () => {
  it("preview logs the reveal before answering and returns the shape the admin UI uses", async () => {
    const res = await previewRoute(csrfPost("/api/admin/findings/cf-1/notice/preview", { caseId: "case-1" }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "approvedById", "body", "caseId", "caseReference", "consent", "contentDigest", "emailBody", "findingId", "fingerprintIds",
      "noticeDate", "pdfBase64", "platformName", "recipientEmail", "secondApprovedById", "signedAs", "subject", "templateId", "transport", "urlId",
    ]);
    expect(state.accessLog).toEqual([expect.objectContaining({ adminId: "admin-1", action: "finding_notice_previewed", entityType: "CrawlFinding", entityId: "cf-1" })]);
    expect(inMemoryAuditLog.some((e) => e.eventType === "URL_REVEALED" && e.entityId === "cf-1")).toBe(true);

    const sent = await dispatchRoute(csrfPost("/api/admin/findings/cf-1/notice/dispatch", { caseId: "case-1", contentDigest: body.contentDigest }), ctx());
    expect(sent.status).toBe(200);
    expect(await sent.json()).toMatchObject({ dispatched: true, transport: "email", contentDigest: body.contentDigest });
  });

  it("a refused preview reveals nothing and logs nothing", async () => {
    state.templates.get("tpl-rep")!.reviewedByLegal = false;
    const res = await previewRoute(csrfPost("/api/admin/findings/cf-1/notice/preview", { caseId: "case-1" }), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "template_not_reviewed" });
    expect(state.accessLog).toHaveLength(0);
  });

  it("dispatch needs the findings permission, CSRF and a digest; extra fields are refused", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "forbidden" } as never);
    expect((await dispatchRoute(csrfPost("/api/admin/findings/cf-1/notice/dispatch", { caseId: "case-1", contentDigest: "0".repeat(64) }), ctx())).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("findings:review");
    vi.mocked(requireAdminPermission).mockResolvedValue(admin());
    const noCsrf = new Request("https://asmita.test/api/admin/findings/cf-1/notice/dispatch", { method: "POST", body: "{}" });
    expect((await dispatchRoute(noCsrf, ctx())).status).toBe(403);
    expect((await dispatchRoute(csrfPost("/x", { caseId: "case-1" }), ctx())).status).toBe(400);
    expect((await dispatchRoute(csrfPost("/x", { caseId: "case-1", contentDigest: "0".repeat(64), recipientEmail: "x@example.org" }), ctx())).status).toBe(400);
    expect(state.sent).toHaveLength(0);
  });
});

describe("watch-only authorisations (WP22 \"Watch for my images\")", () => {
  it("refuses preview and dispatch while the case's only live consent is watch-only", async () => {
    state.consents[0].scope = "WATCH_ONLY";
    await expectRefusal("watch_only_consent");
    // Nothing was ever previewed, so nothing was revealed either.
    expect(state.accessLog).toHaveLength(0);
  });

  it("between Take it down and the full authorisation tick, nothing can be sent", async () => {
    // She converted the watch: the watch-only authorisation is withdrawn and
    // no full one is signed yet.
    state.consents[0] = { ...state.consents[0], scope: "WATCH_ONLY", withdrawnAt: new Date() };
    await expectRefusal("consent_withdrawn");
  });

  it("after Take it down, the full authorisation covers the finding the watch recorded", async () => {
    const auth = seedOf("CRAWL_AUTHORISATION");
    state.consents[0] = {
      ...state.consents[0], id: "consent-watch", scope: "WATCH_ONLY", withdrawnAt: new Date("2026-11-18T06:00:00Z"),
    };
    state.consents.push({
      id: "consent-full", caseId: "case-1", hashSubmissionIds: ["h1", "h2"], templateId: "tpl-auth",
      templateDigest: templateDigest(auth), signedAt: new Date("2026-11-18T07:00:00Z"), withdrawnAt: null,
      scope: "SEARCH_AND_NOTICE", convertedFromId: "consent-watch",
    });
    state.findings.get("cf-1")!.crawlConsentId = "consent-watch";

    const preview = await previewRepresentativeNotice(base);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error(preview.error);
    // The notice relies on the full authorisation she signed on the spot.
    expect(preview.notice.consentId).toBe("consent-full");
    expect(preview.notice.pdfBody).toContain("consent-full");
    expect(preview.notice.pdfBody).toContain("agreed to by the Complainant on 18 November 2026");

    const sent = await dispatchRepresentativeNotice({ ...base, contentDigest: preview.notice.contentDigest });
    expect(sent).toMatchObject({ ok: true, dispatched: true, transport: "email" });
  });

  it("a full authorisation that does not point back at the watch one does not cover its findings", async () => {
    // A later authorisation signed without the conversion link (a stopped
    // watch that never went through Take it down) never inherits the watch's
    // findings: they were recorded under an authorisation that is gone.
    const auth = seedOf("CRAWL_AUTHORISATION");
    state.consents[0] = {
      ...state.consents[0], id: "consent-watch", scope: "WATCH_ONLY", withdrawnAt: new Date("2026-11-18T06:00:00Z"),
    };
    state.consents.push({
      id: "consent-full", caseId: "case-1", hashSubmissionIds: ["h1", "h2"], templateId: "tpl-auth",
      templateDigest: templateDigest(auth), signedAt: new Date("2026-11-18T07:00:00Z"), withdrawnAt: null,
      scope: "SEARCH_AND_NOTICE",
    });
    state.findings.get("cf-1")!.crawlConsentId = "consent-watch";
    await expectRefusal("consent_withdrawn");
  });
});
