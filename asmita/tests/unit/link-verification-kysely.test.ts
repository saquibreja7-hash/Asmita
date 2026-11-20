import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP23 (watch-and-verify spec) on the Kysely (Worker) path, against a
// recording fake in the style of the other crawler tests. What the spec
// makes the real test: scheduling writes exactly the three checks
// (+1/+3/+7 days, attempts 1..3) and nothing else; the sweep's enqueue step
// is a bounded set of statements per due check (the due checks, the link, one
// REPORTED source insert with ON CONFLICT DO NOTHING, one priority page
// insert whose conflict clause resets the row to a pre-visit state, one
// conditional enqueuedAt update); resolve maps the crawler's report to an
// outcome with every deciding update conditional on the row still being
// PENDING; and STILL_ONLINE flips the link REMOVED -> NOTICE_SENT, drops the
// episode's remaining checks, audits and emails the reference only. The
// LinkVerification table stores no address: nothing may select urlEncrypted
// from it and no statement carries a literal URL. Placeholder hosts only
// (the never-crawl host is from the built-in list, like the other tests).

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
const DIGEST = crawlPageDigest("src-1", PARSED.normalizedUrl);
if (DIGEST === null) throw new Error("test fixture URL must digest");

function checkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "chk-1",
    submittedUrlId: "url-1",
    attempt: 1,
    dueAt: new Date(NOW.getTime() - HOUR),
    enqueuedAt: null,
    outcome: "PENDING",
    checkedAt: null,
    createdAt: new Date(NOW.getTime() - 2 * DAY),
    ...overrides,
  };
}

function pageRow(overrides: Record<string, unknown> = {}) {
  return { id: "page-1", sourceId: "src-1", urlDigest: DIGEST, status: "PENDING", lastFetchedAt: null, ...overrides };
}

/** One enqueued check of the seeded link, the resolve step's input. */
function seedEnqueuedCheck(overrides: Record<string, unknown> = {}) {
  kysely.state.rows.LinkVerification = [checkRow({ enqueuedAt: new Date(NOW.getTime() - DAY), ...overrides })];
  kysely.state.rows.CrawlSource = [{ id: "src-1", domain: "forum.example.com" }];
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  kysely.state.rows = {
    SubmittedUrl: [{ ...LINK }],
    LinkVerification: [],
    CrawlSource: [],
    CrawlBlockedHost: [],
    CrawlPage: [],
    CrawlFinding: [],
    CrawlConsent: [],
    Case: [],
  };
  kysely.state.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const callsOn = (table: string) => kysely.state.calls.filter((call) => call.table === table);
const ops = () => kysely.state.calls.map((call) => `${call.op} ${call.table}`);

describe("scheduleLinkVerifications, Kysely path", () => {
  it("inserts exactly the three checks at +1/+3/+7 days with attempts 1..3", async () => {
    const { scheduled } = await scheduleLinkVerifications("url-1", NOW);
    expect(scheduled).toBe(3);

    const insert = callsOn("LinkVerification").find((call) => call.op === "insert")!;
    const rows = insert.detail.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.attempt)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.dueAt)).toEqual(VERIFICATION_DELAYS_MS.map((ms) => new Date(NOW.getTime() + ms)));
    for (const row of rows) {
      expect(row.submittedUrlId).toBe("url-1");
      expect(row.id).toEqual(expect.any(String));
      // No case, no address: the row works from the link it references.
      expect(Object.keys(row).sort()).toEqual(["attempt", "dueAt", "id", "submittedUrlId"]);
    }
    // The idempotency guard: pending checks of this link only.
    const guard = callsOn("LinkVerification").find((call) => call.op === "select")!;
    expect(guard.detail.wheres).toEqual([["submittedUrlId", "=", "url-1"], ["outcome", "=", "PENDING"]]);
    expect(guard.detail.limit).toBe(1);
  });

  it("schedules nothing for a missing link, or while checks still wait", async () => {
    expect(await scheduleLinkVerifications("missing", NOW)).toEqual({ scheduled: 0 });
    expect(callsOn("LinkVerification").filter((call) => call.op === "insert")).toHaveLength(0);

    kysely.state.rows.LinkVerification = [checkRow()];
    expect(await scheduleLinkVerifications("url-1", NOW)).toEqual({ scheduled: 0 });
    expect(callsOn("LinkVerification").filter((call) => call.op === "insert")).toHaveLength(0);
  });
});

