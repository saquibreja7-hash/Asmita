import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Survivor consent, analyst and source-admin routes: who may call them and
// what they refuse. Sessions are mocked; data lives on the memory path, and
// the legal-review gate is checked against the template query. Placeholder
// data only.

vi.mock("@/lib/auth/middleware", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { noticeTemplate: { findFirst: vi.fn() } } }));

import { requireSession } from "@/lib/auth/middleware";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { db } from "@/lib/db";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { inMemoryAdminAccessLog } from "@/lib/admin-access-log";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { findCrawlAuthorisationTemplate, recordCrawlConsent } from "@/lib/crawl-consent";
import { createCrawlSource, validateCrawlDomain } from "@/lib/crawl-sources";
import { recordCrawlFindings } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";
import * as consentRoute from "@/app/api/cases/[caseId]/crawl-consent/route";
import { GET as listFindingsRoute } from "@/app/api/admin/findings/route";
import { GET as revealFindingRoute } from "@/app/api/admin/findings/[id]/route";
import { POST as reviewFindingRoute } from "@/app/api/admin/findings/[id]/review/route";
import { GET as findingSummaryRoute } from "@/app/api/admin/findings/[id]/summary/route";
import { sha256 } from "@/lib/hash";
import * as sourcesRoute from "@/app/api/admin/crawl-sources/route";

const adult = { ok: true as const, session: { sub: "user-a", role: "VICTIM", ageOver18: true, namespace: "victim" } };
const minorRefused = { ok: false as const, status: 403, error: "minor_pathway_required" };

function admin(sub: string, adminRole = "CASE_REVIEWER") {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole, mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function request(url: string, method = "GET", body?: unknown, csrf = true) {
  const { nonce, token } = createCsrfPair();
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...(csrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  inMemoryAdminAccessLog.splice(0, inMemoryAdminAccessLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("survivor crawl-consent route", () => {
  it("is adults only on every method, so a minor never reaches it", async () => {
    const record = await store.createCase("user-a");
    vi.mocked(requireSession).mockResolvedValue(minorRefused as never);
    const url = `https://asmita.test/api/cases/${record.id}/crawl-consent`;
    const responses = [
      await consentRoute.GET(request(url), params({ caseId: record.id })),
      await consentRoute.POST(request(url, "POST", { name: "A", contact: "a@example.org", signature: "A", templateRef: "x" }), params({ caseId: record.id })),
      await consentRoute.DELETE(request(url, "DELETE"), params({ caseId: record.id })),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "minor_pathway_required" });
    }
    for (const call of vi.mocked(requireSession).mock.calls) expect(call[0]).toEqual({ adultOnly: true });
    expect(crawlMemory().consents).toEqual([]);
  });

  it("refuses another survivor's case", async () => {
    const record = await store.createCase("someone-else");
    vi.mocked(requireSession).mockResolvedValue(adult as never);
    const response = await consentRoute.GET(request(`https://asmita.test/x`), params({ caseId: record.id }));
    expect(response.status).toBe(404);
  });

  it("signing is closed while the crawler or hash upload is off, and needs CSRF", async () => {
    const record = await store.createCase("user-a");
    vi.mocked(requireSession).mockResolvedValue(adult as never);
    const body = { name: "A", contact: "a@example.org", signature: "A", templateRef: "x" };
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await consentRoute.POST(request("https://asmita.test/x", "POST", body), params({ caseId: record.id }))).status).toBe(503);
    vi.stubEnv("ENABLE_CRAWLER", "true");
    vi.stubEnv("ENABLE_HASH_UPLOAD", "false");
    expect((await consentRoute.POST(request("https://asmita.test/x", "POST", body), params({ caseId: record.id }))).status).toBe(404);
    vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
    expect((await consentRoute.POST(request("https://asmita.test/x", "POST", body, false), params({ caseId: record.id }))).status).toBe(403);
  });

  it("reports state and lets the survivor withdraw, even with the crawler switched off", async () => {
    const record = await store.createCase("user-a");
    vi.mocked(requireSession).mockResolvedValue(adult as never);
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("a".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" });

    const state = await (await consentRoute.GET(request("https://asmita.test/x"), params({ caseId: record.id }))).json();
    expect(state).toMatchObject({ status: "signed", fingerprintCount: 1, available: true, draft: null });

    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await consentRoute.DELETE(request("https://asmita.test/x", "DELETE"), params({ caseId: record.id }))).status).toBe(200);
    expect(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId).toBeNull();
    expect((await consentRoute.DELETE(request("https://asmita.test/x", "DELETE"), params({ caseId: record.id }))).status).toBe(409);
  });

  it("only a legally reviewed template can be signed unless the dev bypass is on", async () => {
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(null as never);
    await findCrawlAuthorisationTemplate(false);
    expect(vi.mocked(db.noticeTemplate.findFirst).mock.calls[0][0]).toMatchObject({
      where: { templateType: "CRAWL_AUTHORISATION", isActive: true, reviewedByLegal: true },
    });
    await findCrawlAuthorisationTemplate(true);
    expect(vi.mocked(db.noticeTemplate.findFirst).mock.calls[1][0]?.where).not.toHaveProperty("reviewedByLegal");
  });

  it("refuses to sign when no reviewed template exists", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    vi.stubEnv("DEV_SKIP_LEGAL_REVIEW", "false");
    vi.mocked(requireSession).mockResolvedValue(adult as never);
    const caseOps = await import("@/lib/case-ops");
    const spy = vi.spyOn(caseOps, "getCaseForUser").mockResolvedValue({ id: "c1", referenceNumber: "ASM-TEST-1", userId: "user-a", createdAt: "", status: "OPEN", urls: [] });
    const consent = await import("@/lib/crawl-consent");
    const state = vi.spyOn(consent, "getCrawlConsentState").mockResolvedValue({ status: "none", signedAt: null, withdrawnAt: null, fingerprintCount: 0 });
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(null as never);
    const response = await consentRoute.POST(
      request("https://asmita.test/x", "POST", { name: "Test Person", contact: "a@example.org", signature: "Test Person", templateRef: "x" }),
      params({ caseId: "c1" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "template_missing" });
    spy.mockRestore();
    state.mockRestore();
  });
});

