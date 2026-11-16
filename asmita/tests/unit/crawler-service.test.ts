import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The crawler's app side on the memory path (no DATABASE_URL): service-key
// auth, the fingerprint pool, findings ingestion, withdrawal, analyst review,
// retention and erasure. Every URL and fingerprint is a placeholder; no real
// survivor data or real NCII URL appears anywhere.

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { issueCrawlServiceKey, revokeCrawlServiceKey, hashCrawlerKey } from "@/lib/crawler-auth";
import { recordCrawlConsent, withdrawCrawlConsent, getCrawlConsentState } from "@/lib/crawl-consent";
import { createCrawlSource } from "@/lib/crawl-sources";
import { reviewCrawlFinding, listCrawlFindings, planReview } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";
import { purgeExpiredCrawlFindings, URL_RETENTION_MS } from "@/lib/url-retention";
import * as store from "@/lib/store";
import { GET as getPool } from "@/app/api/crawler/pool/route";
import { GET as getSources } from "@/app/api/crawler/sources/route";
import { POST as postFindings } from "@/app/api/crawler/findings/route";

const PDQ_A = "a".repeat(64);
const PDQ_B = "0123456789abcdef".repeat(4);
const PDQ_C = "f".repeat(64);

let key: string;
let keyId: string;
let sourceId: string;

