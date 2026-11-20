import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP24 (watch-and-verify spec) on the Kysely (Worker) path, against a
// recording fake in the style of the other crawler tests. What the spec
// makes the real test: the hourly sweep starts the 12-month re-upload
// window with a bounded candidates select, one case-status read and one
// conditional update on the consent — first start wins, so a sweep that
// loses the race updates nothing and audits nothing; a resolved case
// starts the window, an open case only when every link is verified
// removed (three GONE re-checks, and a rejected link never was about a
// takedown); the pool keeps her fingerprints while the case is open or
// the window runs and drops them outside it, so the pool id of a dropped
// fingerprint resolves to nothing; an approved finding inside the window
// emails her reference and a sign-in prompt only. Nothing here reads an
// address: the window is a bare date on the consent, the audit entry
// carries the consent id and the window's end, and the only e-mail
// address in the fixture is the survivor's own. Placeholder ids
// throughout, like the other crawler tests.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
  };

  const plain = (col: string) => (col.includes(".") ? col.split(".")[1]! : col);

  // The fake understands the where forms this module uses ("=", "in", "is"
  // null and comparisons on dates) and applies them, so a seeded row only
  // surfaces through the query that should see it.
  function matches(row: Record<string, unknown>, wheres: unknown[]): boolean {
    return wheres.every((raw) => {
      if (!Array.isArray(raw) || typeof raw[0] !== "string") return true; // a form the fake does not model
      const [col, op, value] = raw as [string, string, unknown];
      const cell = row[plain(col)];
      switch (op) {
        case "=":
          return cell instanceof Date || value instanceof Date
            ? cell instanceof Date && value instanceof Date && cell.getTime() === value.getTime()
            : cell === value;
        case "!=":
          return cell !== value;
        case "in":
          return Array.isArray(value) && value.some((item) => (item instanceof Date && cell instanceof Date ? item.getTime() === cell.getTime() : item === cell));
        case "is":
          return (cell ?? null) === (value ?? null);
        case "is not":
          return (cell ?? null) !== (value ?? null);
        case "<=":
          return cell instanceof Date && value instanceof Date ? cell.getTime() <= value.getTime() : Number(cell) <= Number(value);
        case ">=":
          return cell instanceof Date && value instanceof Date ? cell.getTime() >= value.getTime() : Number(cell) >= Number(value);
        case "<":
          return cell instanceof Date && value instanceof Date ? cell.getTime() < value.getTime() : Number(cell) < Number(value);
        case ">":
          return cell instanceof Date && value instanceof Date ? cell.getTime() > value.getTime() : Number(cell) > Number(value);
        default:
          return true;
      }
    });
  }

  function rowsFor(op: string, table: string, detail: Record<string, unknown>): Array<Record<string, unknown>> {
    if (op === "insert") {
      // The fake does not persist inserts (like the other crawler tests);
      // an insert answers with the rows it was handed.
      const all = Array.isArray(detail.values) ? detail.values : [detail.values];
      return (all as Array<Record<string, unknown>>).map((row) => ({ ...row }));
    }
    let rows = (state.rows[table] ?? []).filter((row) => matches(row, (detail.wheres as unknown[]) ?? []));
    const order = detail.orderBy as [string, string | undefined] | undefined;
    if (order) {
      rows = [...rows].sort((a, b) => {
        const left = a[plain(order[0])];
        const right = b[plain(order[0])];
        const cmp = left instanceof Date && right instanceof Date
          ? left.getTime() - right.getTime()
          : String(left).localeCompare(String(right));
        return order[1] === "desc" ? -cmp : cmp;
      });
    }
    if (detail.limit !== undefined) rows = rows.slice(0, detail.limit as number);
    return rows.map((row) => ({ ...row }));
  }

  function builder(op: string, table: string, detail: Record<string, unknown>) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "execute" || prop === "executeTakeFirst" || prop === "executeTakeFirstOrThrow") {
            return async () => {
              const takeFirst = prop !== "execute";
              let rows: Array<Record<string, unknown>>;
              if (op === "update") rows = [{ numUpdatedRows: rowsFor(op, table, detail).length }]; // the module reads Number(...)
              else if (op === "delete") rows = [{ numDeletedRows: rowsFor(op, table, detail).length }];
              else rows = rowsFor(op, table, detail);
              return takeFirst ? rows[0] : rows;
            };
          }
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
            else if (prop === "returning") detail.returning = args[0];
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
            else if (prop === "limit") detail.limit = args[0];
            else if (prop === "orderBy") detail.orderBy = args;
            else if (prop === "forUpdate") detail.forUpdate = true;
            else if (prop === "skipLocked") detail.skipLocked = true;
            else if (prop === "onConflict") {
              // Unlike the other fakes this one runs the conflict callback,
              // because the priority row's DO UPDATE SET reset is part of
              // what is being asserted.
              const conflict: Record<string, unknown> = { columns: null, action: null, set: null };
              detail.onConflict = conflict;
              const act = (action: string) => (set?: Record<string, unknown>) => {
                conflict.action = action;
                if (set !== undefined) conflict.set = set;
              };
              const target = { doNothing: act("doNothing"), doUpdateSet: act("doUpdateSet") };
              (args[0] as (oc: unknown) => unknown)({
                column: (name: string) => {
                  conflict.columns = [name];
                  return target;
                },
                columns: (names: string[]) => {
                  conflict.columns = names;
                  return target;
                },
              });
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  function record(op: string, name: string) {
    const table = name.split(" ")[0];
    const detail: Record<string, unknown> = {};
    state.calls.push({ op, table, detail });
    return builder(op, table, detail);
  }

  const db = {
    selectFrom: (name: string) => record("select", name),
    insertInto: (name: string) => record("insert", name),
    updateTable: (name: string) => record("update", name),
    deleteFrom: (name: string) => record("delete", name),
    transaction: () => ({ execute: async (run: (tx: unknown) => Promise<unknown>) => run(db) }),
  };
  return { db, state };
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => true, getWorkerDb: () => kysely.db }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));
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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The window the sweep starts, computed exactly as the module computes it
// so the assertion holds in whatever timezone the runner lives in.
const WATCH_UNTIL = new Date(NOW.getTime());
WATCH_UNTIL.setMonth(WATCH_UNTIL.getMonth() + REUPLOAD_WATCH_MONTHS);

