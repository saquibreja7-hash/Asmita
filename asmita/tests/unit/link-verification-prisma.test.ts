import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP23 (watch-and-verify spec) on the Prisma (Node) path, against a mocked
// client: scheduling is one createMany of exactly the three checks
// (+1/+3/+7 days, attempts 1..3); the sweep's enqueue step upserts the
// priority page row (reset to a pre-visit state on conflict) and marks the
// check enqueued with a conditional updateMany; resolve maps the crawler's
// report to an outcome end to end — a gone or blocked page is GONE, a
// fetched page is GONE only while a live authorisation lists an approved
// fingerprint of hers in the pool, a not-modified page and everything that
// cannot decide are UNKNOWN, and a finding for the page on her case since
// the check was queued wins as STILL_ONLINE: the link flips REMOVED ->
// NOTICE_SENT, the remaining checks are dropped, the outcome is audited and
// the email carries her case reference only. Placeholder hosts only (the
// never-crawl host is from the built-in list, like the other tests).

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    submittedUrl: { findUnique: fn(), updateMany: fn() },
    linkVerification: { count: fn(), createMany: fn(), findMany: fn(), updateMany: fn(), deleteMany: fn() },
    crawlSource: { findFirst: fn(), create: fn() },
    crawlBlockedHost: { findFirst: fn() },
    crawlPage: { upsert: fn(), findUnique: fn() },
    crawlFinding: { findMany: fn() },
    crawlConsent: { findMany: fn() },
    hashSubmission: { findMany: fn() },
    case: { findUnique: fn(), findMany: fn() },
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(), writeAuditLogs: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendLinkStillOnlineNotification: vi.fn() }));

import { encryptField } from "@/lib/encryption";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { crawlPageDigest } from "@/lib/crawl-pages";
import { scheduleLinkVerifications, sweepDueLinkVerifications, VERIFICATION_DELAYS_MS, VERIFICATION_SWEEP_BATCH } from "@/lib/link-verification";
import { writeAuditLog } from "@/lib/audit";
import { sendLinkStillOnlineNotification } from "@/lib/email";

