import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP24 (watch-and-verify spec) on the Prisma (Node) path, against a mocked
// client in the style of the other Prisma tests. What the spec makes the
// real test: starting the 12-month re-upload window is one conditional
// update on the consent — first start wins, so a lost race updates nothing
// and audits nothing, and a missing authorisation nothing at all; the
// hourly sweep starts the window with a bounded candidates read and one
// case-status read — a resolved case starts it, an open case only when
// every non-rejected link is verified removed (three GONE re-checks,
// counts only, and a rejected link never was about a takedown); the pool
// keeps her fingerprints while the case is open or the window runs and
// drops them outside it, so the pool id of a dropped fingerprint resolves
// to nothing; an approved finding inside the window emails her reference
// and a sign-in prompt only. Nothing here reads an address: the window is
// a bare date on the consent, the audit entry carries the consent id and
// the window's end, and the only e-mail address in the fixture is the
// survivor's own. Placeholder ids throughout, like the other crawler tests.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    crawlConsent: { findFirst: fn(), findMany: fn(), updateMany: fn() },
    case: { findMany: fn(), findUnique: fn() },
    submittedUrl: { findMany: fn() },
    linkVerification: { findMany: fn() },
    hashSubmission: { findMany: fn(), findUnique: fn() },
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(), writeAuditLogs: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendReuploadFoundNotification: vi.fn() }));

