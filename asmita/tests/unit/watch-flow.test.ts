import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Watch for my images" (watch-and-verify WP22) on the memory backend: a
// watch case, the watch-only authorisation, the copy-found alert, "Take it
// down" conversion, and "Stop watching" deleting her fingerprints. Placeholder
// data only: synthetic fingerprints, a fixture host, no real site.

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendWatchCopyFoundEmail: vi.fn(async () => ({ id: "dev-watch-found" })),
  };
});

import { inMemoryAuditLog } from "@/lib/audit";
import { getCrawlConsentState, recordCrawlConsent } from "@/lib/crawl-consent";
import { createCrawlSource } from "@/lib/crawl-sources";
import { buildCrawlPool, consentCoversFinding } from "@/lib/crawl-pool";
import { recordCrawlFindings, reviewCrawlFinding, listCrawlFindings } from "@/lib/crawl-findings";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { createWatchCopyFoundEmail, sendWatchCopyFoundEmail } from "@/lib/email";
import { clearMemoryHashesForCase } from "@/lib/hash-submission";
import * as store from "@/lib/store";
import { convertWatchToCase, createWatchCase, notifyWatchCopyFound, stopWatching } from "@/lib/watch-ops";
import { encryptField } from "@/lib/encryption";
import { readFileSync } from "node:fs";

const PDQ = "ab".repeat(32);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  store.users.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

/** A watch with one approved fingerprint and a live WATCH_ONLY authorisation. */
async function watchWithConsent() {
  const record = await createWatchCase("user-a");
  crawlMemory().fingerprints.set("hs-1", {
    id: "hs-1", caseId: record.id, hashEncrypted: encryptField(PDQ), quality: 90, status: "APPROVED", crawlPoolId: null,
  });
  const signed = await recordCrawlConsent({
    caseId: record.id,
    signedPdfEncrypted: encryptField("placeholder-pdf"),
    hashSubmissionIds: ["hs-1"],
    templateId: "tpl-watch",
    templateDigest: "digest-watch",
    actorId: "user-a",
    scope: "WATCH_ONLY",
  });
  if (!signed.ok) throw new Error("consent");
  return { record, consentId: signed.consentId };
}

describe("creating a watch", () => {
  it("creates a WATCH case with no links and audits it", async () => {
    const record = await createWatchCase("user-a");
    expect(record.id).toBeTruthy();
    expect(record.referenceNumber).toMatch(/^ASMITA-/);
    const stored = store.cases.get(record.id)!;
    expect(stored.mode).toBe("WATCH");
    expect(stored.urls).toEqual([]);
    expect(inMemoryAuditLog.some((entry) => entry.eventType === "CASE_CREATED" && entry.entityId === record.id)).toBe(true);
  });

  it("records a WATCH_ONLY consent and puts her fingerprints in the pool", async () => {
    const { record } = await watchWithConsent();
    const state = await getCrawlConsentState(record.id);
    expect(state).toMatchObject({ status: "signed", scope: "WATCH_ONLY", fingerprintCount: 1 });
    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toHaveLength(1);
    expect(pool.fingerprints[0].id).toMatch(/^fp_/);
  });

  it("a watch-only consent still refuses a second live consent on the case", async () => {
    const { record } = await watchWithConsent();
    const again = await recordCrawlConsent({
      caseId: record.id, signedPdfEncrypted: "x", hashSubmissionIds: ["hs-1"], templateId: "t", templateDigest: "d", scope: "WATCH_ONLY",
    });
    expect(again).toEqual({ ok: false, error: "already_signed" });
  });
});