const NOW = new Date("2026-11-17T09:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PAGE = "https://forum.example.com/thread/1";
const PARSED = parseSubmittedUrl(PAGE);
if (!PARSED.ok) throw new Error("test fixture URL must parse");
const LINK = {
  id: "url-1",
  caseId: "case-1",
  urlEncrypted: encryptField(PAGE),
  urlHash: PARSED.urlHash,
  domain: PARSED.domain,
  status: "REMOVED",
};
const QUEUED_AT = new Date(NOW.getTime() - DAY);

function checkRow(overrides: Record<string, unknown> = {}) {
  return { id: "chk-1", submittedUrlId: "url-1", attempt: 1, dueAt: new Date(NOW.getTime() - HOUR), enqueuedAt: null, ...overrides };
}

/** One enqueued check of the seeded link, the resolve step's input. */
function enqueuedCheck(overrides: Record<string, unknown> = {}) {
  return checkRow({ enqueuedAt: QUEUED_AT, ...overrides });
}

// The two pendingChecks queries dispatch on their `where` shape.
let dueChecks: Array<Record<string, unknown>> = [];
let enqueuedChecks: Array<Record<string, unknown>> = [];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  dueChecks = [];
  enqueuedChecks = [];
  db.submittedUrl.findUnique.mockResolvedValue({ ...LINK });
  db.submittedUrl.updateMany.mockResolvedValue({ count: 1 });
  db.linkVerification.count.mockResolvedValue(0);
  db.linkVerification.createMany.mockResolvedValue({ count: 3 });
  db.linkVerification.findMany.mockImplementation(async (args: { where?: { enqueuedAt?: unknown } }) =>
    ((args?.where && args.where.enqueuedAt === null ? dueChecks : enqueuedChecks) as Array<Record<string, unknown>>).map((row) => ({ ...row })));
  db.linkVerification.updateMany.mockResolvedValue({ count: 1 });
  db.linkVerification.deleteMany.mockResolvedValue({ count: 0 });
  db.crawlSource.findFirst.mockResolvedValue(null);
  db.crawlSource.create.mockResolvedValue({ id: "src-created" });
  db.crawlBlockedHost.findFirst.mockResolvedValue(null);
  db.crawlPage.upsert.mockResolvedValue({});
  db.crawlPage.findUnique.mockResolvedValue(null);
  db.crawlFinding.findMany.mockResolvedValue([]);
  db.crawlConsent.findMany.mockResolvedValue([]);
  db.hashSubmission.findMany.mockResolvedValue([]);
  db.case.findUnique.mockResolvedValue(null);
  // WP24: the pool rule also reads the case status; the fixture case is open,
  // so a live authorisation with an approved fingerprint means "in the pool".
  db.case.findMany.mockResolvedValue([{ id: "case-1", status: "OPEN" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("scheduleLinkVerifications, Prisma path", () => {
  it("inserts the three checks in one createMany", async () => {
    expect(await scheduleLinkVerifications("url-1", NOW)).toEqual({ scheduled: 3 });
    expect(db.submittedUrl.findUnique).toHaveBeenCalledWith({
      where: { id: "url-1" },
      select: { id: true, caseId: true, urlEncrypted: true, urlHash: true, domain: true, status: true },
    });
    expect(db.linkVerification.count).toHaveBeenCalledWith({ where: { submittedUrlId: "url-1", outcome: "PENDING" } });
    expect(db.linkVerification.createMany).toHaveBeenCalledTimes(1);
    const data = db.linkVerification.createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(data.map((row) => row.attempt)).toEqual([1, 2, 3]);
    expect(data.map((row) => row.dueAt)).toEqual(VERIFICATION_DELAYS_MS.map((ms) => new Date(NOW.getTime() + ms)));
    for (const row of data) {
      expect(row.submittedUrlId).toBe("url-1");
      expect(row.id).toEqual(expect.any(String));
      // No case, no address: the row works from the link it references.
      expect(Object.keys(row).sort()).toEqual(["attempt", "dueAt", "id", "submittedUrlId"]);
    }
  });

  it("schedules nothing for a missing link, or while checks still wait", async () => {
    db.submittedUrl.findUnique.mockResolvedValueOnce(null);
    expect(await scheduleLinkVerifications("url-1", NOW)).toEqual({ scheduled: 0 });
    db.linkVerification.count.mockResolvedValueOnce(1);
    expect(await scheduleLinkVerifications("url-1", NOW)).toEqual({ scheduled: 0 });
    expect(db.linkVerification.createMany).not.toHaveBeenCalled();
  });
});

describe("sweepDueLinkVerifications, Prisma path", () => {
  it("does nothing while the crawler is switched off", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(db.linkVerification.findMany).not.toHaveBeenCalled();
  });
});

describe("sweepDueLinkVerifications enqueue, Prisma path", () => {
  it("upserts the priority page row and marks the check enqueued", async () => {
    dueChecks = [checkRow()];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 1, resolved: 0, stillOnline: 0 });
    expect(db.linkVerification.findMany).toHaveBeenCalledWith({
      where: { outcome: "PENDING", dueAt: { lte: NOW }, enqueuedAt: null },
      orderBy: { dueAt: "asc" },
      take: VERIFICATION_SWEEP_BATCH,
      select: { id: true, submittedUrlId: true, attempt: true, dueAt: true, enqueuedAt: true },
    });
    // The never-crawl lookup asked for the host and its parents.
    expect(db.crawlBlockedHost.findFirst).toHaveBeenCalledWith({
      where: { host: { in: ["forum.example.com", "example.com", "com"] } },
      select: { host: true },
    });
    expect(db.crawlSource.create).toHaveBeenCalledWith({
      data: { domain: "forum.example.com", pageBudget: 2000, delayMs: 1500, enabled: true, origin: "REPORTED" },
      select: { id: true },
    });
    const digest = crawlPageDigest("src-created", PARSED.normalizedUrl);
    expect(db.crawlPage.upsert).toHaveBeenCalledWith({
      where: { sourceId_urlDigest: { sourceId: "src-created", urlDigest: digest } },
      create: expect.objectContaining({
        sourceId: "src-created",
        urlDigest: digest,
        depth: 0,
        status: "PENDING",
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        nextDueAt: new Date(0),
        failCount: 0,
      }),
      update: { status: "PENDING", etag: null, lastModified: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0 },
    });
    const create = db.crawlPage.upsert.mock.calls[0]![0].create as Record<string, unknown>;
    expect(String(create.urlEncrypted)).not.toContain("forum.example.com"); // encrypted at rest
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { enqueuedAt: NOW },
    });
    // The REPORTED source creation is audited (host only).
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "CRAWL_SOURCE_REPORTED",
      data: expect.objectContaining({ domain: "forum.example.com" }),
    }));
  });

  it("a never-crawl host resolves UNKNOWN with no source and no page row", async () => {
    const NEVER = "https://www.instagram.com/p/abc123"; // built-in never-crawl list
    const never = parseSubmittedUrl(NEVER);
    if (!never.ok) throw new Error("test fixture URL must parse");
    db.submittedUrl.findUnique.mockResolvedValue({ ...LINK, urlEncrypted: encryptField(NEVER), urlHash: never.urlHash, domain: never.domain });
    dueChecks = [checkRow()];

    const summary = await sweepDueLinkVerifications(NOW);

    // The enqueue step resolves it UNKNOWN right away, so it counts as resolved.
    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
    expect(db.crawlPage.upsert).not.toHaveBeenCalled();
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
  });

  it("resolves UNKNOWN when the address is blank or not crawler-shaped", async () => {
    dueChecks = [checkRow()];
    db.submittedUrl.findUnique.mockResolvedValue({ ...LINK, urlEncrypted: "" }); // the retention already blanked it
    await sweepDueLinkVerifications(NOW);

    dueChecks = [checkRow({ id: "chk-2" })];
    db.submittedUrl.findUnique.mockResolvedValue({ ...LINK, urlEncrypted: encryptField("https://forum.example.com:8080/thread/1") });
    await sweepDueLinkVerifications(NOW);

    expect(db.linkVerification.updateMany).toHaveBeenCalledTimes(2);
    for (const call of db.linkVerification.updateMany.mock.calls) {
      expect(call[0]).toEqual({ where: { id: expect.any(String), outcome: "PENDING" }, data: { outcome: "UNKNOWN", checkedAt: NOW } });
    }
    // Neither check ever reached the source or the frontier.
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
    expect(db.crawlPage.upsert).not.toHaveBeenCalled();
  });

  it("drops a removed link's pending checks when the link is no longer removed", async () => {
    dueChecks = [checkRow()];
    db.submittedUrl.findUnique.mockResolvedValue({ ...LINK, status: "NOTICE_SENT" });

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(db.linkVerification.deleteMany).toHaveBeenCalledWith({
      where: { submittedUrlId: { in: ["url-1"] }, outcome: "PENDING" },
    });
    expect(db.linkVerification.updateMany).not.toHaveBeenCalled();
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
  });
});