import { encryptField } from "@/lib/encryption";
import {
  REUPLOAD_WATCH_MONTHS,
  REUPLOAD_WATCH_SWEEP_BATCH,
  VERIFIED_REMOVED_GONE_COUNT,
  notifyReuploadFinding,
  reuploadWatchActive,
  startReuploadWatch,
  sweepReuploadWatches,
} from "@/lib/crawl-watch";
import { buildCrawlPool, caseHasPoolFingerprints, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { writeAuditLog } from "@/lib/audit";
import { sendReuploadFoundNotification } from "@/lib/email";

const NOW = new Date("2026-11-19T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

// The window the sweep starts, computed exactly as the module computes it
// so the assertion holds in whatever timezone the runner lives in.
const WATCH_UNTIL = new Date(NOW.getTime());
WATCH_UNTIL.setMonth(WATCH_UNTIL.getMonth() + REUPLOAD_WATCH_MONTHS);

// A window still running six months on, and one that ended yesterday.
const RUNNING_WATCH = new Date(NOW.getTime());
RUNNING_WATCH.setMonth(RUNNING_WATCH.getMonth() + 6);
const EXPIRED_WATCH = new Date(NOW.getTime() - DAY);

function consentRow(overrides: Record<string, unknown> = {}) {
  return { id: "consent-1", caseId: "case-1", hashSubmissionIds: ["hash-1"], withdrawnAt: null, watchUntil: null, ...overrides };
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return { id: "case-1", status: "RESOLVED", ...overrides };
}

/** One of her links as the sweep reads it: an id and a status, never an address. */
function linkRow(overrides: Record<string, unknown> = {}) {
  return { id: "url-1", status: "REMOVED", ...overrides };
}

/** count GONE re-checks of the seeded link (WP23): counts only, never an address. */
function goneRows(count: number) {
  return Array.from({ length: count }, () => ({ submittedUrlId: "url-1" }));
}

/** One approved fingerprint carrying its random pool id. */
function hashRow(overrides: Record<string, unknown> = {}) {
  return { id: "hash-1", caseId: "case-1", crawlPoolId: "fp_1", hashEncrypted: encryptField("a".repeat(64)), quality: 90, status: "APPROVED", ...overrides };
}

/** Seeds the pool's reads for one case with one live authorisation. */
function seedPool(status: string, watchUntil: Date | null) {
  db.crawlConsent.findMany.mockResolvedValue([consentRow({ watchUntil })]);
  db.case.findMany.mockResolvedValue([caseRow({ status })]);
  db.hashSubmission.findMany.mockResolvedValue([hashRow()]);
  db.hashSubmission.findUnique.mockResolvedValue(hashRow());
}

/**
 * The notify step's contact read shares the case.findUnique mock with the
 * status read the watch check makes; the two dispatch on the select shape.
 */
function seedContactCase(overrides: { status?: string; locale?: string | null } = {}) {
  const status = overrides.status ?? "RESOLVED";
  const record = {
    referenceNumber: "ASMITA-2026-00042",
    user: { emailEncrypted: encryptField("survivor@example.invalid"), preferredLocale: overrides.locale ?? null },
  };
  db.case.findUnique.mockImplementation(async (args: { select?: { status?: unknown } }) =>
    args?.select?.status ? { status } : record);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test"); // the memory path stays off
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  vi.resetAllMocks();
  db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1" });
  db.crawlConsent.findMany.mockResolvedValue([]);
  db.crawlConsent.updateMany.mockResolvedValue({ count: 1 });
  db.case.findMany.mockResolvedValue([]);
  db.case.findUnique.mockResolvedValue({ status: "RESOLVED" });
  db.submittedUrl.findMany.mockResolvedValue([]);
  db.linkVerification.findMany.mockResolvedValue([]);
  db.hashSubmission.findMany.mockResolvedValue([]);
  db.hashSubmission.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("startReuploadWatch, Prisma path", () => {
  it("starts the 12-month window with one conditional update and one audit entry", async () => {
    expect(REUPLOAD_WATCH_MONTHS).toBe(12);
    expect(Math.round((WATCH_UNTIL.getTime() - NOW.getTime()) / DAY)).toBe(365); // twelve months from the trigger

    await expect(startReuploadWatch("case-1", NOW)).resolves.toBe(true);

    expect(db.crawlConsent.findFirst).toHaveBeenCalledTimes(1);
    expect(db.crawlConsent.findFirst).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null, watchUntil: null },
      select: { id: true },
    });
    expect(db.crawlConsent.updateMany).toHaveBeenCalledTimes(1);
    expect(db.crawlConsent.updateMany).toHaveBeenCalledWith({
      where: { id: "consent-1", withdrawnAt: null, watchUntil: null },
      data: { watchUntil: WATCH_UNTIL },
    });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
  });

  it("starts nothing without a live authorisation", async () => {
    db.crawlConsent.findFirst.mockResolvedValue(null);

    await expect(startReuploadWatch("case-1", NOW)).resolves.toBe(false);

    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("loses the race: the conditional update answers zero rows and nothing is audited", async () => {
    db.crawlConsent.updateMany.mockResolvedValue({ count: 0 }); // another sweep set the window first

    await expect(startReuploadWatch("case-1", NOW)).resolves.toBe(false);

    expect(db.crawlConsent.updateMany).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("sweepReuploadWatches, Prisma path", () => {
  it("starts the window on a resolved case with one candidates read, one status read and one conditional update", async () => {
    db.crawlConsent.findMany.mockResolvedValue([{ caseId: "case-1" }]);
    db.case.findUnique.mockResolvedValue({ status: "RESOLVED" });

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });

    expect(REUPLOAD_WATCH_SWEEP_BATCH).toBe(200);
    expect(db.crawlConsent.findMany).toHaveBeenCalledTimes(1);
    expect(db.crawlConsent.findMany).toHaveBeenCalledWith({
      where: { withdrawnAt: null, watchUntil: null },
      select: { caseId: true },
      take: REUPLOAD_WATCH_SWEEP_BATCH,
    });
    expect(db.case.findUnique).toHaveBeenCalledWith({ where: { id: "case-1" }, select: { status: true } });
    expect(db.crawlConsent.findFirst).toHaveBeenCalledTimes(1);
    expect(db.crawlConsent.updateMany).toHaveBeenCalledTimes(1);
    expect(db.crawlConsent.updateMany).toHaveBeenCalledWith({
      where: { id: "consent-1", withdrawnAt: null, watchUntil: null },
      data: { watchUntil: WATCH_UNTIL },
    });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
    // A resolved case decides on its status alone: her links are never read.
    expect(db.submittedUrl.findMany).not.toHaveBeenCalled();
    expect(db.linkVerification.findMany).not.toHaveBeenCalled();
  });

  it("starts nothing on an open case with no link, and nothing when the case row is gone", async () => {
    db.crawlConsent.findMany.mockResolvedValue([{ caseId: "case-1" }]);
    db.case.findUnique.mockResolvedValue({ status: "OPEN" });
    db.submittedUrl.findMany.mockResolvedValue([]);

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });

    // Her links decide, and only their ids and statuses are read: a
    // rejected link was never about a takedown, so the query excludes it.
    expect(db.submittedUrl.findMany).toHaveBeenCalledTimes(1);
    expect(db.submittedUrl.findMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", status: { not: "REJECTED" } },
      select: { id: true, status: true },
    });
    expect(db.linkVerification.findMany).not.toHaveBeenCalled(); // no link to re-check
    expect(db.crawlConsent.findFirst).not.toHaveBeenCalled();
    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();

    // The case row is gone; its consent soon will be.
    db.case.findUnique.mockResolvedValue(null);
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(db.submittedUrl.findMany).toHaveBeenCalledTimes(1); // the second pass never reached the links
    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();
  });

  it("starts the watch on an open case whose every link is verified removed", async () => {
    db.crawlConsent.findMany.mockResolvedValue([{ caseId: "case-1" }]);
    db.case.findUnique.mockResolvedValue({ status: "OPEN" });
    db.submittedUrl.findMany.mockResolvedValue([linkRow()]);
    db.linkVerification.findMany.mockResolvedValue(goneRows(VERIFIED_REMOVED_GONE_COUNT));

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });

    expect(VERIFIED_REMOVED_GONE_COUNT).toBe(3);
    expect(db.submittedUrl.findMany).toHaveBeenCalledWith({
      where: { caseId: "case-1", status: { not: "REJECTED" } },
      select: { id: true, status: true },
    });
    // The re-checks are counted per link; no address is ever read.
    expect(db.linkVerification.findMany).toHaveBeenCalledWith({
      where: { submittedUrlId: { in: ["url-1"] }, outcome: "GONE" },
      select: { submittedUrlId: true },
    });
    expect(db.crawlConsent.updateMany).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("starts nothing on two GONE re-checks, a link back in the notice flow, or a rejected row", async () => {
    db.crawlConsent.findMany.mockResolvedValue([{ caseId: "case-1" }]);
    db.case.findUnique.mockResolvedValue({ status: "OPEN" });
    db.submittedUrl.findMany.mockResolvedValue([linkRow()]);

    // Two GONE re-checks are one short of verified removed.
    db.linkVerification.findMany.mockResolvedValue(goneRows(2));
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();

    // Every re-check GONE, but the link is back in the notice flow.
    db.linkVerification.findMany.mockResolvedValue(goneRows(VERIFIED_REMOVED_GONE_COUNT));
    db.submittedUrl.findMany.mockResolvedValue([linkRow({ status: "NOTICE_SENT" })]);
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();

    // Even a row that leaked past the where clause cannot count: a
    // rejected link never was about a takedown.
    db.submittedUrl.findMany.mockResolvedValue([linkRow({ status: "REJECTED" })]);
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(db.crawlConsent.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("the pool rule, Prisma path", () => {
  it("keeps her fingerprint while the case is open, reading watchUntil and the case statuses by id", async () => {
    seedPool("OPEN", null);

    const pool = await buildCrawlPool(NOW);
    expect(pool.fingerprints).toHaveLength(1);
    expect(pool.fingerprints[0]).toEqual({ id: "fp_1", pdq: "a".repeat(64), quality: 90 });
    expect(pool.generatedAt).toBe(NOW.toISOString());
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(true);

    // The pool reads the window on the consent and the statuses of the
    // covered cases by id.
    expect(db.crawlConsent.findMany).toHaveBeenCalledWith({
      where: { withdrawnAt: null },
      select: { id: true, caseId: true, hashSubmissionIds: true, watchUntil: true },
    });
    expect(db.case.findMany).toHaveBeenCalledWith({ where: { id: { in: ["case-1"] } }, select: { id: true, status: true } });
    expect(db.hashSubmission.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["hash-1"] } },
      select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true, algorithm: true, videoFramesEncrypted: true },
    });

    // PARTIALLY_RESOLVED is still open.
    db.case.findMany.mockResolvedValue([caseRow({ status: "PARTIALLY_RESOLVED" })]);
    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
  });

  it("keeps her fingerprint on a resolved case inside its window", async () => {
    seedPool("RESOLVED", RUNNING_WATCH);

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(true);
  });

  it("drops her fingerprint when the window has ended, and the pool id resolves to nothing", async () => {
    seedPool("RESOLVED", EXPIRED_WATCH);

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(0);
    // The drop happens in the coverage rule, so the fingerprints are never read.
    expect(db.hashSubmission.findMany).not.toHaveBeenCalled();
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(false);

    // resolvePoolFingerprint checks the window against the real clock, and
    // the fixture's window ended before it: the id an old crawl still holds
    // matches nothing.
    await expect(resolvePoolFingerprint("fp_1")).resolves.toEqual(null);
    expect(db.hashSubmission.findUnique).toHaveBeenCalledWith({
      where: { crawlPoolId: "fp_1" },
      select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true, algorithm: true, videoFramesEncrypted: true },
    });
    // The resolution's coverage read is bounded to the fingerprint's case.
    expect(db.crawlConsent.findMany).toHaveBeenLastCalledWith({
      where: { withdrawnAt: null, caseId: { in: ["case-1"] } },
      select: { id: true, caseId: true, hashSubmissionIds: true, watchUntil: true },
    });
    expect(db.hashSubmission.findMany).not.toHaveBeenCalled();
  });

  it("drops her fingerprint when a resolved case has no window", async () => {
    seedPool("RESOLVED", null);

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(0);
    expect(db.hashSubmission.findMany).not.toHaveBeenCalled();
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(false);
  });
});

describe("reuploadWatchActive, Prisma path", () => {
  it("is active only on a case no longer open inside its running window", async () => {
    db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1", watchUntil: RUNNING_WATCH });

    expect(await reuploadWatchActive("case-1", NOW)).toBe(true);
    expect(db.crawlConsent.findFirst).toHaveBeenCalledWith({
      where: { caseId: "case-1", withdrawnAt: null },
      select: { id: true, watchUntil: true },
    });
    expect(db.case.findUnique).toHaveBeenCalledWith({ where: { id: "case-1" }, select: { status: true } });

    // An open case never alerts, whatever the window.
    db.case.findUnique.mockResolvedValue({ status: "OPEN" });
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);

    // An expired window answers before the case is even read.
    db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1", watchUntil: EXPIRED_WATCH });
    db.case.findUnique.mockClear();
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);
    expect(db.case.findUnique).not.toHaveBeenCalled();

    // No live authorisation: nothing to alert on.
    db.crawlConsent.findFirst.mockResolvedValue(null);
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);
    expect(db.case.findUnique).not.toHaveBeenCalled();
  });
});

