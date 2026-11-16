import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Where the crawler meets the survivor's own actions, on the memory path:
// a deletion request stops the search (and signing in again does not
// restart it), and her own report of a link the crawler found makes it her
// link. Placeholder data only.

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { getCrawlConsentState, recordCrawlConsent } from "@/lib/crawl-consent";
import { createCrawlSource } from "@/lib/crawl-sources";
import { buildCrawlPool } from "@/lib/crawl-pool";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { addUrlsToCase, deactivateUser } from "@/lib/case-ops";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";

const PAGE = "https://www.instagram.com/p/overlap-placeholder";

let record: store.CaseRecord;
let sourceId: string;

async function seedCase(userId: string) {
  record = await store.createCase(userId);
  crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("c".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
  expect((await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d" })).ok).toBe(true);
}

async function report(pageUrl: string, distance = 4) {
  return recordCrawlFindings({
    runId: "run-1",
    findings: [{ fingerprintId: crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, pageUrl, imageUrl: "https://cdn.example.net/x.jpg", distance, quality: 90, observedAt: "2026-11-16T00:00:00Z", sourceId }],
  }, "key-1");
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  const source = await createCrawlSource({ domain: "instagram.com", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-0");
  if (!source.ok) throw new Error("source");
  sourceId = source.source.id;
});
afterEach(() => vi.unstubAllEnvs());

describe("R1: a deletion request stops the crawl", () => {
  it("withdraws the authorisation on every case: pool emptied, candidates deleted, unsent links stopped", async () => {
    await seedCase("user-del");
    await report(PAGE);
    await report("https://www.instagram.com/p/second-placeholder");
    const [approve] = [...crawlMemory().findings.values()];
    expect(await reviewCrawlFinding({ findingId: approve.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
    expect((await buildCrawlPool()).fingerprints).toHaveLength(1);

    await deactivateUser("user-del");

    expect((await buildCrawlPool()).fingerprints).toHaveLength(0);
    expect(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId).toBeNull();
    expect([...crawlMemory().findings.values()].map((f) => f.reviewStatus)).toEqual(["APPROVED"]);
    expect(store.cases.get(record.id)!.urls.find((u) => u.source === "CRAWLER")!.crawlConsentWithdrawnAt).toBeTruthy();
    expect(await getCrawlConsentState(record.id)).toMatchObject({ status: "withdrawn" });
    const withdrawn = inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN");
    expect(withdrawn).toEqual([expect.objectContaining({ entityId: record.id, data: expect.objectContaining({ reason: "account_deletion" }) })]);
  });

  it("cancelling the deletion by signing in does not opt her back in", async () => {
    await seedCase("user-cancel");
    const oldPoolId = crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!;
    await deactivateUser("user-cancel");
    store.cancelUserDeletion("user-cancel");
    expect(await getCrawlConsentState(record.id)).toMatchObject({ status: "withdrawn" });
    expect((await buildCrawlPool()).fingerprints).toHaveLength(0);
    const late = await recordCrawlFindings({
      runId: "run-late",
      findings: [{ fingerprintId: oldPoolId, pageUrl: PAGE, imageUrl: "https://cdn.example.net/x.jpg", distance: 4, quality: 90, observedAt: "2026-11-16T00:00:00Z", sourceId }],
    }, "key-1");
    expect(late.results).toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
  });

  it("a survivor who never opted in is unaffected", async () => {
    record = await store.createCase("user-plain");
    await deactivateUser("user-plain");
    expect(inMemoryAuditLog.some((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN")).toBe(false);
  });
});

describe("R2: her own report of a link the crawler found", () => {
  async function approvedCrawlerLink() {
    await seedCase("user-r2");
    await report(PAGE);
    const finding = [...crawlMemory().findings.values()][0];
    await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" });
    return { finding, link: store.cases.get(record.id)!.urls.find((u) => u.source === "CRAWLER")! };
  }

  it("becomes her link, in her own sign flow; the finding keeps its record", async () => {
    const { finding, link } = await approvedCrawlerLink();
    const [result] = await addUrlsToCase(record.id, [PAGE]);
    expect(result).toMatchObject({ ok: true, duplicate: false, url: { id: link.id, source: "SURVIVOR", status: "NOTICE_QUEUED" } });
    expect(store.cases.get(record.id)!.urls).toHaveLength(1);
    expect(link).toMatchObject({ source: "SURVIVOR", crawlConsentWithdrawnAt: null });
    expect(link.crawlFindingId).toBeUndefined();
    expect(crawlMemory().findings.get(finding.id)).toMatchObject({ reviewStatus: "APPROVED" });
    expect(inMemoryAuditLog.some((e) => e.eventType === "CRAWL_FINDING_APPROVED" && e.entityId === finding.id)).toBe(true);
  });

  it("a link stopped by her withdrawal becomes sendable again as her own link", async () => {
    const { link } = await approvedCrawlerLink();
    const { withdrawCrawlConsent } = await import("@/lib/crawl-consent");
    await withdrawCrawlConsent(record.id, "user-r2");
    expect(link.crawlConsentWithdrawnAt).toBeTruthy();
    const [result] = await addUrlsToCase(record.id, [PAGE]);
    expect(result).toMatchObject({ ok: true, duplicate: false, url: { source: "SURVIVOR" } });
    expect(link.crawlConsentWithdrawnAt).toBeNull();
  });

  it("a link she had already reported herself stays a plain duplicate", async () => {
    await seedCase("user-r2b");
    await addUrlsToCase(record.id, [PAGE]);
    const [again] = await addUrlsToCase(record.id, [PAGE]);
    expect(again).toMatchObject({ ok: true, duplicate: true, url: { source: "SURVIVOR" } });
  });
});