describe("when a copy is found", () => {
  let sourceId: string;

  beforeEach(async () => {
    const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
    if (!created.ok) throw new Error("source");
    sourceId = created.source.id;
  });

  async function reportFinding() {
    const { record } = await watchWithConsent();
    const poolId = crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!;
    const stored = await recordCrawlFindings({
      runId: "run-1",
      findings: [{
        fingerprintId: poolId, pageUrl: "https://forum.example.com/thread/1", imageUrl: "https://cdn.example.com/img/1.jpg",
        distance: 8, quality: 90, observedAt: "2026-11-19T10:00:00Z", sourceId,
      }],
    }, "key-1");
    expect(stored.results).toEqual([{ status: "accepted" }]);
    return record;
  }

  it("records the finding under the watch authorisation and approves it as on any case", async () => {
    const record = await reportFinding();
    const finding = [...crawlMemory().findings.values()][0];
    expect(finding.caseId).toBe(record.id);
    expect(finding.crawlConsentId).toBeTruthy();
    const outcome = await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED" });
    const link = store.cases.get(record.id)!.urls.find((url) => url.source === "CRAWLER");
    // The fixture host is not a known platform, so the link waits for a human
    // to confirm its platform — exactly as for a survivor's unknown link.
    expect(link).toMatchObject({ status: "PENDING_REVIEW", crawlFindingId: finding.id });
    // The findings console says what she has and has not asked for.
    const rows = await listCrawlFindings({}, "admin-1");
    expect(rows.find((row) => row.id === finding.id)?.watchOnly).toBe(true);
  });

  it("emails her the alert with her case reference only, once per finding", async () => {
    store.users.set("user-a", { emailHash: "h", emailEncrypted: encryptField("survivor@example.invalid") });
    const record = await reportFinding();
    const finding = [...crawlMemory().findings.values()][0];
    await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" });
    expect(vi.mocked(sendWatchCopyFoundEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendWatchCopyFoundEmail)).toHaveBeenCalledWith("survivor@example.invalid", record.referenceNumber, `watch-copy-found/${finding.id}`);
    // A case that is not a watch never alerts.
    vi.mocked(sendWatchCopyFoundEmail).mockClear();
    const plain = await store.createCase("user-a");
    await notifyWatchCopyFound(plain.id, "cf-x");
    expect(sendWatchCopyFoundEmail).not.toHaveBeenCalled();
  });

  it("the email carries only her case reference and a sign-in prompt", () => {
    const { subject, text, html } = createWatchCopyFoundEmail("ASMITA-2026-00042");
    expect(subject).toBe("Update on Asmita case ASMITA-2026-00042");
    expect(text).toContain("We may have found a copy of your image. Sign in to Asmita to see it.");
    expect(text).toContain("ASMITA-2026-00042");
    expect(text).toContain("names no website and contains no links");
    // No link, no site name, no platform name: shared phones and inboxes.
    expect(text).not.toMatch(/https?:|www\.|\.com|\.org|\.in\b/i);
    expect(html).not.toMatch(/<a\s|href=/i);
    expect(html).not.toMatch(/https?:/);
    // Not even the site name, the logo image or a bare domain.
    expect(html).not.toMatch(/meriasmita|<img\s|www\.|\.org/i);
  });
});