describe("sweepDueLinkVerifications enqueue, Kysely path", () => {
  it("enqueues one due check with a bounded set of statements", async () => {
    kysely.state.rows.LinkVerification = [checkRow()];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 1, resolved: 0, stillOnline: 0 });
    expect(ops()).toEqual([
      "select LinkVerification", // the due, never-enqueued checks
      "select SubmittedUrl", // the link the check works from
      "select CrawlBlockedHost", // never-crawl rows for the host and its parents
      "insert CrawlSource", // the REPORTED source, on conflict do nothing
      "insert CrawlPage", // the priority row, on conflict reset
      "update LinkVerification", // conditional: the row is still PENDING
      "select LinkVerification", // the enqueued checks of the resolve step
    ]);
    const due = callsOn("LinkVerification")[0]!;
    expect(due.detail.limit).toBe(VERIFICATION_SWEEP_BATCH);
    expect(due.detail.wheres).toEqual([["outcome", "=", "PENDING"], ["dueAt", "<=", NOW], ["enqueuedAt", "is", null]]);
    expect(due.detail.orderBy).toEqual(["dueAt", "asc"]);

    const blocked = callsOn("CrawlBlockedHost")[0]!;
    expect(blocked.detail.wheres).toEqual([["host", "in", ["forum.example.com", "example.com", "com"]]]);

    const source = callsOn("CrawlSource").find((call) => call.op === "insert")!;
    expect(source.detail.values).toMatchObject({
      kind: "SITE",
      domain: "forum.example.com",
      pageBudget: 2000,
      delayMs: 1500,
      enabled: true,
      approvedBy: null,
      origin: "REPORTED",
      hops: 0,
      discoveredFromId: null,
      render: "HTTP",
      lastCrawledAt: null,
      pagesCrawled: 0,
    });
    expect(source.detail.onConflict).toEqual({ columns: ["domain"], action: "doNothing", set: null });

    const page = callsOn("CrawlPage").find((call) => call.op === "insert")!;
    const sourceId = (source.detail.values as Record<string, unknown>).id as string;
    expect(page.detail.values).toMatchObject({
      sourceId,
      urlDigest: crawlPageDigest(sourceId, PARSED.normalizedUrl),
      depth: 0,
      kind: "PAGE",
      status: "PENDING",
      etag: null,
      lastModified: null,
      lastFetchedAt: null,
      nextDueAt: new Date(0),
      failCount: 0,
    });
    expect(String((page.detail.values as Record<string, unknown>).urlEncrypted)).not.toContain("forum.example.com"); // encrypted at rest
    expect(page.detail.onConflict).toEqual({
      columns: ["sourceId", "urlDigest"],
      action: "doUpdateSet",
      set: { status: "PENDING", etag: null, lastModified: null, lastFetchedAt: null, nextDueAt: new Date(0), failCount: 0 },
    });

    const mark = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(mark.detail.set).toEqual({ enqueuedAt: NOW });
    expect(mark.detail.wheres).toEqual([["id", "=", "chk-1"], ["outcome", "=", "PENDING"]]);
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
    kysely.state.rows.SubmittedUrl = [{ ...LINK, urlEncrypted: encryptField(NEVER), urlHash: never.urlHash, domain: never.domain }];
    kysely.state.rows.LinkVerification = [checkRow()];

    const summary = await sweepDueLinkVerifications(NOW);

    // The enqueue step resolves it UNKNOWN right away, so it counts as resolved.
    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(ops()).toEqual([
      "select LinkVerification",
      "select SubmittedUrl",
      "update LinkVerification",
      "select LinkVerification",
    ]);
    const update = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ outcome: "UNKNOWN", checkedAt: NOW });
    expect(update.detail.wheres).toEqual([["id", "=", "chk-1"], ["outcome", "=", "PENDING"]]);
  });
});