// A window still running six months on, and one that ended yesterday.
const RUNNING_WATCH = new Date(NOW.getTime());
RUNNING_WATCH.setMonth(RUNNING_WATCH.getMonth() + 6);
const EXPIRED_WATCH = new Date(NOW.getTime() - DAY);

function consentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "consent-1",
    caseId: "case-1",
    hashSubmissionIds: ["hash-1"],
    signedAt: new Date(NOW.getTime() - 30 * DAY),
    withdrawnAt: null,
    watchUntil: null,
    ...overrides,
  };
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    status: "RESOLVED",
    referenceNumber: "ASMITA-2026-000123",
    emailEncrypted: null,
    preferredLocale: null,
    ...overrides,
  };
}

/** One of her reported links; no address column is ever needed here. */
function urlRow(overrides: Record<string, unknown> = {}) {
  return { id: "url-1", caseId: "case-1", status: "REMOVED", ...overrides };
}

/** One GONE re-check of a link (WP23). */
function goneRow(overrides: Record<string, unknown> = {}) {
  return { id: "chk-1", submittedUrlId: "url-1", outcome: "GONE", ...overrides };
}

/** One approved fingerprint carrying its random pool id. */
function hashRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "hash-1",
    caseId: "case-1",
    crawlPoolId: "fp_1",
    hashEncrypted: encryptField("a".repeat(64)),
    quality: 90,
    status: "APPROVED",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  kysely.state.rows = {
    CrawlConsent: [],
    Case: [],
    SubmittedUrl: [],
    LinkVerification: [],
    HashSubmission: [],
  };
  kysely.state.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);
const ops = () => kysely.state.calls.map((call) => `${call.op} ${call.table}`);