describe("notifyReuploadFinding, Prisma path", () => {
  it("emails her reference and a sign-in prompt only, in her locale, under an idempotency key", async () => {
    db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1", watchUntil: RUNNING_WATCH });
    seedContactCase();

    await notifyReuploadFinding("case-1", "finding-1", NOW);

    // The status read that made the watch active, then the contact read.
    expect(db.case.findUnique).toHaveBeenCalledTimes(2);
    expect(db.case.findUnique).toHaveBeenCalledWith({
      where: { id: "case-1" },
      select: { referenceNumber: true, user: { select: { emailEncrypted: true, preferredLocale: true } } },
    });
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(1);
    expect(sendReuploadFoundNotification).toHaveBeenCalledWith(
      "survivor@example.invalid",
      "ASMITA-2026-00042",
      "https://app.example.test/case/case-1",
      "en",
      "reupload-found:finding-1",
    );

    // Her preferred locale picks the Hindi copy.
    seedContactCase({ locale: "hi" });
    await notifyReuploadFinding("case-1", "finding-2", NOW);
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(2);
    expect(sendReuploadFoundNotification).toHaveBeenLastCalledWith(
      "survivor@example.invalid",
      "ASMITA-2026-00042",
      "https://app.example.test/case/case-1",
      "hi",
      "reupload-found:finding-2",
    );
  });

  it("does nothing when the watch is not active: no email and no contact query", async () => {
    db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1", watchUntil: EXPIRED_WATCH });

    await notifyReuploadFinding("case-1", "finding-1", NOW);

    expect(sendReuploadFoundNotification).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
    // The window answers before the case is read at all.
    expect(db.case.findUnique).not.toHaveBeenCalled();
  });
});