describe("Take it down", () => {
  it("converts the watch into a case without stopping the found links", async () => {
    const record = await store.createCase("user-a", undefined, "WATCH");
    crawlMemory().consents.push({
      id: "consent-watch", caseId: record.id, signedPdfEncrypted: "pdf", hashSubmissionIds: ["hs-1"],
      templateId: "tpl-watch", templateDigest: "d", signedAt: new Date(), withdrawnAt: null, scope: "WATCH_ONLY",
    });
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField(PDQ), quality: 90, status: "APPROVED", crawlPoolId: "fp_1" });
    store.cases.get(record.id)!.urls.push({
      id: "url-1", domain: "forum.example.com", platformName: "Example Forum", status: "NOTICE_QUEUED",
      urlHash: "hash-1", platformId: null, source: "CRAWLER", crawlFindingId: "cf-1",
    });

    const converted = await convertWatchToCase(record.id, "user-a");
    expect(converted).toEqual({ ok: true, withdrawnConsentIds: ["consent-watch"] });
    expect(store.cases.get(record.id)!.mode).toBe("CASE");
    expect(crawlMemory().consents[0].withdrawnAt).toBeInstanceOf(Date);
    expect(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId).toBeNull();
    // The found link is NOT stopped: the full authorisation covers it.
    expect(store.cases.get(record.id)!.urls[0].crawlConsentWithdrawnAt ?? null).toBeNull();
    expect(inMemoryAuditLog.some((entry) => entry.eventType === "WATCH_CONVERTED" && entry.entityId === record.id)).toBe(true);
  });

  it("refuses a case that is not a watch", async () => {
    const plain = await store.createCase("user-a");
    expect(await convertWatchToCase(plain.id, "user-a")).toEqual({ ok: false, error: "not_a_watch" });
    expect(await convertWatchToCase("missing", "user-a")).toEqual({ ok: false, error: "not_a_watch" });
  });

  it("the full authorisation she signs next covers the finding the watch recorded", async () => {
    const record = await store.createCase("user-a", undefined, "WATCH");
    const watchConsent = {
      id: "consent-watch", caseId: record.id, signedPdfEncrypted: "pdf", hashSubmissionIds: ["hs-1"],
      templateId: "tpl-watch", templateDigest: "d", signedAt: new Date("2026-11-18T06:00:00Z"), withdrawnAt: new Date(), scope: "WATCH_ONLY" as const,
    };
    crawlMemory().consents.push(watchConsent);
    await convertWatchToCase(record.id, "user-a");
    crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField(PDQ), quality: 90, status: "APPROVED", crawlPoolId: null });
    const full = await recordCrawlConsent({
      caseId: record.id, signedPdfEncrypted: "pdf", hashSubmissionIds: ["hs-1"],
      templateId: "tpl-auth", templateDigest: "d-auth", actorId: "user-a",
    });
    if (!full.ok) throw new Error(full.error);
    const stored = crawlMemory().consents.find((c) => c.id === full.consentId)!;
    expect(stored.scope).toBe("SEARCH_AND_NOTICE");
    expect(stored.convertedFromId).toBe("consent-watch");
    const finding = { hashSubmissionId: "hs-1", crawlConsentId: "consent-watch", firstSeenAt: new Date("2026-11-18T12:00:00Z") };
    expect(consentCoversFinding(stored, finding)).toBe(true);
    // Without the conversion link, the same finding would be refused.
    expect(consentCoversFinding({ ...stored, convertedFromId: null }, finding)).toBe(false);
    // The audit entry records what was signed.
    const entry = inMemoryAuditLog.find((e) => e.eventType === "CRAWL_CONSENT_SIGNED" && (e.data as { consentId?: string })?.consentId === full.consentId);
    expect((entry?.data as { scope?: string })?.scope).toBe("SEARCH_AND_NOTICE");
  });
});