describe("sweepDueLinkVerifications resolve, Kysely path", () => {
  it("a gone page resolves GONE with one conditional update", async () => {
    seedEnqueuedCheck();
    kysely.state.rows.CrawlPage = [pageRow({ status: "GONE", lastFetchedAt: new Date(NOW.getTime() - 2 * HOUR) })];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    expect(ops()).toEqual([
      "select LinkVerification", // nothing due for the enqueue step
      "select LinkVerification", // the enqueued check
      "select SubmittedUrl",
      "select CrawlSource",
      "select CrawlFinding", // no finding since the check was queued
      "select CrawlPage",
      "update LinkVerification",
    ]);
    const update = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ outcome: "GONE", checkedAt: NOW });
    expect(update.detail.wheres).toEqual([["id", "=", "chk-1"], ["outcome", "=", "PENDING"]]);
    // Nothing else moved: no notice-sent flip, no delete, no audit, no email.
    expect(callsOn("SubmittedUrl").filter((call) => call.op === "update")).toHaveLength(0);
    expect(kysely.state.calls.filter((call) => call.op === "delete")).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(sendLinkStillOnlineNotification).not.toHaveBeenCalled();
  });

  it("a fetched page resolves UNKNOWN while her fingerprints are not in the pool", async () => {
    seedEnqueuedCheck();
    kysely.state.rows.CrawlPage = [pageRow({ status: "FETCHED", lastFetchedAt: new Date(NOW.getTime() - 3 * HOUR) })];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    const update = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ outcome: "UNKNOWN", checkedAt: NOW });
    // The pool read ran: live consents of her case, none seeded.
    expect(callsOn("CrawlConsent")).toHaveLength(1);
    expect(callsOn("CrawlConsent")[0]!.detail.wheres).toEqual([["withdrawnAt", "is", null], ["caseId", "in", ["case-1"]]]);
  });

  it("a fetched page waits inside the two-hour finding grace", async () => {
    seedEnqueuedCheck();
    kysely.state.rows.CrawlPage = [pageRow({ status: "FETCHED", lastFetchedAt: new Date(NOW.getTime() - HOUR) })];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(kysely.state.calls.filter((call) => call.op === "update")).toHaveLength(0);
  });

  it("an erroring page waits inside the seven-day give-up window", async () => {
    seedEnqueuedCheck();
    kysely.state.rows.CrawlPage = [pageRow({ status: "ERROR" })];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 0, stillOnline: 0 });
    expect(kysely.state.calls.filter((call) => call.op === "update")).toHaveLength(0);
  });

  it("an unvisited page gives up as UNKNOWN after seven days", async () => {
    seedEnqueuedCheck({ enqueuedAt: new Date(NOW.getTime() - 8 * DAY) });
    kysely.state.rows.CrawlPage = [pageRow()]; // PENDING, never fetched

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 0 });
    const update = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ outcome: "UNKNOWN", checkedAt: NOW });
  });

  it("a finding since the check was queued resolves STILL_ONLINE and returns the link to the notice flow", async () => {
    seedEnqueuedCheck();
    // The episode's remaining attempt: still pending, not due yet.
    kysely.state.rows.LinkVerification.push(checkRow({ id: "chk-3", attempt: 3, dueAt: new Date(NOW.getTime() + DAY) }));
    kysely.state.rows.CrawlFinding = [{ caseId: "case-1", lastSeenAt: new Date(NOW.getTime() - 12 * HOUR), pageUrlEncrypted: encryptField(PAGE) }];
    kysely.state.rows.Case = [{ id: "case-1", referenceNumber: "ASMITA-2026-000123", emailEncrypted: encryptField("survivor@example.com"), preferredLocale: null }];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 0, resolved: 1, stillOnline: 1 });
    expect(ops()).toEqual([
      "select LinkVerification",
      "select LinkVerification",
      "select SubmittedUrl",
      "select CrawlSource",
      "select CrawlFinding",
      "update LinkVerification",
      "update SubmittedUrl",
      "delete LinkVerification",
      "select Case",
    ]);
    const marked = callsOn("LinkVerification").find((call) => call.op === "update")!;
    expect(marked.detail.set).toEqual({ outcome: "STILL_ONLINE", checkedAt: NOW });
    expect(marked.detail.wheres).toEqual([["id", "=", "chk-1"], ["outcome", "=", "PENDING"]]);

    // REMOVED -> NOTICE_SENT, only while the link is still removed.
    const flip = callsOn("SubmittedUrl").find((call) => call.op === "update")!;
    expect(flip.detail.set).toEqual({ status: "NOTICE_SENT" });
    expect(flip.detail.wheres).toEqual([["id", "=", "url-1"], ["status", "=", "REMOVED"]]);

    // The episode's remaining attempts are dropped.
    const drop = kysely.state.calls.find((call) => call.op === "delete")!;
    expect(drop.detail.wheres).toEqual([["submittedUrlId", "in", ["url-1"]], ["outcome", "=", "PENDING"]]);

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith({
      eventType: "CONTENT_STILL_ONLINE",
      entityType: "SubmittedUrl",
      entityId: "url-1",
      data: { caseId: "case-1", attempt: 1, verificationId: "chk-1" },
    });
    expect(sendLinkStillOnlineNotification).toHaveBeenCalledTimes(1);
    expect(sendLinkStillOnlineNotification).toHaveBeenCalledWith(
      "survivor@example.com",
      "ASMITA-2026-000123",
      "https://app.example.test/case/case-1",
      "en",
      "verify-still:chk-1",
    );
  });
});