describe("analyst finding routes", () => {
  let findingId: string;
  const pageUrl = "https://forum.example.com/thread/reveal-me";

  beforeEach(async () => {
    const record = await store.createCase("user-a");
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("a".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" });
    const source = await createCrawlSource({ domain: "forum.example.com", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-0");
    if (!source.ok) throw new Error("source");
    await recordCrawlFindings({
      runId: "run-1",
      findings: [{ fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, pageUrl, imageUrl: "https://cdn.example.com/i.jpg", distance: 26, quality: 90, observedAt: "2026-11-16T00:00:00Z", sourceId: source.source.id }],
    }, "key-1");
    findingId = [...crawlMemory().findings.keys()][0];
  });

  it("findings:review belongs to SUPER_ADMIN and CASE_REVIEWER only; crawler:manage to SUPER_ADMIN only", () => {
    expect(hasAdminPermission("SUPER_ADMIN", "findings:review")).toBe(true);
    expect(hasAdminPermission("CASE_REVIEWER", "findings:review")).toBe(true);
    for (const role of ["LEGAL_ADVISOR", "GO_EDITOR", "SUPPORT_AGENT"] as const) expect(hasAdminPermission(role, "findings:review")).toBe(false);
    expect(hasAdminPermission("SUPER_ADMIN", "crawler:manage")).toBe(true);
    for (const role of ["CASE_REVIEWER", "LEGAL_ADVISOR", "GO_EDITOR", "SUPPORT_AGENT"] as const) expect(hasAdminPermission(role, "crawler:manage")).toBe(false);
  });

  it("the list needs findings:review and shows no URL", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await listFindingsRoute(request("https://asmita.test/api/admin/findings"))).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("findings:review");
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    const response = await listFindingsRoute(request("https://asmita.test/api/admin/findings?status=CANDIDATE"));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text).findings).toHaveLength(1);
    expect(text).not.toContain("reveal-me");
    expect(text).not.toContain("example.com/i.jpg");
    expect((await listFindingsRoute(request("https://asmita.test/api/admin/findings?status=NOPE"))).status).toBe(400);
  });

  it("reveal needs a reason, is logged before the URL is returned, and is audited without the URL", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    expect((await revealFindingRoute(request(`https://asmita.test/api/admin/findings/${findingId}`), params({ id: findingId }))).status).toBe(400);
    const response = await revealFindingRoute(request(`https://asmita.test/api/admin/findings/${findingId}?reason=check_removal`), params({ id: findingId }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ pageUrl, imageUrl: "https://cdn.example.com/i.jpg" });
    expect(inMemoryAdminAccessLog).toEqual([expect.objectContaining({ adminId: "admin-1", action: "finding_revealed", entityType: "CrawlFinding", entityId: findingId, reason: "check_removal" })]);
    const revealed = inMemoryAuditLog.filter((e) => e.eventType === "URL_REVEALED");
    expect(revealed).toEqual([expect.objectContaining({ entityType: "CrawlFinding", entityId: findingId, actorId: "admin-1" })]);
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain("reveal-me");
  });

  it("reveal is rate-limited per admin", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-rate") as never);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      statuses.push((await revealFindingRoute(request(`https://asmita.test/x?reason=other`), params({ id: findingId }))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("review enforces the second reviewer through the route", async () => {
    const url = `https://asmita.test/api/admin/findings/${findingId}/review`;
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    expect((await reviewFindingRoute(request(url, "POST", { decision: "approve" }, false), params({ id: findingId }))).status).toBe(403);
    expect(await (await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }))).json())
      .toEqual({ ok: true, status: "AWAITING_SECOND_REVIEW" });
    const same = await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }));
    expect(same.status).toBe(409);
    expect(await same.json()).toEqual({ error: "second_reviewer_required" });
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-2", "SUPER_ADMIN") as never);
    const second = await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }));
    expect(await second.json()).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });
    expect((await reviewFindingRoute(request(url, "POST", { decision: "maybe" }), params({ id: findingId }))).status).toBe(400);
  });
});

