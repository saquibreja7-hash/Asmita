import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Watch-and-verify WP23 on the memory path: scheduling on removal, the
// hourly sweep's enqueue into the crawler frontier, every outcome rule, the
// STILL_ONLINE follow-up, erasure, and that the new table stores no URL.
// The crawler's side of each check is driven through the real frontier
// report path (crawl-pages.ts), not by poking rows. Every address is a
// placeholder; nothing here fetches anything.

vi.mock("@/lib/email", () => ({ sendLinkStillOnlineNotification: vi.fn() }));

import { readFileSync } from "node:fs";
import path from "node:path";
import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, eraseCrawlMemoryForCases, resetCrawlMemory } from "@/lib/crawl-store";
import { crawlPageDigest, reportCrawlPages } from "@/lib/crawl-pages";
import { markUrlResolved } from "@/lib/case-ops";
import { sendLinkStillOnlineNotification } from "@/lib/email";
import { encryptField } from "@/lib/encryption";
import {
  VERIFICATION_DELAYS_MS,
  VERIFICATION_FINDING_GRACE_MS,
  VERIFICATION_GIVE_UP_MS,
  getLinkVerificationSummaries,
  scheduleLinkVerifications,
  sweepDueLinkVerifications,
} from "@/lib/link-verification";
import * as store from "@/lib/store";
import { parseSubmittedUrl } from "@/lib/url-parser";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const BASE = Date.UTC(2026, 10, 19, 9, 0, 0);
const nowAt = (offsetMs: number) => new Date(BASE + offsetMs);

const USER = "user-1";
const LINK_URL = "https://posts.example.net/media/1";
const parsedFixture = parseSubmittedUrl(LINK_URL);
if (!parsedFixture.ok) throw new Error("fixture link invalid");
const normalizedLink = parsedFixture.normalizedUrl;
const linkUrlHash = parsedFixture.urlHash;

/** A live crawl authorisation covering one approved fingerprint: exactly what puts her image in the pool (crawl-pool.ts inPool). */
function seedLiveConsent(caseId: string) {
  crawlMemory().fingerprints.set("hash-1", {
    id: "hash-1", caseId, hashEncrypted: encryptField("f".repeat(64)), quality: 90,
    status: "APPROVED", crawlPoolId: "fp_1",
  });
  crawlMemory().consents.push({
    id: "consent-1", caseId, signedPdfEncrypted: "enc:pdf", hashSubmissionIds: ["hash-1"],
    templateId: "t-1", templateDigest: "d-1", signedAt: nowAt(0), withdrawnAt: null,
  });
}

/**
 * A case with one link marked removed. When `throughCaseOps` is set the
 * removal goes through markUrlResolved (which schedules on the wall clock);
 * otherwise the link is marked removed directly and the checks are scheduled
 * at the fixture's base time, so the sweep can be driven by `nowAt`.
 */
async function removedCase(options?: { throughCaseOps?: boolean }) {
  store.cases.clear();
  store.users.clear();
  store.users.set(USER, { emailHash: "email-hash", emailEncrypted: encryptField("survivor@example.test") });
  const record = store.ensureCaseForUser("case-1", USER);
  await store.addUrlsToCase(record.id, [normalizedLink]);
  const link = record.urls.find((url) => url.urlHash === linkUrlHash)!;
  if (options?.throughCaseOps) {
    await markUrlResolved(record.id, USER, link.id);
  } else {
    link.status = "REMOVED";
    await scheduleLinkVerifications(link.id, nowAt(0));
  }
  return { caseId: record.id, urlId: link.id, link };
}

function checks() {
  return [...crawlMemory().linkVerifications.values()].sort((a, b) => a.attempt - b.attempt);
}

function sourceId() {
  return [...crawlMemory().sources.values()].find((source) => source.domain === "posts.example.net")!.id;
}

/** The frontier row of the check's page. */
function pageRow() {
  const digest = crawlPageDigest(sourceId(), normalizedLink)!;
  return [...crawlMemory().pages.values()].find((page) => page.sourceId === sourceId() && page.urlDigest === digest)!;
}