describe("startReuploadWatch, Kysely path", () => {
  it("starts the 12-month window with one conditional update and one audit entry", async () => {
    expect(REUPLOAD_WATCH_MONTHS).toBe(12);
    expect(Math.round((WATCH_UNTIL.getTime() - NOW.getTime()) / DAY)).toBe(365); // twelve months from the trigger
    kysely.state.rows.CrawlConsent = [consentRow()];

    await expect(startReuploadWatch("case-1", NOW)).resolves.toBe(true);

    expect(ops()).toEqual(["select CrawlConsent", "update CrawlConsent"]);
    const pick = callsOn("CrawlConsent")[0]!;
    expect(pick.detail.select).toEqual(["id"]);
    expect(pick.detail.wheres).toEqual([["caseId", "=", "case-1"], ["withdrawnAt", "is", null], ["watchUntil", "is", null]]);
    const update = callsOn("CrawlConsent").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ watchUntil: WATCH_UNTIL });
    expect(update.detail.wheres).toEqual([["id", "=", "consent-1"], ["withdrawnAt", "is", null], ["watchUntil", "is", null]]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
  });

  it("loses the race when another sweep set the window first: the conditional update answers zero rows and nothing is audited", async () => {
    kysely.state.rows.CrawlConsent = [consentRow()];

    // The consent select runs synchronously inside the call; the conditional
    // update re-reads the table only in a later microtask, so flipping the
    // row here is exactly the race the conditional update answers: zero
    // rows updated, no audit, no window moved.
    const pending = startReuploadWatch("case-1", NOW);
    kysely.state.rows.CrawlConsent[0]!.watchUntil = WATCH_UNTIL;
    await expect(pending).resolves.toBe(false);

    expect(ops()).toEqual(["select CrawlConsent", "update CrawlConsent"]);
    const update = callsOn("CrawlConsent").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ watchUntil: WATCH_UNTIL });
    expect(writeAuditLog).not.toHaveBeenCalled();

    // The same race through the sweep: the candidate was already collected,
    // the conditional update is never reached, and started stays 0.
    kysely.state.calls.length = 0;
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];
    const sweeping = sweepReuploadWatches(NOW);
    kysely.state.rows.CrawlConsent[0]!.watchUntil = WATCH_UNTIL;
    expect(await sweeping).toEqual({ started: 0 });
    expect(ops()).toEqual(["select CrawlConsent", "select Case", "select CrawlConsent"]);
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("sweepReuploadWatches, Kysely path", () => {
  it("starts the window on a resolved case with the candidates, status and consent reads and one conditional update", async () => {
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });

    expect(ops()).toEqual([
      "select CrawlConsent", // live authorisations with no window yet
      "select Case", // the case's status
      "select CrawlConsent", // the consent to watch
      "update CrawlConsent", // the window, conditional on none existing
    ]);
    const candidates = callsOn("CrawlConsent")[0]!;
    expect(candidates.detail.select).toEqual(["caseId"]);
    expect(candidates.detail.wheres).toEqual([["withdrawnAt", "is", null], ["watchUntil", "is", null]]);
    expect(REUPLOAD_WATCH_SWEEP_BATCH).toBe(200);
    expect(candidates.detail.limit).toBe(REUPLOAD_WATCH_SWEEP_BATCH);
    const status = callsOn("Case")[0]!;
    expect(status.detail.select).toEqual(["status"]);
    expect(status.detail.wheres).toEqual([["id", "=", "case-1"]]);
    const pick = callsOn("CrawlConsent")[1]!;
    expect(pick.detail.select).toEqual(["id"]);
    expect(pick.detail.wheres).toEqual([["caseId", "=", "case-1"], ["withdrawnAt", "is", null], ["watchUntil", "is", null]]);
    const update = callsOn("CrawlConsent").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ watchUntil: WATCH_UNTIL });
    expect(update.detail.wheres).toEqual([["id", "=", "consent-1"], ["withdrawnAt", "is", null], ["watchUntil", "is", null]]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
  });

  it("is idempotent: an already-watched consent is no candidate, so nothing moves and nothing is audited", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: WATCH_UNTIL })];

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(ops()).toEqual(["select CrawlConsent"]);
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("starts nothing on an open case, and nothing when the case row is gone", async () => {
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })];

    // An open case falls through to the verified-removed test, which finds
    // no link at all here; the update is never issued.
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(ops()).toEqual(["select CrawlConsent", "select Case", "select SubmittedUrl"]);
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();

    // The case row is gone; its consent soon will be.
    kysely.state.calls.length = 0;
    kysely.state.rows.Case = [];
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(ops()).toEqual(["select CrawlConsent", "select Case"]);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("the all-links-verified-removed trigger, Kysely path", () => {
  it("starts the watch on an open case whose every link is verified removed, excluding rejected links", async () => {
    expect(VERIFIED_REMOVED_GONE_COUNT).toBe(3);
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })];
    kysely.state.rows.SubmittedUrl = [urlRow(), urlRow({ id: "url-2", status: "REJECTED" })];
    kysely.state.rows.LinkVerification = Array.from({ length: VERIFIED_REMOVED_GONE_COUNT }, (_, i) => goneRow({ id: `chk-${i + 1}` }));

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });

    expect(ops()).toEqual([
      "select CrawlConsent", // the candidates
      "select Case", // OPEN: not resolved, so the links decide
      "select SubmittedUrl", // her links, without the rejected one
      "select LinkVerification", // the GONE re-checks, counts only
      "select CrawlConsent", // the consent to watch
      "update CrawlConsent", // the window
    ]);
    const links = callsOn("SubmittedUrl")[0]!;
    expect(links.detail.select).toEqual(["id", "status"]);
    expect(links.detail.wheres).toEqual([["caseId", "=", "case-1"], ["status", "!=", "REJECTED"]]);
    const gone = callsOn("LinkVerification")[0]!;
    expect(gone.detail.select).toEqual(["submittedUrlId"]);
    expect(gone.detail.wheres).toEqual([["submittedUrlId", "in", ["url-1"]], ["outcome", "=", "GONE"]]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("does not start on two GONE re-checks, a link back in the notice flow, or a case with no link", async () => {
    // Two GONE re-checks are one short of verified removed.
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })];
    kysely.state.rows.SubmittedUrl = [urlRow()];
    kysely.state.rows.LinkVerification = [goneRow({ id: "chk-1" }), goneRow({ id: "chk-2" })];
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();

    // Every re-check GONE, but the link is back in the notice flow.
    kysely.state.calls.length = 0;
    kysely.state.rows.SubmittedUrl = [urlRow({ status: "NOTICE_SENT" })];
    kysely.state.rows.LinkVerification = [goneRow({ id: "chk-1" }), goneRow({ id: "chk-2" }), goneRow({ id: "chk-3" })];
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();

    // A case with no link at all: nothing whose removal was verified.
    kysely.state.calls.length = 0;
    kysely.state.rows.SubmittedUrl = [];
    kysely.state.rows.LinkVerification = [];
    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 0 });
    expect(ops()).toEqual(["select CrawlConsent", "select Case", "select SubmittedUrl"]);
    expect(callsOn("CrawlConsent").filter((call) => call.op === "update")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("the pool rule, Kysely path", () => {
  it("keeps the fingerprint of an open case whatever the window, reading watchUntil and the case statuses by id", async () => {
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })];
    kysely.state.rows.HashSubmission = [hashRow()];

    const pool = await buildCrawlPool(NOW);
    expect(pool.fingerprints).toHaveLength(1);
    expect(pool.fingerprints[0]).toEqual({ id: "fp_1", pdq: "a".repeat(64), quality: 90 });

    // The pool reads the window on the consent and the statuses of the
    // covered cases by id.
    expect(ops()).toEqual(["select CrawlConsent", "select Case", "select HashSubmission"]);
    const consents = callsOn("CrawlConsent")[0]!;
    expect(consents.detail.select).toEqual(["id", "caseId", "hashSubmissionIds", "watchUntil"]);
    expect(consents.detail.wheres).toEqual([["withdrawnAt", "is", null]]);
    const cases = callsOn("Case")[0]!;
    expect(cases.detail.select).toEqual(["id", "status"]);
    expect(cases.detail.wheres).toEqual([["id", "in", ["case-1"]]]);
    const prints = callsOn("HashSubmission")[0]!;
    expect(prints.detail.select).toEqual(["id", "caseId", "crawlPoolId", "hashEncrypted", "quality", "status", "algorithm", "videoFramesEncrypted"]);
    expect(prints.detail.wheres).toEqual([["id", "in", ["hash-1"]]]);

    // PARTIALLY_RESOLVED is still open.
    kysely.state.rows.Case = [caseRow({ status: "PARTIALLY_RESOLVED" })];
    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
  });

  it("keeps the fingerprint of a resolved case inside its window, and resolves the pool id back to the consent", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: RUNNING_WATCH })];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];
    kysely.state.rows.HashSubmission = [hashRow()];

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(true);

    expect(await resolvePoolFingerprint("fp_1")).toEqual({ hashSubmissionId: "hash-1", caseId: "case-1", consentId: "consent-1" });
    // A resolution's coverage read is bounded to the fingerprint's case.
    const consentCalls = callsOn("CrawlConsent");
    expect(consentCalls[consentCalls.length - 1]!.detail.wheres).toEqual([["withdrawnAt", "is", null], ["caseId", "in", ["case-1"]]]);
  });

  it("drops the fingerprint of a resolved case outside its window, and the pool id resolves to nothing", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: EXPIRED_WATCH })];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];
    kysely.state.rows.HashSubmission = [hashRow()];

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(0);
    // The drop happens in the coverage rule, so the fingerprints are never read.
    expect(ops()).toEqual(["select CrawlConsent", "select Case"]);
    await expect(resolvePoolFingerprint("fp_1")).resolves.toEqual(null);
    await expect(caseHasPoolFingerprints("case-1", NOW)).resolves.toBe(false);

    // No window at all: the same drop.
    kysely.state.calls.length = 0;
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: null })];
    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(0);
  });
});

