import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Watch-and-verify WP24 on the memory path: the re-upload window after a
// case closes — when it starts (resolved case, or every link verified
// removed), that the pool keeps her fingerprints only while the case is
// open or the window runs, the reference-only email when an analyst
// approves a re-upload, and what "Stop watching" does. Every address is a
// placeholder; nothing here fetches anything.

vi.mock("@/lib/email", () => ({ sendReuploadFoundNotification: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { getCrawlConsentState, withdrawCrawlConsent } from "@/lib/crawl-consent";
import { buildCrawlPool, caseHasPoolFingerprints, isCaseOpen } from "@/lib/crawl-pool";
import { createCrawlSource } from "@/lib/crawl-sources";
import { recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import {
  REUPLOAD_WATCH_MONTHS,
  REUPLOAD_WATCH_SWEEP_BATCH,
  sweepReuploadWatches,
  VERIFIED_REMOVED_GONE_COUNT,
} from "@/lib/crawl-watch";
import { sendReuploadFoundNotification } from "@/lib/email";
import { encryptField } from "@/lib/encryption";
import { parseSubmittedUrl } from "@/lib/url-parser";
import * as store from "@/lib/store";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const BASE = Date.UTC(2026, 10, 19, 9, 0, 0);
const nowAt = (offsetMs: number) => new Date(BASE + offsetMs);

const USER = "user-watch";
const LINK_URL = "https://posts.example.net/media/1";
const parsedFixture = parseSubmittedUrl(LINK_URL);
if (!parsedFixture.ok) throw new Error("fixture link invalid");
const normalizedLink = parsedFixture.normalizedUrl;
const linkUrlHash = parsedFixture.urlHash;

let record: store.CaseRecord;
let sourceId: string;

/** A live crawl authorisation covering one approved fingerprint that sits in the pool. */
function seedLiveConsent(caseId: string, watchUntil: Date | null = null) {
  crawlMemory().fingerprints.set("hash-1", {
    id: "hash-1", caseId, hashEncrypted: encryptField("a".repeat(64)), quality: 90,
    status: "APPROVED", crawlPoolId: "fp_1",
  });
  crawlMemory().consents.push({
    id: "consent-1", caseId, signedPdfEncrypted: "enc:pdf", hashSubmissionIds: ["hash-1"],
    templateId: "t-1", templateDigest: "d-1", signedAt: nowAt(-30 * DAY), withdrawnAt: null, watchUntil,
  });
}

/** A case with one link; the link starts in the notice flow unless told otherwise. */
async function seedCase(options?: { linkStatus?: string; addLink?: boolean }) {
  store.users.clear();
  store.cases.clear();
  store.users.set(USER, { emailHash: "email-hash", emailEncrypted: encryptField("survivor@example.test") });
  record = store.ensureCaseForUser("case-watch", USER);
  if (options?.addLink !== false) {
    await store.addUrlsToCase(record.id, [normalizedLink]);
    const link = record.urls.find((url) => url.urlHash === linkUrlHash)!;
    if (options?.linkStatus) link.status = options.linkStatus as never;
    return link;
  }
  return null;
}

/** Completed removal re-checks for a link (only a GONE outcome counts, WP23). */
function seedGoneChecks(urlId: string, count: number, outcome: "GONE" | "STILL_ONLINE" | "UNKNOWN" = "GONE") {
  for (let index = 0; index < count; index += 1) {
    crawlMemory().linkVerifications.set(`chk-${urlId}-${index}`, {
      id: `chk-${urlId}-${index}`, caseId: record.id, submittedUrlId: urlId,
      dueAt: nowAt(0), attempt: index + 1, outcome, checkedAt: nowAt(0), enqueuedAt: nowAt(0), createdAt: nowAt(-8 * DAY),
    });
  }
}

/** A possible copy the crawler recorded for this page under her fingerprints. */
function seedFinding(id: string, seenAt: Date, pageUrl = LINK_URL, distance = 4) {
  crawlMemory().findings.set(id, {
    id, caseId: record.id, hashSubmissionId: "hash-1", crawlConsentId: "consent-1",
    pageUrlEncrypted: encryptField(pageUrl),
    imageUrlEncrypted: encryptField("https://cdn.example.net/img.jpg"),
    urlDigest: `digest-${id}`, distance, quality: 90,
    // WP28 (ADR 008): the memory finding now carries how it matched.
    sscdSimilarity: null, method: "PDQ",
    firstSeenAt: seenAt, lastSeenAt: seenAt,
    sourceId, runId: "run-1", reviewStatus: "CANDIDATE",
    reviewedById: null, reviewedAt: null, secondReviewedById: null, secondReviewedAt: null,
  });
}

/** The crawler reports a possible copy through the real findings path, at `at`. */
async function reportFinding(at: Date, distance = 4) {
  return recordCrawlFindings({
    runId: "run-1",
    findings: [{
      fingerprintId: "fp_1", pageUrl: LINK_URL, imageUrl: "https://cdn.example.net/img.jpg",
      distance, quality: 90, observedAt: at.toISOString(), sourceId,
    }],
  }, "key-1");
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  store.users.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(sendReuploadFoundNotification).mockReset();
  const source = await createCrawlSource({ domain: "posts.example.net", pageBudget: 10, delayMs: 1000, enabled: true }, "admin-0");
  if (!source.ok) throw new Error("source");
  sourceId = source.source.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("starting the window", () => {
  it("starts a 12-month window on a resolved case, audited once", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id);
    record.status = "RESOLVED";

    const summary = await sweepReuploadWatches(nowAt(0));

    expect(summary.started).toBe(1);
    const consent = crawlMemory().consents.find((c) => c.caseId === record.id)!;
    const expected = new Date(nowAt(0).getTime());
    expected.setMonth(expected.getMonth() + REUPLOAD_WATCH_MONTHS);
    expect(consent.withdrawnAt).toBeNull();
    expect(consent.watchUntil?.toISOString()).toBe(expected.toISOString());
    expect(consent.watchUntil!.getTime()).toBeGreaterThan(nowAt(0).getTime());
    // The window is 12 calendar months: 2026-11-19 -> 2027-11-19.
    expect(consent.watchUntil!.toISOString()).toBe("2027-11-19T09:00:00.000Z");
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_WATCH_STARTED")).toEqual([
      expect.objectContaining({
        entityType: "Case",
        entityId: record.id,
        data: { consentId: "consent-1", watchUntil: consent.watchUntil!.toISOString() },
      }),
    ]);
  });

  it("does not start on an open case, a case without a live authorisation, or a withdrawn one", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id);
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);

    crawlMemory().consents.splice(0, crawlMemory().consents.length);
    record.status = "RESOLVED";
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);

    seedLiveConsent(record.id);
    crawlMemory().consents.find((c) => c.caseId === record.id)!.withdrawnAt = nowAt(0);
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);
    expect(crawlMemory().consents.find((c) => c.caseId === record.id)!.watchUntil ?? null).toBeNull();
  });

  it("first start wins: a second sweep moves nothing and audits nothing again", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id);
    record.status = "RESOLVED";

    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(1);
    const first = crawlMemory().consents.find((c) => c.caseId === record.id)!.watchUntil!.toISOString();

    // A later pass (the case flagged resolved again months later) must not extend it.
    expect((await sweepReuploadWatches(nowAt(30 * DAY))).started).toBe(0);
    expect(crawlMemory().consents.find((c) => c.caseId === record.id)!.watchUntil!.toISOString()).toBe(first);
    expect(inMemoryAuditLog.filter((e) => e.eventType === "CRAWL_WATCH_STARTED")).toHaveLength(1);
  });

  it("starts the window when every link is verified removed, without the case being resolved", async () => {
    const link = (await seedCase({ linkStatus: "REMOVED" }))!;
    seedLiveConsent(record.id);
    seedGoneChecks(link.id, VERIFIED_REMOVED_GONE_COUNT);

    expect(record.status).toBe("OPEN");
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(1);
  });

  it("verified removed means every non-rejected link is removed with three GONE checks", async () => {
    const link = (await seedCase({ linkStatus: "REMOVED" }))!;
    seedLiveConsent(record.id);

    // Two GONE checks are not enough yet.
    seedGoneChecks(link.id, 2);
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);

    // Nor a check that found the content back, or could not decide.
    crawlMemory().linkVerifications.clear();
    seedGoneChecks(link.id, 2, "STILL_ONLINE");
    seedGoneChecks(link.id, 1, "UNKNOWN");
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);

    // Nor a removed verified link while another link is still in the notice flow.
    crawlMemory().linkVerifications.clear();
    seedGoneChecks(link.id, 3);
    await store.addUrlsToCase(record.id, ["https://posts.example.net/media/2"]);
    record.urls[1]!.status = "NOTICE_SENT";
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(0);

    // A rejected link was never a takedown, so it does not block the trigger.
    record.urls[1]!.status = "REJECTED";
    crawlMemory().linkVerifications.clear();
    seedGoneChecks(link.id, 3);
    expect((await sweepReuploadWatches(nowAt(0))).started).toBe(1);
  });

  it("the sweep passes and batch are the documented constants", () => {
    // Bounded per hourly pass like the WP23 sweeps; three GONE checks is the
    // same "verified removed" rule as her case page.
    expect(VERIFIED_REMOVED_GONE_COUNT).toBe(3);
    expect(REUPLOAD_WATCH_SWEEP_BATCH).toBe(200);
  });
});