describe("privacy, Kysely path", () => {
  it("carries no address in any statement, audit entry or email", async () => {
    // One sweep over both halves: a due check is enqueued, and an
    // already-enqueued check of the same link resolves STILL_ONLINE.
    kysely.state.rows.LinkVerification = [
      checkRow(),
      checkRow({ id: "chk-2", attempt: 2, dueAt: new Date(NOW.getTime() - 3 * DAY), enqueuedAt: new Date(NOW.getTime() - DAY) }),
    ];
    kysely.state.rows.CrawlSource = [{ id: "src-1", domain: "forum.example.com" }];
    kysely.state.rows.CrawlFinding = [{ caseId: "case-1", lastSeenAt: new Date(NOW.getTime() - 12 * HOUR), pageUrlEncrypted: encryptField(PAGE) }];
    kysely.state.rows.Case = [{ id: "case-1", referenceNumber: "ASMITA-2026-000123", emailEncrypted: encryptField("survivor@example.com"), preferredLocale: null }];

    const summary = await sweepDueLinkVerifications(NOW);

    expect(summary).toEqual({ enqueued: 1, resolved: 1, stillOnline: 1 });
    expect(ops()).toEqual([
      "select LinkVerification",
      "select SubmittedUrl",
      "select CrawlBlockedHost",
      "insert CrawlSource",
      "insert CrawlPage",
      "update LinkVerification",
      "select LinkVerification",
      "select SubmittedUrl",
      "select CrawlSource",
      "select CrawlFinding",
      "update LinkVerification",
      "update SubmittedUrl",
      "delete LinkVerification",
      "select Case",
    ]);

    // The table has no address column, so nothing may select one from it.
    for (const call of callsOn("LinkVerification").filter((call) => call.op === "select")) {
      expect(call.detail.select).not.toContain("urlEncrypted");
    }
    // No statement carries the link itself: the host alone reaches CrawlSource.
    const dump = JSON.stringify(kysely.state.calls);
    expect(dump).not.toContain("https://");
    expect(dump).not.toContain("thread/1");
    // The still-online audit entry and the email carry ids and the reference only.
    const still = vi.mocked(writeAuditLog).mock.calls.filter((call) => call[0].eventType === "CONTENT_STILL_ONLINE");
    expect(still).toHaveLength(1);
    expect(JSON.stringify(still)).not.toContain("forum.example.com");
    expect(JSON.stringify(vi.mocked(sendLinkStillOnlineNotification).mock.calls)).not.toContain("forum.example.com");
  });
});
