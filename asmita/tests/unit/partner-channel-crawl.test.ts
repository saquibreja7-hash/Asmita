import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP33 (partner programme part 2): the partner side of the crawler flow —
// the permission gate on findings ingestion and the channel alert on an
// analyst's acceptance, both through the real crawl functions on the
// memory path. Proves the spec's rules as WP33 touches them: a finding on
// a platform partner's domain is refused until the partner's written
// permission to crawl is recorded (Rule 5); an accepted finding on such a
// domain alerts the partner's channel with the case reference, the URL on
// their domain and the fingerprint id only — never the image address,
// never a fingerprint value (Rule 1); nothing about the alert changes the
// analyst review step: the finding is approved, the link created and the
// audit entries written exactly as before, whether or not an alert goes
// out. Synthetic data only: forum.example.com / plain.example.org hosts,
// a placeholder hash.

const mocks = vi.hoisted(() => ({
  sendNoticeDraft: vi.fn(async () => ({ id: "dev-notice-message" })),
}));

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendNoticeDraft: mocks.sendNoticeDraft,
}));

import { inMemoryAuditLog } from "@/lib/audit";
import { recordCrawlConsent } from "@/lib/crawl-consent";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { createCrawlSource } from "@/lib/crawl-sources";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { encryptField } from "@/lib/encryption";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import * as store from "@/lib/store";

const CHANNEL_EMAIL = "channel@forum.example.com";
const PARTNER_PAGE = "https://forum.example.com/thread/1";
const IMAGE_URL = "https://cdn.example.com/img/1.jpg";
const PDQ = "ab".repeat(32);

let sourceId: string;
let plainSourceId: string;

function seedPartner(overrides: Record<string, unknown> = {}) {
  partnerMemory().partners.set("partner-1", {
    id: "partner-1",
    name: "ExampleForum",
    primaryDomain: "forum.example.com",
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: encryptField(CHANNEL_EMAIL),
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
}

async function caseWithConsent() {
  const record = await store.createCase("user-a");
  crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField(PDQ), quality: 80, status: "APPROVED", crawlPoolId: null });
  const signed = await recordCrawlConsent({
    caseId: record.id, signedPdfEncrypted: encryptField("placeholder-pdf"), hashSubmissionIds: ["hs-1"],
    templateId: "tpl-1", templateDigest: "digest-1", actorId: "user-a",
  });
  expect(signed.ok).toBe(true);
  return record;
}

const report = (fingerprintId: string, pageUrl: string, distance = 6) =>
  recordCrawlFindings({
    runId: "run-1",
    findings: [{
      fingerprintId, pageUrl, imageUrl: IMAGE_URL, distance, quality: 90,
      observedAt: "2026-11-16T10:00:00Z", sourceId: pageUrl.startsWith("https://plain") ? plainSourceId : sourceId,
    }],
  }, "key-1");

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetCrawlMemory();
  resetPartnerMemory();
  store.cases.clear();
  mocks.sendNoticeDraft.mockClear();
  const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!created.ok) throw new Error("source");
  sourceId = created.source.id;
  const plain = await createCrawlSource({ domain: "plain.example.org", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!plain.ok) throw new Error("plain source");
  plainSourceId = plain.source.id;
});
afterEach(() => vi.unstubAllEnvs());

describe("the crawl-permission gate on findings", () => {
  it("refuses a finding on a partner's domain until the written permission is recorded", async () => {
    await caseWithConsent();
    seedPartner(); // no crawlPermissionRecordedAt

    const result = await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, PARTNER_PAGE);
    expect(result.results[0]).toEqual({ status: "rejected", reason: "partner_permission_missing" });
    expect(crawlMemory().findings.size).toBe(0);
    expect(inMemoryAuditLog.find((entry) => entry.eventType === "CRAWL_FINDING_RECORDED")).toBeUndefined();

    // The same finding on a host no partner owns is none of the
    // programme's business.
    const plain = await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, "https://plain.example.org/thread/1");
    expect(plain.results[0]).toEqual({ status: "accepted" });
    expect(crawlMemory().findings.size).toBe(1);

    // Recorded permission opens the partner's domain.
    seedPartner({ crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z") });
    const open = await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, PARTNER_PAGE);
    expect(open.results[0]).toEqual({ status: "accepted" });
  });
});