/** One whole attempt at `dueAt`: the sweep queues it, the crawler answers, the sweep resolves it. */
async function runAttempt(dueAtMs: number, status: "fetched" | "gone" | "blocked") {
  const queued = await sweepDueLinkVerifications(nowAt(dueAtMs));
  expect(queued.enqueued).toBe(1);
  const row = pageRow();
  const reportedAt = new Date(BASE + dueAtMs + 5 * MIN);
  await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status, links: [] }], reportedAt);
  return sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));
}

/** A possible copy the crawler recorded for this page under her fingerprints. */
function seedFinding(id: string, caseId: string, seenAt: Date, pageUrl = normalizedLink) {
  crawlMemory().findings.set(id, {
    id, caseId, hashSubmissionId: "hash-1", crawlConsentId: "consent-1",
    pageUrlEncrypted: encryptField(pageUrl),
    imageUrlEncrypted: encryptField("https://cdn.example.net/img.jpg"),
    urlDigest: `digest-${id}`, distance: 4, quality: 90,
    // WP28 (ADR 008): the memory finding now carries how it matched.
    sscdSimilarity: null, method: "PDQ",
    firstSeenAt: seenAt, lastSeenAt: seenAt,
    sourceId: sourceId(), runId: "run-1", reviewStatus: "CANDIDATE",
    reviewedById: null, reviewedAt: null, secondReviewedById: null, secondReviewedAt: null,
    labelAiMade: false, labelAiMadeById: null, labelAiMadeAt: null,
    labelSexual: false, labelSexualById: null, labelSexualAt: null,
    labelPossibleMinor: false, labelPossibleMinorById: null, labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null, labelPossibleMinorClearedAt: null, labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  store.users.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(sendLinkStillOnlineNotification).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("scheduling on removal", () => {
  it("schedules three checks, one at +1/+3/+7 days, when she marks the link removed", async () => {
    const { caseId, urlId } = await removedCase({ throughCaseOps: true });
    const rows = checks();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.attempt)).toEqual([1, 2, 3]);
    const due = rows.map((row) => row.dueAt.getTime());
    expect(due[1]! - due[0]!).toBe(VERIFICATION_DELAYS_MS[1]! - VERIFICATION_DELAYS_MS[0]!);
    expect(due[2]! - due[1]!).toBe(VERIFICATION_DELAYS_MS[2]! - VERIFICATION_DELAYS_MS[1]!);
    expect(rows.every((row) => row.outcome === "PENDING" && row.checkedAt === null && row.enqueuedAt === null)).toBe(true);
    expect(rows.every((row) => row.caseId === caseId && row.submittedUrlId === urlId)).toBe(true);
  });

  it("schedules nothing new while checks are pending, and not for an already-removed link", async () => {
    const { urlId } = await removedCase({ throughCaseOps: true });
    expect(await scheduleLinkVerifications(urlId, nowAt(MIN))).toEqual({ scheduled: 0 });
    // Re-marking an already-removed link is no transition, so nothing new.
    await markUrlResolved("case-1", USER, urlId);
    expect(checks()).toHaveLength(3);
  });

  it("never stores the link address in the verification rows", async () => {
    await removedCase();
    const serialized = JSON.stringify(checks());
    expect(serialized).not.toContain("posts.example.net");
    expect(serialized).not.toContain("media/1");
    expect(serialized).not.toContain("https://");
  });
});

describe("the hourly sweep: enqueueing due checks", () => {
  it("does nothing before a check is due", async () => {
    await removedCase();
    expect(await sweepDueLinkVerifications(nowAt(12 * HOUR))).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(crawlMemory().sources.size).toBe(0);
    expect(crawlMemory().pages.size).toBe(0);
  });

  it("creates the host's REPORTED source and a priority frontier row for the page", async () => {
    await removedCase();
    const now = nowAt(DAY);
    expect(await sweepDueLinkVerifications(now)).toEqual({ enqueued: 1, resolved: 0, stillOnline: 0 });
    const source = [...crawlMemory().sources.values()].find((item) => item.domain === "posts.example.net");
    expect(source).toMatchObject({ origin: "REPORTED", enabled: true, hops: 0 });
    // The frontier row is due immediately: ahead of every scheduled revisit.
    expect(pageRow()).toMatchObject({
      status: "PENDING", nextDueAt: new Date(0), etag: null, lastModified: null, lastFetchedAt: null, failCount: 0,
    });
    expect(pageRow().urlEncrypted).not.toContain("posts.example.net"); // encrypted at rest
    // The check is queued; the other two wait for their day.
    const rows = checks();
    expect(rows.find((row) => row.attempt === 1)!.enqueuedAt).toEqual(now);
    expect(rows.filter((row) => row.enqueuedAt !== null)).toHaveLength(1);
  });

  it("resets an already-crawled page to a fresh full fetch for each attempt", async () => {
    const { caseId } = await removedCase();
    seedLiveConsent(caseId);
    // Attempt 1: the crawler fetches the page and the app schedules a revisit.
    await runAttempt(DAY, "fetched");
    const row = pageRow();
    expect(row.status).toBe("FETCHED");
    expect(row.nextDueAt.getTime()).toBeGreaterThan(BASE + DAY);
    // Attempt 2 (three days later): the row is reset to PENDING, due now,
    // with no validators, so the check is a full fetch, never a 304.
    const second = await sweepDueLinkVerifications(nowAt(3 * DAY));
    expect(second.enqueued).toBe(1);
    expect(pageRow()).toMatchObject({
      status: "PENDING", nextDueAt: new Date(0), etag: null, lastModified: null, lastFetchedAt: null, failCount: 0,
    });
  });

  it("answers UNKNOWN for a never-crawl host, with no source and no frontier row", async () => {
    store.cases.clear();
    store.users.set(USER, { emailHash: "email-hash", emailEncrypted: encryptField("survivor@example.test") });
    const record = store.ensureCaseForUser("case-1", USER);
    await store.addUrlsToCase(record.id, ["https://www.instagram.com/p/placeholder"]);
    const link = record.urls[0]!;
    link.status = "REMOVED";
    await scheduleLinkVerifications(link.id, nowAt(0));

    const summary = await sweepDueLinkVerifications(nowAt(DAY));
    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(checks()[0]).toMatchObject({ outcome: "UNKNOWN", checkedAt: nowAt(DAY) });
    expect(crawlMemory().sources.size).toBe(0);
    expect(crawlMemory().pages.size).toBe(0);
    expect(checks()[1]!.outcome).toBe("PENDING"); // later attempts still run
  });

  it("answers UNKNOWN for a link whose address the retention already removed", async () => {
    const { link } = await removedCase();
    link.urlEncrypted = "";
    expect(await sweepDueLinkVerifications(nowAt(DAY))).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(checks()[0]!.outcome).toBe("UNKNOWN");
  });

  it("drops the pending checks of a link that is no longer removed", async () => {
    const { link } = await removedCase();
    link.status = "NOTICE_SENT"; // a still-online episode already moved it on
    expect(await sweepDueLinkVerifications(nowAt(DAY))).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(checks()).toHaveLength(0);
  });

  it("does nothing while the crawler is switched off", async () => {
    await removedCase();
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect(await sweepDueLinkVerifications(nowAt(DAY))).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(crawlMemory().sources.size).toBe(0);
    expect(checks().every((row) => row.enqueuedAt === null)).toBe(true);
  });
});

describe("the hourly sweep: resolving outcomes", () => {
  let caseId: string;

  beforeEach(async () => {
    ({ caseId } = await removedCase());
  });

  it("resolves GONE when the crawler reports the page gone (404/410)", async () => {
    const summary = await runAttempt(DAY, "gone");
    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(checks()[0]!).toMatchObject({ outcome: "GONE" });
  });

  it("resolves GONE when the page answers blocked (robots or 401/403)", async () => {
    await runAttempt(DAY, "blocked");
    expect(checks()[0]!.outcome).toBe("GONE");
  });

  it("waits two hours after a fetched page before deciding", async () => {
    await sweepDueLinkVerifications(nowAt(DAY));
    const row = pageRow();
    const reportedAt = new Date(BASE + DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "fetched", links: [] }], reportedAt);
    // One hour after the fetch: findings may still be in flight.
    await sweepDueLinkVerifications(new Date(reportedAt.getTime() + HOUR));
    expect(checks()[0]!.outcome).toBe("PENDING");
  });

  it("resolves GONE for a fetched page with no finding while her fingerprints are in the pool", async () => {
    seedLiveConsent(caseId);
    await runAttempt(DAY, "fetched");
    expect(checks()[0]!.outcome).toBe("GONE");
  });

  it("resolves UNKNOWN for a fetched page without a live authorisation: only the page was checked", async () => {
    await runAttempt(DAY, "fetched");
    expect(checks()[0]!.outcome).toBe("UNKNOWN");
  });

  it("resolves UNKNOWN for a page that answered not modified: its images were not re-hashed", async () => {
    seedLiveConsent(caseId);
    await sweepDueLinkVerifications(nowAt(DAY));
    const row = pageRow();
    const reportedAt = new Date(BASE + DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "not_modified", links: [] }], reportedAt);
    await sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));
    expect(checks()[0]!.outcome).toBe("UNKNOWN");
  });

  it("resolves UNKNOWN for a page that died of fetch errors", async () => {
    await sweepDueLinkVerifications(nowAt(DAY));
    Object.assign(pageRow(), { status: "DEAD", failCount: 5 });
    await sweepDueLinkVerifications(nowAt(DAY + 3 * HOUR));
    expect(checks()[0]!.outcome).toBe("UNKNOWN");
  });

  it("waits for a page the crawler has not visited, then gives up as UNKNOWN after seven days", async () => {
    const queuedAt = nowAt(DAY);
    await sweepDueLinkVerifications(queuedAt);
    // The source is switched off, so nothing is ever visited.
    for (const source of crawlMemory().sources.values()) source.enabled = false;
    await sweepDueLinkVerifications(new Date(queuedAt.getTime() + 3 * DAY));
    expect(checks()[0]!.outcome).toBe("PENDING");
    await sweepDueLinkVerifications(new Date(queuedAt.getTime() + VERIFICATION_GIVE_UP_MS + HOUR));
    expect(checks()[0]!.outcome).toBe("UNKNOWN");
  });

  it("resolves STILL_ONLINE when a finding for that page arrived since the check was queued", async () => {
    seedLiveConsent(caseId);
    await sweepDueLinkVerifications(nowAt(DAY));
    const row = pageRow();
    const reportedAt = new Date(BASE + DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "fetched", links: [] }], reportedAt);
    seedFinding("finding-1", caseId, new Date(reportedAt.getTime() + MIN));

    const summary = await sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));
    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 1 });

    // The link is back in the notice-sent state, which re-arms the existing
    // escalation ladder; the episode's remaining checks are dropped.
    const { link } = await removedCaseLookup();
    expect(link.status).toBe("NOTICE_SENT");
    const rows = checks();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "STILL_ONLINE", attempt: 1 });

    // Audited, and she is emailed her case reference only.
    const audit = inMemoryAuditLog.find((entry) => entry.eventType === "CONTENT_STILL_ONLINE")!;
    expect(audit).toMatchObject({ entityType: "SubmittedUrl", entityId: link.id });
    expect(JSON.stringify(audit.data)).not.toContain("posts.example.net");
    expect(vi.mocked(sendLinkStillOnlineNotification)).toHaveBeenCalledWith(
      "survivor@example.test",
      expect.stringMatching(/^ASMITA-/),
      expect.stringContaining("/case/case-1"),
      "en",
      `verify-still:${rows[0]!.id}`,
    );
    expect(JSON.stringify(vi.mocked(sendLinkStillOnlineNotification).mock.calls)).not.toContain("posts.example.net");

    // Marking it removed again starts a fresh episode: three new checks.
    await markUrlResolved("case-1", USER, link.id);
    expect(checks().filter((check) => check.outcome === "PENDING")).toHaveLength(3);
  });

  it("ignores a finding from before the check was queued", async () => {
    seedLiveConsent(caseId);
    await sweepDueLinkVerifications(nowAt(DAY));
    seedFinding("finding-old", caseId, nowAt(2 * HOUR)); // long before the queue
    const row = pageRow();
    const reportedAt = new Date(BASE + DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "fetched", links: [] }], reportedAt);
    await sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));
    expect(checks()[0]!.outcome).toBe("GONE");
  });

  it("ignores a finding for a different page", async () => {
    seedLiveConsent(caseId);
    await sweepDueLinkVerifications(nowAt(DAY));
    seedFinding("finding-other", caseId, nowAt(DAY + 6 * MIN), "https://posts.example.net/media/other");
    const row = pageRow();
    const reportedAt = new Date(BASE + DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "fetched", links: [] }], reportedAt);
    await sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));
    expect(checks()[0]!.outcome).toBe("GONE");
  });
});