describe("analyst finding routes: list fields, summary and the crawler switch", () => {
  let findingId: string;
  let caseId: string;

  beforeEach(async () => {
    const record = await store.createCase("user-a");
    caseId = record.id;
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId, hashEncrypted: encryptField("a".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
    await recordCrawlConsent({ caseId, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" });
    const source = await createCrawlSource({ domain: "forum.example.com", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-0");
    if (!source.ok) throw new Error("source");
    await recordCrawlFindings({
      runId: "run-1",
      findings: [{ fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, pageUrl: "https://forum.example.com/thread/summary-secret", imageUrl: "https://cdn.example.com/summary-secret.jpg", distance: 26, quality: 90, observedAt: "2026-11-16T00:00:00Z", sourceId: source.source.id }],
    }, "key-1");
    findingId = [...crawlMemory().findings.keys()][0];
  });

  async function rows(adminId: string) {
    vi.mocked(requireAdminPermission).mockResolvedValue(admin(adminId) as never);
    const body = await (await listFindingsRoute(request("https://asmita.test/api/admin/findings"))).json();
    return body as { findings: Array<Record<string, unknown>>; crawlerEnabled: boolean };
  }

  it("list rows carry the fingerprint reference, review progress, notice state and consent state, but no PDQ, URL or reviewer id", async () => {
    const before = await rows("admin-1");
    expect(before.crawlerEnabled).toBe(true);
    expect(before.findings[0]).toMatchObject({
      fingerprintRef: sha256("a".repeat(64)).slice(0, 16),
      secondReviewRequired: true,
      firstReviewedAt: null,
      currentAdminGaveFirstReview: false,
      representativeNoticeSentAt: null,
      noticeAttemptUnconfirmed: false,
      crawlConsentWithdrawn: false,
      linkStatus: null,
    });
    expect(before.findings[0]).toHaveProperty("platform");

    const url = `https://asmita.test/api/admin/findings/${findingId}/review`;
    await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }));
    const mine = (await rows("admin-1")).findings[0];
    expect(mine).toMatchObject({ currentAdminGaveFirstReview: true, awaitingSecondReview: true });
    expect(typeof mine.firstReviewedAt).toBe("string");
    const theirs = (await rows("admin-2")).findings[0];
    expect(theirs.currentAdminGaveFirstReview).toBe(false);

    const text = JSON.stringify(theirs);
    expect(text).not.toContain("a".repeat(64));
    expect(text).not.toContain("summary-secret");
    expect(text).not.toContain("admin-1");
    expect(text).not.toMatch(/reviewedById|Encrypted/);
  });

  it("shows a withdrawn authorisation", async () => {
    const { withdrawCrawlConsent } = await import("@/lib/crawl-consent");
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    const url = `https://asmita.test/api/admin/findings/${findingId}/review`;
    await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }));
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-2") as never);
    await reviewFindingRoute(request(url, "POST", { decision: "approve" }), params({ id: findingId }));
    await withdrawCrawlConsent(caseId, "user-a");
    const row = (await rows("admin-1")).findings[0];
    expect(row).toMatchObject({ reviewStatus: "APPROVED", crawlConsentWithdrawn: true, linkStatus: "PENDING_REVIEW" });
  });

  it("the summary is one finding, address-free, needs findings:review and is not a reveal", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await findingSummaryRoute(request("https://asmita.test/x"), params({ id: findingId }))).status).toBe(403);
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    const response = await findingSummaryRoute(request("https://asmita.test/x"), params({ id: findingId }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ finding: { id: findingId, caseId }, crawlerEnabled: true });
    expect(text).not.toContain("summary-secret");
    expect(inMemoryAdminAccessLog).toEqual([]);
    expect(inMemoryAuditLog.some((e) => e.eventType === "URL_REVEALED")).toBe(false);
    expect((await findingSummaryRoute(request("https://asmita.test/x"), params({ id: "missing" }))).status).toBe(404);
  });

  it("with ENABLE_CRAWLER off, reads still work and say so, and every change is refused with 503 crawler_disabled", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("super-1", "SUPER_ADMIN") as never);
    const list = await rows("super-1");
    expect(list).toMatchObject({ crawlerEnabled: false });
    expect(list.findings).toHaveLength(1);
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("super-1", "SUPER_ADMIN") as never);
    expect(await (await findingSummaryRoute(request("https://asmita.test/x"), params({ id: findingId }))).json()).toMatchObject({ crawlerEnabled: false });
    expect((await revealFindingRoute(request(`https://asmita.test/x?reason=other`), params({ id: findingId }))).status).toBe(200);
    expect(await (await sourcesRoute.GET()).json()).toMatchObject({ crawlerEnabled: false });

    const refusals = [
      await reviewFindingRoute(request("https://asmita.test/x", "POST", { decision: "approve" }), params({ id: findingId })),
      await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "example.org", pageBudget: 10, delayMs: 1000 })),
      await sourcesRoute.PATCH(request("https://asmita.test/x", "PATCH", { id: "any", enabled: true })),
    ];
    for (const response of refusals) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "crawler_disabled" });
    }
    expect(crawlMemory().findings.get(findingId)!.reviewedById).toBeNull();
  });
});