describe("the channel alert on an analyst's acceptance", () => {
  it("alerts the partner channel with the case reference, the URL on their domain and the fingerprint id", async () => {
    const record = await caseWithConsent();
    seedPartner({ crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z") });
    await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, PARTNER_PAGE);
    const [finding] = crawlMemory().findings.values();

    const outcome = await reviewCrawlFinding({ findingId: finding!.id, decision: "approve", reviewerId: "analyst-1" });
    // The review step is unchanged: the finding is approved, the link
    // created, whatever the channel did.
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });
    expect(typeof (outcome as { submittedUrlId: string }).submittedUrlId).toBe("string");
    const link = store.cases.get(record.id)!.urls.find((url) => url.source === "CRAWLER");
    expect(link).toBeDefined();
    expect(inMemoryAuditLog.find((entry) => entry.eventType === "CRAWL_FINDING_APPROVED")!.data).toMatchObject({ stage: "final" });

    // One alert, to the channel email, with exactly the three facts.
    expect(mocks.sendNoticeDraft).toHaveBeenCalledTimes(1);
    const [to, subject, body] = mocks.sendNoticeDraft.mock.calls[0]! as unknown as [string, string, string];
    expect(to).toBe(CHANNEL_EMAIL);
    expect(subject).toContain(record.referenceNumber);
    expect(body).toContain(record.referenceNumber);
    expect(body).toContain(PARTNER_PAGE);
    expect(body).toContain("hs-1");
    // Never the image, never the fingerprint value, never her data.
    expect(body).not.toContain(IMAGE_URL);
    expect(body).not.toContain(PDQ);
    expect(body).not.toContain("user-a");

    // The alert is audited alongside the approval, ids only.
    const alertAudit = inMemoryAuditLog.find((entry) => entry.eventType === "PARTNER_CHANNEL_SENT")!;
    expect(alertAudit.entityId).toBe("partner-1");
    expect(alertAudit.data).toMatchObject({ kind: "alert", findingId: finding!.id, caseId: record.id, fingerprintId: "hs-1" });
    expect(JSON.stringify(alertAudit.data)).not.toContain("thread/1");
    expect(partnerMemory().channelSends).toHaveLength(1);
  });

  it("sends the alert only after the second of the two required reviews", async () => {
    await caseWithConsent();
    seedPartner({ crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z") });
    await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, PARTNER_PAGE, 25);
    const [finding] = crawlMemory().findings.values();

    expect(await reviewCrawlFinding({ findingId: finding!.id, decision: "approve", reviewerId: "analyst-1" }))
      .toMatchObject({ ok: true, status: "AWAITING_SECOND_REVIEW" });
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();
    expect(await reviewCrawlFinding({ findingId: finding!.id, decision: "approve", reviewerId: "analyst-2" }))
      .toMatchObject({ ok: true, status: "APPROVED" });
    expect(mocks.sendNoticeDraft).toHaveBeenCalledTimes(1);
  });

  it("approves and alerts no one without a permission, an active partner with a channel, or a partner's domain", async () => {
    // One fresh case, consent and finding per block: the memory crawl store
    // is reset between them, so each approval starts from nothing. (A
    // partner domain without a recorded permission never gets this far —
    // the ingestion gate refuses the finding — which the gate test above
    // proves; the alert's own permission gate is covered in
    // partner-channel.test.ts.)
    const approvalOn = async (pageUrl: string, partnerOverrides: Record<string, unknown> = {}) => {
      // A reset also drops the sources the beforeEach created, so every
      // block rebuilds the full memory state it needs.
      resetCrawlMemory();
      const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
      if (!created.ok) throw new Error("source");
      sourceId = created.source.id;
      const plain = await createCrawlSource({ domain: "plain.example.org", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
      if (!plain.ok) throw new Error("plain source");
      plainSourceId = plain.source.id;
      await caseWithConsent();
      seedPartner(partnerOverrides);
      await report(crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!, pageUrl);
      const [finding] = crawlMemory().findings.values();
      return reviewCrawlFinding({ findingId: finding!.id, decision: "approve", reviewerId: "analyst-1" });
    };

    // Suspended partner: no alert, the review still stands.
    expect(await approvalOn(PARTNER_PAGE, { crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z"), status: "SUSPENDED" }))
      .toMatchObject({ ok: true, status: "APPROVED" });
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();

    // No channel email: no alert, the review still stands.
    expect(await approvalOn(PARTNER_PAGE, { crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z"), channelEmailEncrypted: null }))
      .toMatchObject({ ok: true, status: "APPROVED" });
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();

    // A finding on a host no partner owns: no alert, the review stands.
    expect(await approvalOn("https://plain.example.org/thread/1", { crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z") }))
      .toMatchObject({ ok: true, status: "APPROVED" });
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();
    expect(partnerMemory().channelSends).toHaveLength(0);
  });
});