describe("what her case page shows", () => {
  it("reports three GONE results as verified removed, checked three times", async () => {
    const { caseId, urlId } = await removedCase();
    seedLiveConsent(caseId);
    await runAttempt(DAY, "gone");
    await runAttempt(3 * DAY, "gone");
    await runAttempt(7 * DAY, "gone");
    const summaries = await getLinkVerificationSummaries(caseId);
    expect(summaries.get(urlId)).toEqual({ pending: 0, checked: 3, goneCount: 3, latestOutcome: "GONE" });
  });

  it("keeps the still-online outcome as the latest one until a new episode starts", async () => {
    const { caseId, urlId, link } = await removedCase();
    seedLiveConsent(caseId);
    // Attempt 1: really gone. Attempt 2: the content came back.
    await runAttempt(DAY, "gone");
    await sweepDueLinkVerifications(nowAt(3 * DAY));
    const row = pageRow();
    const reportedAt = new Date(BASE + 3 * DAY + 5 * MIN);
    await reportCrawlPages(row.sourceId, "run-1", [{ id: row.id, status: "fetched", links: [] }], reportedAt);
    seedFinding("finding-2", caseId, new Date(reportedAt.getTime() + MIN));
    await sweepDueLinkVerifications(new Date(reportedAt.getTime() + VERIFICATION_FINDING_GRACE_MS + MIN));

    const summaries = await getLinkVerificationSummaries(caseId);
    expect(summaries.get(urlId)).toEqual({ pending: 0, checked: 2, goneCount: 1, latestOutcome: "STILL_ONLINE" });
    // A new episode (she marked it removed again) hides the note until the
    // new checks answer.
    await markUrlResolved(caseId, USER, link.id);
    const fresh = await getLinkVerificationSummaries(caseId);
    expect(fresh.get(urlId)!.pending).toBe(3);
    expect(fresh.get(urlId)!.latestOutcome).toBe("STILL_ONLINE");
  });
});