describe("reuploadWatchActive, Kysely path", () => {
  it("is active only on a case no longer open inside its running window", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: RUNNING_WATCH })];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];

    expect(await reuploadWatchActive("case-1", NOW)).toBe(true);
    expect(ops()).toEqual(["select CrawlConsent", "select Case"]);
    const watch = callsOn("CrawlConsent")[0]!;
    expect(watch.detail.select).toEqual(["id", "watchUntil"]);
    expect(watch.detail.wheres).toEqual([["caseId", "=", "case-1"], ["withdrawnAt", "is", null]]);

    // An open case never alerts, whatever the window.
    kysely.state.calls.length = 0;
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })];
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);

    // An expired window answers before the case is even read.
    kysely.state.calls.length = 0;
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: EXPIRED_WATCH })];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED" })];
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);
    expect(ops()).toEqual(["select CrawlConsent"]);

    // No live authorisation: nothing to alert on.
    kysely.state.calls.length = 0;
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: RUNNING_WATCH, withdrawnAt: new Date(NOW.getTime() - DAY) })];
    expect(await reuploadWatchActive("case-1", NOW)).toBe(false);
    expect(ops()).toEqual(["select CrawlConsent"]);
  });
});

describe("notifyReuploadFinding, Kysely path", () => {
  it("emails her reference and a sign-in prompt only, in her locale, under an idempotency key", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: RUNNING_WATCH })];
    kysely.state.rows.Case = [caseRow({
      status: "RESOLVED",
      emailEncrypted: encryptField("survivor@example.com"),
      preferredLocale: null,
    })];

    await notifyReuploadFinding("case-1", "finding-1", NOW);

    expect(ops()).toEqual(["select CrawlConsent", "select Case", "select Case"]);
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(1);
    expect(sendReuploadFoundNotification).toHaveBeenCalledWith(
      "survivor@example.com",
      "ASMITA-2026-000123",
      "https://app.example.test/case/case-1",
      "en",
      "reupload-found:finding-1",
    );
    // The contact read joins the case to its user; the fake answers from the
    // first table, so the seeded row carries the user's columns directly.
    const contact = callsOn("Case")[1]!;
    expect(contact.detail.select).toEqual(["c.referenceNumber", "usr.emailEncrypted", "usr.preferredLocale"]);
    expect(contact.detail.wheres).toEqual([["c.id", "=", "case-1"]]);

    // Her preferred locale picks the Hindi copy.
    kysely.state.rows.Case = [caseRow({
      status: "RESOLVED",
      emailEncrypted: encryptField("survivor@example.com"),
      preferredLocale: "hi",
    })];
    await notifyReuploadFinding("case-1", "finding-2", NOW);
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(2);
    expect(sendReuploadFoundNotification).toHaveBeenLastCalledWith(
      "survivor@example.com",
      "ASMITA-2026-000123",
      "https://app.example.test/case/case-1",
      "hi",
      "reupload-found:finding-2",
    );
  });

  it("does nothing when the watch is not active: no email and no contact query", async () => {
    kysely.state.rows.CrawlConsent = [consentRow({ watchUntil: RUNNING_WATCH })];
    kysely.state.rows.Case = [caseRow({ status: "OPEN" })]; // open: a finding goes to review, not to her

    await notifyReuploadFinding("case-1", "finding-1", NOW);

    expect(sendReuploadFoundNotification).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
    // Only the watch check ran: the consent read and the status read; the
    // joined contact read never happened.
    expect(ops()).toEqual(["select CrawlConsent", "select Case"]);
    expect(callsOn("Case")).toHaveLength(1);
    expect(callsOn("Case")[0]!.detail.select).toEqual(["status"]);
  });
});