describe("privacy, Prisma path", () => {
  it("carries no address in any query, audit entry or email beyond the one contact lookup", async () => {
    // The full flow: the sweep starts the window on a resolved case, the
    // pool still matches her fingerprint inside it, the watch is active and
    // an approved finding emails her reference only. The candidates read
    // (take) and the pool's coverage read share the findMany mock.
    db.crawlConsent.findMany.mockImplementation(async (args: { take?: number }) =>
      args?.take ? [{ caseId: "case-1" }] : [consentRow({ watchUntil: WATCH_UNTIL })]);
    db.crawlConsent.findFirst.mockResolvedValue({ id: "consent-1", watchUntil: WATCH_UNTIL });
    db.case.findMany.mockResolvedValue([caseRow({ status: "RESOLVED" })]);
    db.hashSubmission.findMany.mockResolvedValue([hashRow()]);

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });
    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
    expect(await reuploadWatchActive("case-1", NOW)).toBe(true);
    seedContactCase();
    await notifyReuploadFinding("case-1", "finding-1", NOW);
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(1);

    // Every query works from ids, statuses and counts: no address column
    // of a link is ever selected, no URL crosses a query, and the
    // reference number lives only in the email.
    const queries = JSON.stringify([
      ...db.crawlConsent.findFirst.mock.calls,
      ...db.crawlConsent.findMany.mock.calls,
      ...db.crawlConsent.updateMany.mock.calls,
      ...db.case.findMany.mock.calls,
      ...db.case.findUnique.mock.calls,
      ...db.submittedUrl.findMany.mock.calls,
      ...db.linkVerification.findMany.mock.calls,
      ...db.hashSubmission.findMany.mock.calls,
      ...db.hashSubmission.findUnique.mock.calls,
    ]);
    expect(queries).not.toContain("urlEncrypted");
    expect(queries).not.toContain("urlHash");
    expect(queries).not.toContain("https://");
    expect(queries).not.toContain("ASMITA-");
    expect(queries).not.toContain("survivor@example.invalid");
    // The notification's single contact lookup is the only address read.
    expect((queries.match(/emailEncrypted/g) ?? []).length).toBe(1);

    // The audit entry carries the consent id and the window's end only.
    const audits = vi.mocked(writeAuditLog).mock.calls;
    expect(audits).toHaveLength(1);
    expect(audits[0]![0]).toEqual({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
    expect(JSON.stringify(audits)).not.toContain("survivor@example.invalid");

    // The email carries her own address, the reference, the dashboard
    // link, her locale and the idempotency key — nothing else.
    expect(sendReuploadFoundNotification).toHaveBeenCalledWith(
      "survivor@example.invalid",
      "ASMITA-2026-00042",
      "https://app.example.test/case/case-1",
      "en",
      "reupload-found:finding-1",
    );
  });
});