function crawlerRequest(path: string, init: { method?: string; body?: unknown; auth?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = init.auth === undefined ? `Bearer ${key}` : init.auth;
  if (auth) headers.authorization = auth;
  return new Request(`https://asmita.test/api/crawler/${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) } : {}),
  });
}

function seedFingerprint(id: string, caseId: string, pdq: string, status: "PENDING_REVIEW" | "APPROVED" | "DISPATCHED" | "REJECTED" = "APPROVED") {
  crawlMemory().fingerprints.set(id, { id, caseId, hashEncrypted: encryptField(pdq), quality: 80, status, crawlPoolId: null });
}

async function consent(caseId: string, ids: string[]) {
  const result = await recordCrawlConsent({
    caseId, signedPdfEncrypted: encryptField("placeholder-pdf"), hashSubmissionIds: ids, templateId: "tpl-1", templateDigest: "digest-1", actorId: "user-1",
  });
  expect(result.ok).toBe(true);
}

const poolId = (hashSubmissionId: string) => crawlMemory().fingerprints.get(hashSubmissionId)!.crawlPoolId!;

function finding(overrides: Record<string, unknown> = {}) {
  return {
    fingerprintId: "missing",
    pageUrl: "https://forum.example.com/thread/1",
    imageUrl: "https://cdn.example.com/img/1.jpg",
    distance: 5,
    quality: 90,
    observedAt: "2026-11-16T10:00:00Z",
    sourceId,
    ...overrides,
  };
}

async function report(findings: unknown[], runId = "run-1") {
  const response = await postFindings(crawlerRequest("findings", { method: "POST", body: { runId, findings } }));
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  ({ key, id: keyId } = await issueCrawlServiceKey("test crawler"));
  const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!created.ok) throw new Error("source");
  sourceId = created.source.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("crawler service auth and switch", () => {
  it("answers 503 on every route while ENABLE_CRAWLER is off", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect((await getPool(crawlerRequest("pool"))).status).toBe(503);
    expect((await getSources(crawlerRequest("sources"))).status).toBe(503);
    expect((await postFindings(crawlerRequest("findings", { method: "POST", body: { runId: "r", findings: [finding()] } }))).status).toBe(503);
  });

  it("refuses a missing, wrong or revoked key with the same 401", async () => {
    for (const auth of [null, "Bearer cwk_" + "0".repeat(48), `Basic ${key}`, key]) {
      const response = await getPool(crawlerRequest("pool", { auth }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect((await getPool(crawlerRequest("pool"))).status).toBe(200);
    expect(await revokeCrawlServiceKey(keyId)).toBe(true);
    expect((await getPool(crawlerRequest("pool"))).status).toBe(401);
  });

  it("stores only the key's hash and records when it was used", async () => {
    const stored = crawlMemory().keys.get(keyId)!;
    expect(stored.keyHash).toBe(hashCrawlerKey(key));
    expect(JSON.stringify([...crawlMemory().keys.values()])).not.toContain(key);
    expect(stored.lastUsedAt).toBeNull();
    await getSources(crawlerRequest("sources"));
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it("the key script hashes exactly as the app checks", async () => {
    const script = await import("../../scripts/issue-crawler-service-key.mjs");
    const generated: string = script.generateCrawlerKey();
    expect(generated).toMatch(/^cwk_[0-9a-f]{48}$/);
    expect(script.hashCrawlerKey(generated)).toBe(hashCrawlerKey(generated));
  });
});

describe("GET /api/crawler/pool", () => {
  it("lists only approved fingerprints covered by a live authorisation, under opaque ids", async () => {
    const caseA = await store.createCase("user-a");
    const caseB = await store.createCase("user-b");
    seedFingerprint("hs-approved", caseA.id, PDQ_A, "APPROVED");
    seedFingerprint("hs-dispatched", caseA.id, PDQ_B, "DISPATCHED");
    seedFingerprint("hs-pending", caseA.id, PDQ_C, "PENDING_REVIEW");
    seedFingerprint("hs-not-covered", caseA.id, "1".repeat(64), "APPROVED");
    seedFingerprint("hs-no-consent", caseB.id, "2".repeat(64), "APPROVED");
    await consent(caseA.id, ["hs-approved", "hs-dispatched", "hs-pending"]);

    const response = await getPool(crawlerRequest("pool"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["fingerprints", "generatedAt", "threshold", "version"]);
    expect(body.threshold).toBe(31);
    expect(typeof body.version).toBe("string");
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
    expect(body.fingerprints.map((f: { pdq: string }) => f.pdq).sort()).toEqual([PDQ_B, PDQ_A].sort());
    for (const entry of body.fingerprints) {
      expect(Object.keys(entry).sort()).toEqual(["id", "pdq", "quality"]);
      expect(entry.pdq).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.id).not.toMatch(/hs-/);
    }
    const serialized = JSON.stringify(body);
    for (const leak of [caseA.id, caseA.referenceNumber, "user-a", "hs-approved", "hs-dispatched"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("withdrawal empties the pool, deletes unreviewed matches and refuses the old ids", async () => {
    const caseA = await store.createCase("user-a");
    seedFingerprint("hs-1", caseA.id, PDQ_A);
    await consent(caseA.id, ["hs-1"]);
    const oldPoolId = poolId("hs-1");
    expect((await report([finding({ fingerprintId: oldPoolId })])).body.results).toEqual([{ status: "accepted" }]);
    expect((await report([finding({ fingerprintId: oldPoolId, pageUrl: "https://forum.example.com/thread/2" })])).body.results[0].status).toBe("accepted");
    const [first] = await listCrawlFindings({ caseId: caseA.id });
    expect((await reviewCrawlFinding({ findingId: first.id, decision: "dismiss", reviewerId: "admin-1" })).ok).toBe(true);

    const withdrawn = await withdrawCrawlConsent(caseA.id, "user-a");
    expect(withdrawn).toEqual({ ok: true, candidatesDeleted: 1 });
    expect((await getCrawlConsentState(caseA.id)).status).toBe("withdrawn");
    expect((await (await getPool(crawlerRequest("pool"))).json()).fingerprints).toEqual([]);
    // The dismissed one stays as the record; the candidate is gone.
    expect((await listCrawlFindings({ caseId: caseA.id })).map((f) => f.reviewStatus)).toEqual(["DISMISSED"]);
    expect((await report([finding({ fingerprintId: oldPoolId, pageUrl: "https://forum.example.com/thread/3" })])).body.results)
      .toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
    expect(inMemoryAuditLog.some((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN" && e.entityId === caseA.id)).toBe(true);

    // Signing again issues new ids; the withdrawn one never matches again.
    await consent(caseA.id, ["hs-1"]);
    expect(poolId("hs-1")).not.toBe(oldPoolId);
  });

  it("allows one live authorisation per case", async () => {
    const caseA = await store.createCase("user-a");
    seedFingerprint("hs-1", caseA.id, PDQ_A);
    await consent(caseA.id, ["hs-1"]);
    const again = await recordCrawlConsent({ caseId: caseA.id, signedPdfEncrypted: "x", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" });
    expect(again).toEqual({ ok: false, error: "already_signed" });
  });
});

describe("GET /api/crawler/sources", () => {
  it("lists enabled sites only, in the contract shape", async () => {
    await createCrawlSource({ domain: "disabled.example.org", pageBudget: 5, delayMs: 2000 }, "admin-1");
    const body = await (await getSources(crawlerRequest("sources"))).json();
    expect(body).toEqual({ sources: [{ id: sourceId, kind: "site", domain: "forum.example.com", pageBudget: 100, delayMs: 1000 }] });
  });
});

describe("POST /api/crawler/findings", () => {
  let caseA: store.CaseRecord;
  let fp: string;

  beforeEach(async () => {
    caseA = await store.createCase("user-a");
    seedFingerprint("hs-1", caseA.id, PDQ_A);
    await consent(caseA.id, ["hs-1"]);
    fp = poolId("hs-1");
  });

  it.each([
    ["a data URL", { imageUrl: "data:image/png;base64,iVBORw0KGgo=" }, "media_payload_rejected"],
    ["a base64 payload inside a URL", { imageUrl: "https://cdn.example.com/x;base64,AAAA" }, "media_payload_rejected"],
    ["a bare host without scheme", { pageUrl: "forum.example.com/thread/1" }, "invalid_finding"],
    ["a non-http scheme", { pageUrl: "ftp://forum.example.com/file" }, "invalid_finding"],
    ["a URL with whitespace", { pageUrl: "https://forum.example.com/a b" }, "invalid_finding"],
    ["an over-long URL", { pageUrl: `https://forum.example.com/${"a".repeat(2100)}` }, "invalid_finding"],
    ["a distance above 31", { distance: 32 }, "invalid_finding"],
    ["a negative distance", { distance: -1 }, "invalid_finding"],
    ["a fractional distance", { distance: 1.5 }, "invalid_finding"],
    ["an unknown field", { image: "AAAA" }, "invalid_finding"],
    ["a bad timestamp", { observedAt: "yesterday" }, "invalid_finding"],
  ])("rejects %s without losing the rest of the batch", async (_label, override, reason) => {
    const { status, body } = await report([finding({ fingerprintId: fp, ...override }), finding({ fingerprintId: fp })]);
    expect(status).toBe(200);
    expect(body.results).toEqual([{ status: "rejected", reason }, { status: "accepted" }]);
    expect(crawlMemory().findings.size).toBe(1);
    const stored = JSON.stringify([...crawlMemory().findings.values()]);
    expect(stored).not.toContain("base64");
  });

  it.each([
    ["not JSON", "{oops"],
    ["a bad runId", { runId: "run id with spaces", findings: [{}] }],
    ["an unknown envelope field", { runId: "r", findings: [{}], extra: true }],
    ["findings not an array", { runId: "r", findings: "x" }],
  ])("refuses the whole request for %s", async (_label, body) => {
    const response = await postFindings(crawlerRequest("findings", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_payload" });
  });

  it("refuses an empty batch and one over 50", async () => {
    expect((await report([])).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => finding({ fingerprintId: fp, pageUrl: `https://forum.example.com/t/${i}` }));
    expect((await report(many)).status).toBe(400);
    expect((await report(many.slice(0, 50))).status).toBe(200);
  });

  it("rejects private hosts, unknown sources and unknown fingerprints item by item", async () => {
    const { status, body } = await report([
      finding({ fingerprintId: fp, pageUrl: "http://192.168.1.10/page" }),
      finding({ fingerprintId: fp, imageUrl: "http://localhost/img.jpg" }),
      finding({ fingerprintId: fp, sourceId: "no-such-source" }),
      finding({ fingerprintId: "fp_unknown" }),
      finding({ fingerprintId: fp }),
    ]);
    expect(status).toBe(200);
    expect(body.results).toEqual([
      { status: "rejected", reason: "invalid_url" },
      { status: "rejected", reason: "invalid_url" },
      { status: "rejected", reason: "unknown_source" },
      { status: "rejected", reason: "fingerprint_not_accepted" },
      { status: "accepted" },
    ]);
  });

  it("refuses the HashSubmission id itself and a fingerprint that is not approved", async () => {
    seedFingerprint("hs-pending", caseA.id, PDQ_B, "PENDING_REVIEW");
    await withdrawCrawlConsent(caseA.id);
    await consent(caseA.id, ["hs-1", "hs-pending"]);
    const { body } = await report([
      finding({ fingerprintId: "hs-1" }),
      finding({ fingerprintId: poolId("hs-pending") }),
    ]);
    expect(body.results).toEqual([
      { status: "rejected", reason: "fingerprint_not_accepted" },
      { status: "rejected", reason: "fingerprint_not_accepted" },
    ]);
  });

  it("deduplicates per case, moving lastSeenAt and keeping the lowest distance", async () => {
    const first = await report([finding({ fingerprintId: fp, distance: 12 })]);
    expect(first.body.results).toEqual([{ status: "accepted" }]);
    const [before] = [...crawlMemory().findings.values()];
    const seenAt = before.lastSeenAt.getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await report([
      finding({ fingerprintId: fp, distance: 4, pageUrl: "https://forum.example.com/thread/1#comment", observedAt: "2020-01-01T00:00:00Z" }),
      finding({ fingerprintId: fp, distance: 20 }),
    ], "run-2");
    expect(again.body.results).toEqual([{ status: "accepted" }, { status: "accepted" }]);
    expect(crawlMemory().findings.size).toBe(1);
    const [after] = [...crawlMemory().findings.values()];
    expect(after.distance).toBe(4);
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(seenAt);
    // The server's clock, not the crawler's, starts the retention period.
    expect(after.firstSeenAt.getTime()).toBe(before.firstSeenAt.getTime());
    expect(after.firstSeenAt.getFullYear()).toBeGreaterThan(2020);
  });

  it("files each match under its own case and never across cases", async () => {
    const caseB = await store.createCase("user-b");
    seedFingerprint("hs-b", caseB.id, PDQ_B);
    await consent(caseB.id, ["hs-b"]);
    const { body } = await report([finding({ fingerprintId: fp }), finding({ fingerprintId: poolId("hs-b") })]);
    expect(body.results).toEqual([{ status: "accepted" }, { status: "accepted" }]);
    const a = await listCrawlFindings({ caseId: caseA.id });
    const b = await listCrawlFindings({ caseId: caseB.id });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(crawlMemory().findings.get(a[0].id)!.hashSubmissionId).toBe("hs-1");
    expect(crawlMemory().findings.get(b[0].id)!.hashSubmissionId).toBe("hs-b");
  });

  it("stores URLs encrypted and keeps them and the fingerprint out of the audit log", async () => {
    const pageUrl = "https://forum.example.com/thread/secret-page";
    const imageUrl = "https://cdn.example.com/img/secret-image.jpg";
    await report([finding({ fingerprintId: fp, pageUrl, imageUrl })]);
    const stored = JSON.stringify([...crawlMemory().findings.values()]);
    expect(stored).not.toContain("secret-page");
    expect(stored).not.toContain("secret-image");
    const recorded = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_FINDING_RECORDED");
    expect(recorded).toHaveLength(1);
    const audit = JSON.stringify(inMemoryAuditLog);
    for (const leak of ["secret-page", "secret-image", "forum.example.com/thread", PDQ_A, fp]) {
      expect(audit).not.toContain(leak);
    }
  });

  it("never fetches anything", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await report([finding({ fingerprintId: fp })]);
    await getPool(crawlerRequest("pool"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("findings: source binding and a neutral result", () => {
  it("rejects a page off the source's host; accepts the host, its subdomains, and an image on another public host", async () => {
    const record = await store.createCase("user-r3");
    seedFingerprint("hs-r3", record.id, PDQ_A);
    await consent(record.id, ["hs-r3"]);
    const fp = poolId("hs-r3");
    const { body } = await report([
      finding({ fingerprintId: fp, pageUrl: "https://elsewhere.example.org/thread/1" }),
      finding({ fingerprintId: fp, pageUrl: "https://forum.example.com.evil.example.org/x" }),
      finding({ fingerprintId: fp, pageUrl: "https://notforum.example.com/x" }),
      finding({ fingerprintId: fp, pageUrl: "https://forum.example.com/thread/9", imageUrl: "https://cdn.example.net/i/9.jpg" }),
      finding({ fingerprintId: fp, pageUrl: "https://m.forum.example.com/thread/10" }),
    ]);
    expect(body.results).toEqual([
      { status: "rejected", reason: "page_not_in_source" },
      { status: "rejected", reason: "page_not_in_source" },
      { status: "rejected", reason: "page_not_in_source" },
      { status: "accepted" },
      { status: "accepted" },
    ]);
    expect([...crawlMemory().findings.values()].filter((f) => f.caseId === record.id)).toHaveLength(2);
  });

  it("answers the same 'accepted' for a new finding and a repeat, so two pool ids cannot be linked to one case", async () => {
    const record = await store.createCase("user-r5");
    seedFingerprint("hs-r5a", record.id, PDQ_A);
    seedFingerprint("hs-r5b", record.id, PDQ_B);
    await consent(record.id, ["hs-r5a", "hs-r5b"]);
    const page = { pageUrl: "https://forum.example.com/thread/r5", imageUrl: "https://cdn.example.com/r5.jpg" };
    const first = await report([finding({ fingerprintId: poolId("hs-r5a"), ...page })]);
    const second = await report([finding({ fingerprintId: poolId("hs-r5b"), ...page })]);
    expect(first.body).toEqual(second.body);
    expect(second.body.results).toEqual([{ status: "accepted" }]);
  });
});

describe("analyst review", () => {
  let caseA: store.CaseRecord;
  let fp: string;
  let igSource: string;

  beforeEach(async () => {
    caseA = await store.createCase("user-a");
    seedFingerprint("hs-1", caseA.id, PDQ_A);
    await consent(caseA.id, ["hs-1"]);
    fp = poolId("hs-1");
    const ig = await createCrawlSource({ domain: "www.instagram.com", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-1");
    if (!ig.ok) throw new Error("source");
    igSource = ig.source.id;
  });

  async function oneFinding(overrides: Record<string, unknown>) {
    await report([finding({ fingerprintId: fp, ...overrides })]);
    const rows = await listCrawlFindings({ caseId: caseA.id });
    return rows.at(-1)!;
  }

  it("a close match is approved by one reviewer and becomes a CRAWLER link on the case", async () => {
    const row = await oneFinding({ distance: 8, pageUrl: "https://www.instagram.com/p/placeholder", sourceId: igSource });
    const outcome = await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });
    const url = store.cases.get(caseA.id)!.urls.find((u) => u.source === "CRAWLER")!;
    expect(url).toMatchObject({ domain: "instagram.com", status: "NOTICE_QUEUED", crawlFindingId: row.id });
    expect(inMemoryAuditLog.some((e) => e.eventType === "CRAWL_FINDING_APPROVED" && e.entityId === row.id)).toBe(true);
  });

  it("an unknown platform waits for human review", async () => {
    const row = await oneFinding({ distance: 8 });
    await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" });
    expect(store.cases.get(caseA.id)!.urls[0]).toMatchObject({ source: "CRAWLER", status: "PENDING_REVIEW" });
  });

  it("a distant match needs a second, different reviewer", async () => {
    const row = await oneFinding({ distance: 25 });
    expect(row.needsSecondReview).toBe(true);
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" }))
      .toEqual({ ok: true, status: "AWAITING_SECOND_REVIEW" });
    expect(store.cases.get(caseA.id)!.urls).toHaveLength(0);
    expect((await listCrawlFindings({ caseId: caseA.id }))[0]).toMatchObject({ reviewStatus: "CANDIDATE", awaitingSecondReview: true });
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" }))
      .toEqual({ ok: false, error: "second_reviewer_required" });
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-2" }))
      .toMatchObject({ ok: true, status: "APPROVED" });
    const stored = crawlMemory().findings.get(row.id)!;
    expect(stored).toMatchObject({ reviewedById: "admin-1", secondReviewedById: "admin-2", reviewStatus: "APPROVED" });
    expect(store.cases.get(caseA.id)!.urls).toHaveLength(1);
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "dismiss", reviewerId: "admin-3" }))
      .toEqual({ ok: false, error: "already_reviewed" });
  });

  it("the review rule at the boundary", () => {
    const fresh = { reviewStatus: "CANDIDATE", reviewedById: null };
    expect(planReview({ distance: 20, ...fresh }, "approve", "a")).toEqual({ action: "final_approval", second: false });
    expect(planReview({ distance: 21, ...fresh }, "approve", "a")).toEqual({ action: "first_approval", second: false });
    expect(planReview({ distance: 21, ...fresh }, "dismiss", "a")).toEqual({ action: "dismiss", second: false });
  });

  it("dismissal adds nothing to the case", async () => {
    const row = await oneFinding({ distance: 3 });
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "dismiss", reviewerId: "admin-1" })).toEqual({ ok: true, status: "DISMISSED" });
    expect(store.cases.get(caseA.id)!.urls).toHaveLength(0);
  });

  it("does not duplicate a link the survivor already reported", async () => {
    await store.addUrlsToCase(caseA.id, ["https://forum.example.com/thread/1"]);
    const row = await oneFinding({ distance: 3 });
    expect(await reviewCrawlFinding({ findingId: row.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, createdUrl: false });
    expect(store.cases.get(caseA.id)!.urls).toHaveLength(1);
  });

  it("after a withdrawal and a new authorisation, a re-reported copy is a new finding that can be approved onto a new link", async () => {
    const page = "https://www.instagram.com/p/placeholder-resign";
    const first = await oneFinding({ distance: 4, pageUrl: page, sourceId: igSource });
    expect(await reviewCrawlFinding({ findingId: first.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, createdUrl: true });
    const oldLink = store.cases.get(caseA.id)!.urls.find((u) => u.crawlFindingId === first.id)!;

    expect(await withdrawCrawlConsent(caseA.id, "user-a")).toMatchObject({ ok: true });
    expect(oldLink.crawlConsentWithdrawnAt).toBeTruthy();
    const oldConsentId = crawlMemory().findings.get(first.id)!.crawlConsentId;

    await consent(caseA.id, ["hs-1"]);
    const newConsentId = crawlMemory().consents.find((c) => !c.withdrawnAt)!.id;
    expect(newConsentId).not.toBe(oldConsentId);
    fp = poolId("hs-1");

    // Same copy, reported again: a new finding under the new authorisation.
    const { body } = await report([finding({ fingerprintId: fp, distance: 4, pageUrl: page, sourceId: igSource })], "run-2");
    expect(body.results).toEqual([{ status: "accepted" }]);
    const rows = await listCrawlFindings({ caseId: caseA.id });
    expect(rows).toHaveLength(2);
    const second = rows.find((row) => row.id !== first.id)!;
    expect(crawlMemory().findings.get(second.id)).toMatchObject({ crawlConsentId: newConsentId, reviewStatus: "CANDIDATE" });

    // A repeat under the same new authorisation still merges.
    expect((await report([finding({ fingerprintId: fp, distance: 4, pageUrl: page, sourceId: igSource })], "run-3")).body.results).toEqual([{ status: "accepted" }]);
    expect(await listCrawlFindings({ caseId: caseA.id })).toHaveLength(2);

    // Approval gives it its own link; the old one stays stopped and bound to the old finding.
    const approved = await reviewCrawlFinding({ findingId: second.id, decision: "approve", reviewerId: "admin-1" });
    expect(approved).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });
    const links = store.cases.get(caseA.id)!.urls.filter((u) => u.source === "CRAWLER");
    expect(links).toHaveLength(2);
    expect(oldLink).toMatchObject({ crawlFindingId: first.id });
    expect(oldLink.crawlConsentWithdrawnAt).toBeTruthy();
    const newLink = links.find((u) => u.crawlFindingId === second.id)!;
    expect(newLink.crawlConsentWithdrawnAt).toBeFalsy();
    expect(newLink.status).toBe("NOTICE_QUEUED");
    // The old finding is still the record of the first authorisation.
    expect(crawlMemory().findings.get(first.id)).toMatchObject({ reviewStatus: "APPROVED", crawlConsentId: oldConsentId });
  });

  it("the review list carries no URL", async () => {
    await oneFinding({ pageUrl: "https://forum.example.com/thread/list-secret" });
    const rows = await listCrawlFindings();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("list-secret");
    expect(serialized).not.toMatch(/Encrypted|pageUrl|imageUrl/);
  });
});