describe("the pool keeps her fingerprints while the case is open or the window runs", () => {
  it("open case: in the pool whatever the window", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, null);
    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(1);
  });

  it("resolved within the window: still in the pool, and a reported copy is accepted", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(180 * DAY));
    record.status = "RESOLVED";

    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(1);
    const reported = await reportFinding(nowAt(0));
    expect(reported.results).toEqual([{ status: "accepted" }]);
    // WP23's image-level check follows the same rule: her fingerprints are
    // being matched, so a fetched page without a match means the image is gone.
    expect(await caseHasPoolFingerprints(record.id, nowAt(0))).toBe(true);
  });

  it("resolved after the window ended: out of the pool, and the crawler's report is refused", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(-1 * DAY));
    record.status = "RESOLVED";

    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(0);
    const reported = await reportFinding(nowAt(0));
    expect(reported.results).toEqual([{ status: "rejected", reason: "fingerprint_not_accepted" }]);
    expect(await caseHasPoolFingerprints(record.id, nowAt(0))).toBe(false);
  });

  it("resolved before any window started (the sweep has not run): out of the pool", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, null);
    record.status = "RESOLVED";
    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(0);
  });

  it("partly resolved and escalated cases count as open", () => {
    expect(isCaseOpen("OPEN")).toBe(true);
    expect(isCaseOpen("PARTIALLY_RESOLVED")).toBe(true);
    expect(isCaseOpen("ESCALATED")).toBe(true);
    expect(isCaseOpen("RESOLVED")).toBe(false);
    expect(isCaseOpen("CLOSED")).toBe(false);
  });

  it("a withdrawn consent is out of the pool whatever its window", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(180 * DAY));
    crawlMemory().consents.find((c) => c.caseId === record.id)!.withdrawnAt = nowAt(0);
    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(0);
  });
});