describe("sweepDueLinkVerifications resolve, Prisma path", () => {
  beforeEach(() => {
    enqueuedChecks = [enqueuedCheck()];
    db.crawlSource.findFirst.mockResolvedValue({ id: "src-1" });
  });

  it("a gone or blocked page resolves GONE with one conditional update", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "GONE", lastFetchedAt: new Date(NOW.getTime() - 2 * HOUR) });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledTimes(1);
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "GONE", checkedAt: NOW },
    });

    db.linkVerification.updateMany.mockClear();
    db.crawlPage.findUnique.mockResolvedValue({ status: "BLOCKED", lastFetchedAt: null });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "GONE", checkedAt: NOW },
    });
  });

  it("a fetched page resolves UNKNOWN while her fingerprints are not in the pool", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "FETCHED", lastFetchedAt: new Date(NOW.getTime() - 3 * HOUR) });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
    // The pool read ran and found no live authorisation.
    expect(db.crawlConsent.findMany).toHaveBeenCalledWith({
      where: { withdrawnAt: null, caseId: { in: ["case-1"] } },
      select: { id: true, caseId: true, hashSubmissionIds: true, watchUntil: true },
    });
    expect(db.hashSubmission.findMany).not.toHaveBeenCalled();
  });

  it("a fetched page resolves GONE when a live authorisation lists an approved fingerprint", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "FETCHED", lastFetchedAt: new Date(NOW.getTime() - 3 * HOUR) });
    db.crawlConsent.findMany.mockResolvedValue([{ id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hash-1"] }]);
    db.hashSubmission.findMany.mockResolvedValue([
      { id: "hash-1", caseId: "case-1", crawlPoolId: "pool-1", status: "APPROVED", hashEncrypted: "not-read-here", quality: 90 },
    ]);
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.hashSubmission.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["hash-1"] } },
      select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true },
    });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "GONE", checkedAt: NOW },
    });
  });

  it("a not-modified page resolves UNKNOWN after the grace, without reading the pool", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "NOT_MODIFIED", lastFetchedAt: new Date(NOW.getTime() - 3 * HOUR) });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
    expect(db.crawlConsent.findMany).not.toHaveBeenCalled(); // the images were not re-hashed
  });

  it("a fetched page waits inside the two-hour finding grace", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "FETCHED", lastFetchedAt: new Date(NOW.getTime() - HOUR) });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(db.linkVerification.updateMany).not.toHaveBeenCalled();
  });

  it("an unvisited page gives up as UNKNOWN only once the seven-day window has passed", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "PENDING", lastFetchedAt: null });
    await sweepDueLinkVerifications(NOW);
    expect(db.linkVerification.updateMany).not.toHaveBeenCalled(); // still waiting for a visit

    enqueuedChecks = [enqueuedCheck({ enqueuedAt: new Date(NOW.getTime() - 8 * DAY) })];
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
  });

  it("a dead page resolves UNKNOWN: five failed visits prove nothing", async () => {
    db.crawlPage.findUnique.mockResolvedValue({ status: "DEAD", lastFetchedAt: new Date(NOW.getTime() - 3 * HOUR) });
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
  });

  it("a missing page row resolves UNKNOWN: the frontier row left with the retention", async () => {
    db.crawlPage.findUnique.mockResolvedValue(null);
    expect(await sweepDueLinkVerifications(NOW)).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "UNKNOWN", checkedAt: NOW },
    });
  });

  it("a finding since the check was queued resolves STILL_ONLINE end to end", async () => {
    db.crawlFinding.findMany.mockResolvedValue([{ pageUrlEncrypted: encryptField(PAGE) }]);
    db.case.findUnique.mockResolvedValue({
      referenceNumber: "ASMITA-2026-000123",
      user: { emailEncrypted: encryptField("survivor@example.com"), preferredLocale: "hi" },
    });

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 1 });
    expect(db.crawlFinding.findMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", lastSeenAt: { gte: QUEUED_AT } },
      select: { pageUrlEncrypted: true },
    });
    expect(db.crawlPage.findUnique).not.toHaveBeenCalled(); // the finding decides before the page row
    expect(db.linkVerification.updateMany).toHaveBeenCalledTimes(1);
    expect(db.linkVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "chk-1", outcome: "PENDING" },
      data: { outcome: "STILL_ONLINE", checkedAt: NOW },
    });
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith({
      where: { id: "url-1", status: "REMOVED" },
      data: { status: "NOTICE_SENT" },
    });
    expect(db.linkVerification.deleteMany).toHaveBeenCalledWith({
      where: { submittedUrlId: { in: ["url-1"] }, outcome: "PENDING" },
    });
    expect(db.case.findUnique).toHaveBeenCalledWith({
      where: { id: "case-1" },
      select: { referenceNumber: true, user: { select: { emailEncrypted: true, preferredLocale: true } } },
    });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CONTENT_STILL_ONLINE",
      entityType: "SubmittedUrl",
      entityId: "url-1",
      data: { caseId: "case-1", attempt: 1, verificationId: "chk-1" },
    });
    // The email carries her reference and a sign-in prompt, never an address.
    expect(sendLinkStillOnlineNotification).toHaveBeenCalledTimes(1);
    expect(sendLinkStillOnlineNotification).toHaveBeenCalledWith(
      "survivor@example.com",
      "ASMITA-2026-000123",
      "https://app.example.test/case/case-1",
      "hi",
      "verify-still:chk-1",
    );
    expect(JSON.stringify(vi.mocked(sendLinkStillOnlineNotification).mock.calls)).not.toContain("forum.example.com");
  });

  it("keeps the STILL_ONLINE outcome but writes no audit or email when the link had already moved on", async () => {
    db.crawlFinding.findMany.mockResolvedValue([{ pageUrlEncrypted: encryptField(PAGE) }]);
    db.submittedUrl.updateMany.mockResolvedValue({ count: 0 }); // another sweep flipped it first

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 1 });
    expect(db.linkVerification.deleteMany).toHaveBeenCalled(); // the remaining attempts are still dropped
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(sendLinkStillOnlineNotification).not.toHaveBeenCalled();
  });
});