describe("retention and erasure", () => {
  it("blanks finding URLs 30 days after first seen", async () => {
    const caseA = await store.createCase("user-a");
    seedFingerprint("hs-1", caseA.id, PDQ_A);
    await consent(caseA.id, ["hs-1"]);
    await report([finding({ fingerprintId: poolId("hs-1") }), finding({ fingerprintId: poolId("hs-1"), pageUrl: "https://forum.example.com/new" })]);
    const [old, fresh] = [...crawlMemory().findings.values()];
    old.firstSeenAt = new Date(Date.now() - URL_RETENTION_MS - 1000);
    expect(await purgeExpiredCrawlFindings()).toBe(1);
    expect(old).toMatchObject({ pageUrlEncrypted: "", imageUrlEncrypted: "", urlDigest: null });
    expect(fresh.pageUrlEncrypted).not.toBe("");
    expect((await listCrawlFindings()).find((f) => f.id === old.id)!.urlsPurged).toBe(true);
    // Purged and cannot be approved into a link.
    expect(await reviewCrawlFinding({ findingId: old.id, decision: "approve", reviewerId: "admin-1" })).toEqual({ ok: false, error: "finding_expired" });
    expect(await purgeExpiredCrawlFindings()).toBe(0);
  });

  it("account erasure removes the case's authorisations and findings and empties the pool", async () => {
    const caseA = await store.createCase("user-erase");
    const caseB = await store.createCase("user-keep");
    seedFingerprint("hs-a", caseA.id, PDQ_A);
    seedFingerprint("hs-b", caseB.id, PDQ_B);
    await consent(caseA.id, ["hs-a"]);
    await consent(caseB.id, ["hs-b"]);
    await report([finding({ fingerprintId: poolId("hs-a") }), finding({ fingerprintId: poolId("hs-b") })]);

    store.deactivateUser("user-erase");
    await store.hardDeleteDueUsers(new Date(Date.now() + 31 * 24 * 60 * 60_000));

    const memory = crawlMemory();
    expect(memory.consents.map((c) => c.caseId)).toEqual([caseB.id]);
    expect([...memory.findings.values()].map((f) => f.caseId)).toEqual([caseB.id]);
    expect(memory.fingerprints.get("hs-a")!.crawlPoolId).toBeNull();
    const pool = await (await getPool(crawlerRequest("pool"))).json();
    expect(pool.fingerprints.map((f: { pdq: string }) => f.pdq)).toEqual([PDQ_B]);
  });
});