describe("her dashboard and the consent state", () => {
  it("exposes the window while the authorisation is live, and nothing once withdrawn", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(180 * DAY));
    expect(await getCrawlConsentState(record.id)).toMatchObject({
      status: "signed",
      watchUntil: nowAt(180 * DAY).toISOString(),
    });

    // Stop watching withdraws the authorisation: the window, the pool ids and
    // the state all go, exactly as her own stop always did.
    expect((await withdrawCrawlConsent(record.id, USER)).ok).toBe(true);
    expect(await getCrawlConsentState(record.id)).toMatchObject({ status: "withdrawn", watchUntil: null });
    expect(crawlMemory().fingerprints.get("hash-1")!.crawlPoolId).toBeNull();
    expect((await buildCrawlPool(nowAt(0))).fingerprints).toHaveLength(0);
  });
});

describe("a re-upload found and approved", () => {
  it("emails her the reference and a sign-in prompt only, under a per-finding key", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(180 * DAY));
    record.status = "RESOLVED";
    await reportFinding(nowAt(0));
    const finding = [...crawlMemory().findings.values()][0]!;

    const outcome = await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1", now: nowAt(MIN) });

    expect(outcome).toMatchObject({ ok: true, status: "APPROVED" });
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(1);
    expect(sendReuploadFoundNotification).toHaveBeenCalledWith(
      "survivor@example.test",
      record.referenceNumber,
      `https://meriasmita.org/case/${record.id}`,
      "en",
      `reupload-found:${finding.id}`,
    );
  });

  it("sends nothing on an open case, and nothing for a dismissal or a first review", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(180 * DAY));
    await reportFinding(nowAt(0), 25);
    const finding = [...crawlMemory().findings.values()][0]!;

    // Open case: analyst review and the dashboard as before, no email at any
    // stage of the review.
    const first = await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1", now: nowAt(MIN) });
    expect(first).toMatchObject({ ok: true, status: "AWAITING_SECOND_REVIEW" });
    const second = await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-2", now: nowAt(2 * MIN) });
    expect(second).toMatchObject({ ok: true, status: "APPROVED" });
    expect(sendReuploadFoundNotification).not.toHaveBeenCalled();

    // A dismissal never emails.
    seedFinding("finding-dismiss", nowAt(3 * MIN), "https://posts.example.net/media/2");
    await reviewCrawlFinding({ findingId: "finding-dismiss", decision: "dismiss", reviewerId: "admin-1", now: nowAt(4 * MIN) });
    expect(sendReuploadFoundNotification).not.toHaveBeenCalled();
  });

  it("sends nothing when the window ended between the find and the approval", async () => {
    await seedCase({ addLink: false });
    seedLiveConsent(record.id, nowAt(HOUR));
    record.status = "RESOLVED";
    // The copy was found while the window still ran...
    seedFinding("finding-expired", nowAt(0));

    // ...but the analyst approves it after the window ended: the approval
    // stands (her authorisation is still live), only the alert email is gone.
    const outcome = await reviewCrawlFinding({ findingId: "finding-expired", decision: "approve", reviewerId: "admin-1", now: nowAt(2 * HOUR) });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED" });
    expect(sendReuploadFoundNotification).not.toHaveBeenCalled();
  });
});