describe("erasure", () => {
  it("erases a case's checks with its links, and only that case's", async () => {
    const { caseId } = await removedCase();
    expect(checks()).toHaveLength(3);
    const other = store.ensureCaseForUser("case-2", "user-2");
    crawlMemory().linkVerifications.set("v-other", {
      id: "v-other", caseId: other.id, submittedUrlId: "url-other", dueAt: nowAt(DAY), attempt: 1,
      outcome: "PENDING", checkedAt: null, enqueuedAt: null, createdAt: nowAt(0),
    });
    eraseCrawlMemoryForCases([caseId]);
    expect([...crawlMemory().linkVerifications.values()].filter((row) => row.caseId === caseId)).toEqual([]);
    expect(crawlMemory().linkVerifications.has("v-other")).toBe(true);
  });
});

describe("the table stores no address", () => {
  it("defines no URL or address column in the Prisma model or the migration", () => {
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model LinkVerification"), schema.indexOf("model CrawlServiceKey"));
    // The only link reference is the id, never the address itself.
    expect(model).toMatch(/submittedUrlId/);
    expect(model).not.toMatch(/urlEncrypted|urlHash|urlDigest|pageUrl|imageUrl|address/i);
    const migration = readFileSync(path.join(process.cwd(), "prisma", "migrations", "20261119000000_link_verification", "migration.sql"), "utf8");
    expect(migration).toMatch(/submittedUrlId/);
    expect(migration).not.toMatch(/urlEncrypted|urlHash|urlDigest|pageUrl|imageUrl|address/i);
  });
});

/** The current state of the fixture link in the store. */
async function removedCaseLookup() {
  const record = store.cases.get("case-1")!;
  const link = record.urls.find((url) => url.urlHash === linkUrlHash)!;
  return { link };
}