describe("Not now and Stop watching", () => {
  it("Not now keeps watching: the component makes no request and no route exists", async () => {
    // "Not now" is her say-so on the screen only: the component handler must
    // not call the network, and no server route exists for it, so nothing can
    // ever be sent by that choice.
    const source = readFileSync("src/app/(victim)/case/[caseId]/WatchFoundList.tsx", "utf8");
    const start = source.indexOf("function notNow");
    const notNow = source.slice(start, source.indexOf("\n  }\n", start));
    expect(notNow).toContain("setDeferred");
    expect(notNow).not.toMatch(/fetch|csrf|api\//);
  });

  it("stop-watching withdraws the authorisation and deletes her fingerprints", async () => {
    const { record } = await watchWithConsent();
    // An approved finding and its link, plus a candidate nobody reviewed.
    crawlMemory().findings.set("cf-1", {
      id: "cf-1", caseId: record.id, hashSubmissionId: "hs-1", crawlConsentId: "consent-watch",
      pageUrlEncrypted: encryptField("https://forum.example.com/thread/1"), imageUrlEncrypted: encryptField("https://cdn.example.com/1.jpg"),
      urlDigest: "digest-1", distance: 8, quality: 90, sscdSimilarity: null, method: "PDQ", firstSeenAt: new Date(), lastSeenAt: new Date(),
      sourceId: "src-1", runId: "run-1", reviewStatus: "APPROVED", reviewedById: "admin-1", reviewedAt: new Date(),
      secondReviewedById: null, secondReviewedAt: null,
      labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
      labelSexual: false, labelSexualById: null, labelSexualAt: null,
      labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
      labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
      minorProtocolBefore: null,
    });
    crawlMemory().findings.set("cf-2", {
      id: "cf-2", caseId: record.id, hashSubmissionId: "hs-1", crawlConsentId: "consent-watch",
      pageUrlEncrypted: encryptField("https://forum.example.com/thread/2"), imageUrlEncrypted: encryptField("https://cdn.example.com/2.jpg"),
      urlDigest: "digest-2", distance: 8, quality: 90, sscdSimilarity: null, method: "PDQ", firstSeenAt: new Date(), lastSeenAt: new Date(),
      sourceId: "src-1", runId: "run-1", reviewStatus: "CANDIDATE", reviewedById: null, reviewedAt: null,
      secondReviewedById: null, secondReviewedAt: null,
      labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
      labelSexual: false, labelSexualById: null, labelSexualAt: null,
      labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
      labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
      minorProtocolBefore: null,
    });
    store.cases.get(record.id)!.urls.push({
      id: "url-1", domain: "forum.example.com", platformName: "Example Forum", status: "NOTICE_QUEUED",
      urlHash: "hash-1", platformId: null, source: "CRAWLER", crawlFindingId: "cf-1",
    });

    const stopped = await stopWatching(record.id, "user-a");
    expect(stopped).toEqual({ ok: true, fingerprintsDeleted: 1 });
    // The authorisation is withdrawn and her fingerprints are gone.
    expect((await getCrawlConsentState(record.id)).status).toBe("withdrawn");
    expect(crawlMemory().fingerprints.has("hs-1")).toBe(false);
    expect(crawlMemory().findings.has("cf-1")).toBe(false);
    expect(crawlMemory().findings.has("cf-2")).toBe(false);
    // The link stays as the record, stopped by the withdrawal.
    const link = store.cases.get(record.id)!.urls[0];
    expect(link.crawlConsentWithdrawnAt).toBeTruthy();
    // The withdrawal audit entry records the deletion.
    const entry = inMemoryAuditLog.find((e) => e.eventType === "CRAWL_CONSENT_WITHDRAWN" && e.entityId === record.id);
    expect((entry?.data as { fingerprintsDeleted?: number })?.fingerprintsDeleted).toBeUndefined();
    const deletion = inMemoryAuditLog.find((e) => e.eventType === "ADMIN_ACTION" && (e.data as { action?: string })?.action === "watch_fingerprints_deleted");
    expect((deletion?.data as { fingerprintsDeleted?: number })?.fingerprintsDeleted).toBe(1);
  });

  it("clears the dev hash store too, so Add more images can start fresh", async () => {
    const { record } = await watchWithConsent();
    const { addHashesToCase, listHashesForCase } = await import("@/lib/hash-submission");
    await addHashesToCase(record.id, [{ hash: PDQ, quality: 90 }]);
    expect((await listHashesForCase(record.id)).length).toBeGreaterThan(0);
    await stopWatching(record.id, "user-a");
    expect(await listHashesForCase(record.id)).toEqual([]);
    expect(() => clearMemoryHashesForCase(record.id)).not.toThrow();
  });

  it("answers not_signed when nothing is live", async () => {
    const record = await createWatchCase("user-a");
    expect(await stopWatching(record.id, "user-a")).toEqual({ ok: false, error: "not_signed" });
  });
});