describe("crawl sources", () => {
  it.each([
    ["forum.example.com", "forum.example.com"],
    ["WWW.Example.org.", "example.org"],
    ["sub.site.co.in", "sub.site.co.in"],
  ])("accepts %s", (raw, domain) => {
    expect(validateCrawlDomain(raw)).toEqual({ ok: true, domain });
  });

  it.each([
    ["8.8.8.8", "invalid_domain"],
    ["192.168.0.1", "invalid_domain"],
    ["[::1]", "invalid_domain"],
    ["localhost", "invalid_domain"],
    ["printer.local", "private_domain"],
    ["db.internal", "private_domain"],
    ["intranet", "invalid_domain"],
    ["https://example.com/path", "invalid_domain"],
    ["exa mple.com", "invalid_domain"],
    ["-bad.example.com", "invalid_domain"],
    ["", "invalid_domain"],
  ])("refuses %s", (raw, error) => {
    expect(validateCrawlDomain(raw)).toEqual({ ok: false, error });
  });

  it("only crawler:manage may change sources; new sites start disabled; every change is audited", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "example.org", pageBudget: 10, delayMs: 1000 }))).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("crawler:manage");

    vi.mocked(requireAdminPermission).mockResolvedValue(admin("super-1", "SUPER_ADMIN") as never);
    const created = await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "Example.org", pageBudget: 10, delayMs: 1000 }));
    expect(created.status).toBe(201);
    const { source } = await created.json();
    expect(source).toMatchObject({ domain: "example.org", enabled: false, approvedBy: "super-1" });
    expect((await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "example.org", pageBudget: 10, delayMs: 1000 }))).status).toBe(409);
    expect((await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "10.0.0.1", pageBudget: 10, delayMs: 1000 }))).status).toBe(400);
    expect((await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "example.net", pageBudget: 0, delayMs: 1000 }))).status).toBe(400);
    expect((await sourcesRoute.POST(request("https://asmita.test/x", "POST", { domain: "example.net", pageBudget: 10, delayMs: 10 }))).status).toBe(400);

    const patched = await sourcesRoute.PATCH(request("https://asmita.test/x", "PATCH", { id: source.id, enabled: true, delayMs: 2000 }));
    expect(await patched.json()).toMatchObject({ source: { enabled: true, delayMs: 2000 } });
    expect((await sourcesRoute.PATCH(request("https://asmita.test/x", "PATCH", { id: "missing", enabled: true }))).status).toBe(404);
    expect((await sourcesRoute.PATCH(request("https://asmita.test/x", "PATCH", { id: source.id }))).status).toBe(400);

    const actions = inMemoryAuditLog.filter((e) => e.eventType === "ADMIN_ACTION").map((e) => (e.data as { action: string }).action);
    expect(actions).toEqual(["crawl_source_added", "crawl_source_updated"]);
    expect((await (await sourcesRoute.GET()).json()).sources).toHaveLength(1);
  });
});
