import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The representative-notice rules on the memory path (no DATABASE_URL):
// preview and dispatch refuse, withdrawal stops unsent crawler links, the
// survivor's view carries source without finding detail, and a reviewed
// finding keeps the fingerprint the analyst confirmed. Placeholder data only.

import { inMemoryAuditLog } from "@/lib/audit";
import { getCaseForUser, listCasesForUser } from "@/lib/case-ops";
import { recordCrawlConsent, withdrawCrawlConsent } from "@/lib/crawl-consent";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { dispatchRepresentativeNotice, previewRepresentativeNotice } from "@/lib/crawl-notice";
import { createCrawlSource } from "@/lib/crawl-sources";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";

let sourceId: string;

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!created.ok) throw new Error("source");
  sourceId = created.source.id;
});
afterEach(() => vi.unstubAllEnvs());

async function caseWithConsent() {
  const record = await store.createCase("user-a");
  for (const [id, pdq] of [["hs-1", "a".repeat(64)], ["hs-2", "b".repeat(64)]]) {
    crawlMemory().fingerprints.set(id, { id, caseId: record.id, hashEncrypted: encryptField(pdq), quality: 80, status: "APPROVED", crawlPoolId: null });
  }
  const signed = await recordCrawlConsent({
    caseId: record.id, signedPdfEncrypted: encryptField("placeholder-pdf"), hashSubmissionIds: ["hs-1", "hs-2"],
    templateId: "tpl-1", templateDigest: "digest-1", actorId: "user-a",
  });
  expect(signed.ok).toBe(true);
  return record;
}

const report = (fingerprintId: string, distance: number) => recordCrawlFindings({
  runId: "run-1",
  findings: [{
    fingerprintId, pageUrl: "https://forum.example.com/thread/1", imageUrl: "https://cdn.example.com/img/1.jpg",
    distance, quality: 90, observedAt: "2026-11-16T10:00:00Z", sourceId,
  }],
}, "key-1");

describe("representative notice, memory path", () => {
  it("preview and dispatch refuse without a database", async () => {
    expect(await previewRepresentativeNotice({ findingId: "f", caseId: "c", adminId: "a" })).toEqual({ ok: false, status: 503, error: "database_required" });
    expect(await dispatchRepresentativeNotice({ findingId: "f", caseId: "c", adminId: "a", contentDigest: "0".repeat(64) }))
      .toEqual({ ok: false, status: 503, error: "database_required" });
  });

  it("withdrawal marks approved crawler links; survivor links are untouched; the view shows source but no finding id", async () => {
    const record = await caseWithConsent();
    await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, 6);
    const [finding] = crawlMemory().findings.values();
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
    store.cases.get(record.id)!.urls.push({
      id: "own-link", domain: "example.org", platformName: "Example", status: "NOTICE_QUEUED", urlHash: "own", platformId: null,
    });

    let view = await getCaseForUser(record.id, "user-a");
    const crawler = view!.urls.find((u) => u.source === "CRAWLER")!;
    expect(crawler).toMatchObject({ crawlConsentWithdrawn: false, representativeNoticeSentAt: null });
    expect(crawler).not.toHaveProperty("crawlFindingId");
    expect(view!.urls.find((u) => u.id === "own-link")!.source).toBe("SURVIVOR");
    expect((await listCasesForUser("user-a"))[0].urls.every((u) => !("crawlFindingId" in u))).toBe(true);

    expect(await withdrawCrawlConsent(record.id, "user-a")).toEqual({ ok: true, candidatesDeleted: 0 });
    view = await getCaseForUser(record.id, "user-a");
    expect(view!.urls.find((u) => u.source === "CRAWLER")!.crawlConsentWithdrawn).toBe(true);
    expect(view!.urls.find((u) => u.id === "own-link")).not.toHaveProperty("crawlConsentWithdrawn");
    expect(inMemoryAuditLog.find((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN")!.data).toMatchObject({ linksStopped: 1 });
  });

  it("a closer sighting after review never changes the matched fingerprint", async () => {
    await caseWithConsent();
    const fp1 = crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!;
    const fp2 = crawlMemory().fingerprints.get("hs-2")!.crawlPoolId!;
    await report(fp1, 25);
    const [finding] = crawlMemory().findings.values();
    // Before any review, a closer report still wins.
    await report(fp1, 24);
    expect(finding.distance).toBe(24);
    // First of two approvals: frozen from here on.
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ status: "AWAITING_SECOND_REVIEW" });
    await report(fp2, 2);
    expect(finding).toMatchObject({ hashSubmissionId: "hs-1", distance: 24 });
    expect(finding.lastSeenAt).toBeInstanceOf(Date);
  });
});