describe("privacy, Kysely path", () => {
  it("carries no address in any statement, audit entry or email", async () => {
    // The full flow: the sweep starts the window on a resolved case, the
    // pool still matches her fingerprint inside it, and an approved finding
    // emails her reference only.
    kysely.state.rows.CrawlConsent = [consentRow()];
    kysely.state.rows.Case = [caseRow({ status: "RESOLVED", emailEncrypted: encryptField("survivor@example.com"), preferredLocale: null })];
    kysely.state.rows.HashSubmission = [hashRow()];

    expect(await sweepReuploadWatches(NOW)).toEqual({ started: 1 });
    // The fake does not apply updates, so the window the sweep just started
    // is set here as the sweep would have left it.
    kysely.state.rows.CrawlConsent[0]!.watchUntil = WATCH_UNTIL;

    expect((await buildCrawlPool(NOW)).fingerprints).toHaveLength(1);
    await notifyReuploadFinding("case-1", "finding-1", NOW);
    expect(sendReuploadFoundNotification).toHaveBeenCalledTimes(1);

    // Every select works from ids, statuses and counts; no address column
    // of a link is ever selected.
    for (const call of kysely.state.calls) {
      if (Array.isArray(call.detail.select)) {
        expect(call.detail.select).not.toContain("urlEncrypted");
        expect(call.detail.select).not.toContain("urlHash");
      }
    }
    // No statement carries a URL, an address, or even her reference.
    const dump = JSON.stringify(kysely.state.calls);
    expect(dump).not.toContain("https://");
    expect(dump).not.toContain("survivor@example.com");
    expect(dump).not.toContain("urlEncrypted");
    expect(dump).not.toContain("ASMITA-");
    // The audit entry carries the consent id and the window's end only.
    const audits = vi.mocked(writeAuditLog).mock.calls;
    expect(audits).toHaveLength(1);
    expect(audits[0]![0]).toEqual({
      eventType: "CRAWL_WATCH_STARTED",
      entityType: "Case",
      entityId: "case-1",
      data: { consentId: "consent-1", watchUntil: WATCH_UNTIL.toISOString() },
    });
    expect(JSON.stringify(audits)).not.toContain("survivor@example.com");
    // The email carries her own address, the reference, the dashboard link,
    // her locale and the idempotency key — nothing else.
    expect(sendReuploadFoundNotification).toHaveBeenCalledWith(
      "survivor@example.com",
      "ASMITA-2026-000123",
      "https://app.example.test/case/case-1",
      "en",
      "reupload-found:finding-1",
    );
  });
});
