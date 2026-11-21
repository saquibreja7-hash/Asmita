import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP110 (research-tools spec, Track A): the HMA signal feed,
// GET /api/partner/v1/signals and the serve-time rules behind it. Proves the
// checkpoint contract (opaque, strictly (createdAt, seq)-ordered, never
// backwards, malformed refused), the explicit ADD/WITHDRAW -> deleted/false
// mapping with tombstones, the publish quality rule, the vPDQ signal string
// byte-for-byte as python-threatexchange writes it, every consent/status
// gate re-derived at serve time by the same function /fingerprints uses, the
// WP110 key scopes, the rate-limit bucket, and — on the Kysely and Prisma
// fakes — the cursor predicate, the page query shape and the per-fingerprint
// (no full-table-scan) latest-event and erasure queries. Synthetic data only:
// example case ids and random hex hashes, nothing real.

const mocks = vi.hoisted(() => {
  // The Kysely recording fake from partner-feed.test.ts, extended for WP110:
  // it understands the or/and cursor predicate, orderBy and limit, so a page
  // walk over the fake exercises the real query shape.
  const kysely = (() => {
    const state = {
      rows: {} as Record<string, Array<Record<string, unknown>>>,
      calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    };

    // Expression-builder stub: what the where callback composes with.
    const cmp = (column: string, op: string, value: unknown) => ({ kind: "cmp", column, op, value });
    const eb = Object.assign(cmp, {
      or: (parts: unknown[]) => ({ kind: "or", parts }),
      and: (parts: unknown[]) => ({ kind: "and", parts }),
    });

    function valueOf(entry: unknown): number | string | null {
      if (entry instanceof Date) return entry.getTime();
      if (typeof entry === "number" || typeof entry === "string") return entry;
      return null;
    }

    function matches(row: Record<string, unknown>, expr: unknown): boolean {
      if (expr === null || expr === undefined) return true;
      if (Array.isArray(expr)) {
        const [column, op, value] = expr as [string, string, unknown];
        if (op === "in") return Array.isArray(value) && value.includes(row[column]);
        if (op === "is") return value === null ? row[column] === null : row[column] === value;
        const left = valueOf(row[column]);
        const right = valueOf(value);
        if (left === null || right === null) return true; // a shape this fake does not model
        if (op === "=") return left === right;
        if (op === ">") return left > right;
        return true;
      }
      if (typeof expr === "object" && expr !== null && "kind" in expr) {
        const node = expr as { kind: string; parts?: unknown[]; column?: string; op?: string; value?: unknown };
        if (node.kind === "cmp") return matches(row, [node.column!, node.op!, node.value]);
        if (node.kind === "or") return (node.parts ?? []).some((part) => matches(row, part));
        if (node.kind === "and") return (node.parts ?? []).every((part) => matches(row, part));
      }
      return true;
    }

    function selectRows(table: string, detail: Record<string, unknown>) {
      let rows = state.rows[table] ?? [];
      for (const where of (detail.wheres as unknown[] | undefined) ?? []) rows = rows.filter((row) => matches(row, where));
      const orderBys = (detail.orderBys as string[] | undefined) ?? [];
      if (orderBys.length > 0) {
        rows = [...rows].sort((a, b) => {
          for (const column of orderBys) {
            const left = valueOf(a[column]);
            const right = valueOf(b[column]);
            if (left !== null && right !== null && left !== right) return left < right ? -1 : 1;
          }
          return 0;
        });
      }
      const limit = detail.limit as number | undefined;
      if (limit !== undefined) rows = rows.slice(0, limit);
      return rows;
    }

    function builder(op: string, table: string, detail: Record<string, unknown>) {
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "execute") return async () => selectRows(table, detail).map((row) => ({ ...row }));
            if (prop === "executeTakeFirst") return async () => selectRows(table, detail)[0];
            if (prop === "then") return undefined;
            return (...args: unknown[]) => {
              if (prop === "values") detail.values = args[0];
              else if (prop === "select") detail.select = args[0];
              else if (prop === "where") {
                const first = args[0];
                const where = typeof first === "function" ? (first as (eb: unknown) => unknown)(eb) : args;
                detail.wheres = [...((detail.wheres as unknown[]) ?? []), where];
              } else if (prop === "orderBy") detail.orderBys = [...((detail.orderBys as string[]) ?? []), ...(args as string[])];
              else if (prop === "limit") detail.limit = args[0];
              else if (prop === "innerJoin") detail.join = args[0];
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
  })();

  // The Prisma fake from partner-feed.test.ts, extended for WP110: OR
  // predicates, orderBy arrays, take, and a recording of every findMany's
  // arguments so the page query can be asserted on.
  const prisma = (() => {
    const state = {
      tables: {} as Record<string, Array<Record<string, unknown>>>,
      createManyCalls: [] as Array<{ table: string; data: unknown }>,
      createCalls: [] as Array<{ table: string; data: Record<string, unknown> }>,
      findManyArgs: [] as Array<{ table: string; args: Record<string, unknown> }>,
    };

    function valueOf(entry: unknown): number | string | null {
      if (entry instanceof Date) return entry.getTime();
      if (typeof entry === "number" || typeof entry === "string") return entry;
      return null;
    }

    function conditionMatches(row: Record<string, unknown>, key: string, condition: unknown): boolean {
      if (condition && typeof condition === "object" && !Array.isArray(condition)) {
        const c = condition as Record<string, unknown>;
        if ("gt" in c) {
          const left = valueOf(row[key]);
          const right = valueOf(c.gt);
          return left !== null && right !== null && left > right;
        }
        if ("in" in c) return Array.isArray(c.in) && c.in.includes(row[key]);
        if ("not" in c) return row[key] !== c.not;
        return Object.keys(c).length === 0;
      }
      if (condition instanceof Date) {
        const left = valueOf(row[key]);
        const right = valueOf(condition);
        return left !== null && left === right;
      }
      return row[key] === condition;
    }

    function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
      return Object.entries(where).every(([key, condition]) => {
        if (key === "OR" && Array.isArray(condition)) return condition.some((sub) => matches(row, sub as Record<string, unknown>));
        if (key === "user" || key === "case") return true; // the adult filter is asserted via the recorded query
        return conditionMatches(row, key, condition);
      });
    }

    function delegate(table: string) {
      return {
        findMany: async (args: { where?: Record<string, unknown>; orderBy?: unknown; take?: number; select?: Record<string, unknown> } = {}) => {
          state.findManyArgs.push({ table, args: args as Record<string, unknown> });
          let rows = (state.tables[table] ?? []).filter((row) => matches(row, args.where));
          const orderBy = args.orderBy;
          if (Array.isArray(orderBy) && orderBy.length > 0) {
            rows = [...rows].sort((a, b) => {
              for (const entry of orderBy as Array<Record<string, string>>) {
                const column = Object.keys(entry)[0]!;
                const left = valueOf(a[column]);
                const right = valueOf(b[column]);
                if (left !== null && right !== null && left !== right) return left < right ? -1 : 1;
              }
              return 0;
            });
          }
          if (typeof args.take === "number") rows = rows.slice(0, args.take);
          const select = args.select;
          if (select) return rows.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
          return rows.map((row) => ({ ...row }));
        },
        findFirst: async (args: { where?: Record<string, unknown> } = {}) =>
          (state.tables[table] ?? []).find((row) => matches(row, args.where)) ?? null,
        findUnique: async (args: { where?: Record<string, unknown> } = {}) =>
          (state.tables[table] ?? []).find((row) => matches(row, args.where)) ?? null,
        createMany: async (args: { data: unknown }) => {
          state.createManyCalls.push({ table, data: args.data });
          return { count: Array.isArray(args.data) ? args.data.length : 1 };
        },
        create: async (args: { data: Record<string, unknown> }) => {
          state.createCalls.push({ table, data: args.data });
          state.tables[table] ??= [];
          state.tables[table].push({ id: `${table}-new`, ...args.data });
          return { id: `${table}-new`, ...args.data };
        },
        update: async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
          const hit = (state.tables[table] ?? []).filter((row) => matches(row, args.where));
          hit.forEach((row) => Object.assign(row, args.data));
          return hit[0] ?? null;
        },
        updateMany: async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
          const hit = (state.tables[table] ?? []).filter((row) => matches(row, args.where));
          hit.forEach((row) => Object.assign(row, args.data));
          return { count: hit.length };
        },
      };
    }

    const client = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        if (prop === "$transaction") return async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
        return delegate(prop);
      },
    });
    return { client, state };
  })();

  const usesWorkerKysely = vi.fn(() => false);
  return { kysely, prisma, usesWorkerKysely };
});

vi.mock("@/lib/db", () => ({ db: mocks.prisma.client }));
vi.mock("@/lib/worker-kysely", () => ({
  usesWorkerKysely: mocks.usesWorkerKysely,
  getWorkerDb: () => mocks.kysely.db,
}));

import { GET as getSignals } from "@/app/api/partner/v1/signals/route";
import { GET as getFingerprints } from "@/app/api/partner/v1/fingerprints/route";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { encryptField } from "@/lib/encryption";
import { hashPartnerKey, issuePartnerKey } from "@/lib/partner-auth";
import {
  encodePartnerSignalCheckpoint,
  getPartnerSignalPage,
  parsePartnerSignalCheckpoint,
  PARTNER_SIGNALS_DEFAULT_PAGE,
  PARTNER_SIGNALS_MAX_PAGE,
  PARTNER_SIGNALS_START,
  PARTNER_SIGNAL_TAGS,
  syncPartnerFeedFingerprints,
  vpdqSignalString,
  withdrawSharedFingerprintsForErasureKysely,
} from "@/lib/partner-feed";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";

const HEX_A = "ab".repeat(32);
const HEX_B = "cd".repeat(32);
const HEX_C = "ef".repeat(32);

const TAGS = [...PARTNER_SIGNAL_TAGS];

function seedPartner(id: string) {
  partnerMemory().partners.set(id, {
    id,
    name: `ExamplePartner-${id}`,
    primaryDomain: `${id}.example`,
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: null,
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
  return id;
}

/** A fingerprint row as the memory store keeps it, encryption included. */
function seedFingerprint(
  id: string,
  options: { algorithm?: "PDQ" | "VPDQ"; quality?: number; hash?: string; status?: "APPROVED" | "DISPATCHED" | "PENDING_REVIEW" | "REJECTED"; frames?: Array<{ hash: string; quality: number; t: number }> } = {},
) {
  const algorithm = options.algorithm ?? "PDQ";
  crawlMemory().fingerprints.set(id, {
    id,
    caseId: `case-${id}`,
    hashEncrypted: encryptField(options.hash ?? HEX_A),
    quality: options.quality ?? 100,
    status: options.status ?? "APPROVED",
    crawlPoolId: null,
    algorithm,
    videoFramesEncrypted: options.frames ? encryptField(JSON.stringify(options.frames)) : null,
  });
}

/** A live partner-sharing agreement for the fingerprint's case (Rule 2). */
function seedConsent(fingerprintId: string, withdrawn = false) {
  partnerMemory().shareConsents.push({
    id: `consent-${fingerprintId}${withdrawn ? "-w" : ""}`,
    caseId: `case-${fingerprintId}`,
    hashSubmissionIds: [fingerprintId],
    templateId: "template-1",
    templateDigest: "digest-1",
    agreedAt: new Date(),
    withdrawnAt: withdrawn ? new Date() : null,
  });
}

/** A feed event with a hand-chosen position, exactly what the (t, s) order needs. */
function seedEvent(seq: number, fingerprintId: string, type: "ADD" | "WITHDRAW", createdAt: Date, kind: "image" | "video" = "image") {
  partnerMemory().feedEvents.push({ id: `event-${seq}`, seq, fingerprintId, type, kind, caseId: null, caseRef: null, createdAt });
  return seq;
}

let ipCounter = 0;
function request(key: string | null, query = "") {
  ipCounter += 1;
  return new Request(`https://asmita.test/api/partner/v1/signals${query}`, {
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "cf-connecting-ip": `192.0.2.${ipCounter % 250}`,
    },
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPartnerMemory();
  resetCrawlMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("the /signals checkpoint", () => {
  it("mints and parses its own checkpoints, and refuses everything else", () => {
    expect(PARTNER_SIGNALS_START).toEqual({ t: 0, s: 0 });
    expect(PARTNER_SIGNALS_MAX_PAGE).toBe(800);
    expect(PARTNER_SIGNALS_DEFAULT_PAGE).toBe(500);

    const opaque = encodePartnerSignalCheckpoint({ t: 1_700_000_000_000, s: 42 });
    expect(opaque).not.toMatch(/[+/=]/); // base64url, opaque, URL-safe
    expect(parsePartnerSignalCheckpoint(opaque)).toEqual({ t: 1_700_000_000_000, s: 42 });

    // Not a checkpoint Asmita minted: every one of these is malformed.
    const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");
    for (const bad of [
      "", // empty is "start from the beginning" at the route, never parsed here
      "!!!",
      "e30", // {}
      b64('{"t":1}'),
      b64('{"t":1,"s":2,"x":3}'),
      b64('{"t":1.5,"s":2}'),
      b64('{"t":-1,"s":2}'),
      b64('{"t":1,"s":-2}'),
      b64('{"t":"a","s":2}'),
      b64("null"),
      b64("[1,2]"),
      b64('{"t":99999999999999999,"s":2}'),
      "x".repeat(300),
    ]) {
      expect(parsePartnerSignalCheckpoint(bad)).toBeNull();
    }
  });

  it("formats the vPDQ signal string exactly as python-threatexchange writes it", () => {
    // json.dumps([str(f) ...]) with vpdq_util's "<hash>,<quality>,<t:.3f>"
    // feature strings: Python's default ", " list separator included.
    expect(vpdqSignalString([{ hash: HEX_A, quality: 80, t: 1 }, { hash: HEX_B, quality: 90, t: 25 }]))
      .toBe(`["${HEX_A},80,1.000", "${HEX_B},90,25.000"]`);
    expect(vpdqSignalString([{ hash: HEX_C, quality: 51, t: 0 }])).toBe(`["${HEX_C},51,0.000"]`);
  });
});

describe("GET /api/partner/v1/signals, memory store", () => {
  it("maps an ADD to a live record and a WITHDRAW to an explicit tombstone", async () => {
    seedFingerprint("f-1");
    seedConsent("f-1");
    const addedAt = new Date(1_700_000_000_000);
    const withdrawnAt = new Date(1_700_000_100_000);
    seedEvent(1, "f-1", "ADD", addedAt);
    seedEvent(2, "f-1", "WITHDRAW", withdrawnAt);

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.has_more).toBe(false);
    expect(page.records).toEqual([
      { id: "f-1", signal_type: "pdq", hash: HEX_A, deleted: false, updated_at: Math.floor(addedAt.getTime() / 1000), tags: TAGS },
      { id: "f-1", signal_type: "pdq", hash: null, deleted: true, updated_at: Math.floor(withdrawnAt.getTime() / 1000), tags: TAGS },
    ]);
    // The record carries exactly the spec's fields, nothing else.
    expect(Object.keys(page.records[0]!).sort()).toEqual(["deleted", "hash", "id", "signal_type", "tags", "updated_at"]);
    // The checkpoint is the last event's pair, and the tombstone is what a
    // caller that resumes there sees nothing more of (kept forever, but the
    // walk has passed it).
    expect(parsePartnerSignalCheckpoint(page.checkpoint)).toEqual({ t: withdrawnAt.getTime(), s: 2 });
  });

  it("orders strictly by (createdAt, seq): the seq breaks a shared millisecond, and createdAt outranks a later seq", async () => {
    for (const id of ["f-1", "f-2", "f-3"]) {
      seedFingerprint(id);
      seedConsent(id);
    }
    // seq order 3, 1, 2 but (createdAt, seq) order 2, 3, 1: an event written
    // earlier in a later transaction must not overtake its clock.
    seedEvent(3, "f-3", "ADD", new Date(1_700_000_000_000)); // earliest createdAt
    seedEvent(1, "f-1", "ADD", new Date(1_700_000_000_500));
    seedEvent(2, "f-2", "ADD", new Date(1_700_000_000_500)); // same ms: seq 1 < 2 decides

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records.map((record) => record.id)).toEqual(["f-3", "f-1", "f-2"]);
    expect(parsePartnerSignalCheckpoint(page.checkpoint)).toEqual({ t: 1_700_000_000_500, s: 2 });
  });

  it("never moves the checkpoint backwards across pages, and serves no record twice", async () => {
    const expected: Array<{ t: number; s: number }> = [];
    for (let i = 1; i <= 7; i += 1) {
      const id = `f-${i}`;
      seedFingerprint(id);
      seedConsent(id);
      // Deliberately out-of-order clocks (i % 3 interleaves): page boundaries
      // must hold whatever order the events were written in.
      const createdAt = new Date(1_700_000_000_000 + (i % 3 === 0 ? 0 : i * 10));
      seedEvent(i, id, "ADD", createdAt);
      expected.push({ t: createdAt.getTime(), s: i });
    }
    expected.sort((a, b) => a.t - b.t || a.s - b.s);
    expect(partnerMemory().feedEvents).toHaveLength(7);

    const served: Array<{ t: number; s: number }> = [];
    let previous: { t: number; s: number } | null = null;
    let checkpoint: string | null = null;
    let pages = 0;
    for (;;) {
      const start = checkpoint === null ? null : parsePartnerSignalCheckpoint(checkpoint);
      const page = await getPartnerSignalPage(start, 3);
      pages += 1;
      if (previous) {
        const current = parsePartnerSignalCheckpoint(page.checkpoint)!;
        // Strictly forward, always: HMA's fetcher asserts exactly this.
        expect(current.t > previous.t || (current.t === previous.t && current.s > previous.s)).toBe(true);
      }
      // Every served record sits strictly after the last one served before it.
      for (const record of page.records) {
        const event = partnerMemory().feedEvents.find(
          (candidate) => candidate.fingerprintId === record.id && Math.floor(candidate.createdAt.getTime() / 1000) === record.updated_at,
        );
        expect(event).toBeDefined();
        const position = { t: event!.createdAt.getTime(), s: event!.seq };
        if (served.length > 0) {
          const last = served[served.length - 1]!;
          expect(position.t > last.t || (position.t === last.t && position.s > last.s)).toBe(true);
        }
        served.push(position);
      }
      previous = parsePartnerSignalCheckpoint(page.checkpoint);
      checkpoint = page.checkpoint;
      if (!page.has_more) break;
      expect(pages).toBeLessThan(10); // the walk must end
    }
    // Every event was served exactly once, in (createdAt, seq) order.
    expect(served).toEqual(expected);
  });

  it("walks pages with page_size 1 through every event in order", async () => {
    const ids = ["f-1", "f-2", "f-3", "f-4"];
    for (const [index, id] of ids.entries()) {
      seedFingerprint(id);
      seedConsent(id);
      seedEvent(index + 1, id, "ADD", new Date(1_700_000_000_000 + index * 5));
    }
    const walked: string[] = [];
    let start: { t: number; s: number } | null = null;
    for (;;) {
      const page = await getPartnerSignalPage(start, 1);
      if (page.records.length === 0) {
        // The page after the last record: nothing more, nothing moved.
        expect(page.has_more).toBe(false);
        break;
      }
      expect(page.records).toHaveLength(1);
      walked.push(page.records[0]!.id);
      start = parsePartnerSignalCheckpoint(page.checkpoint);
    }
    expect(walked).toEqual(ids);
  });

  it("skips an ADD that is no longer shareable, and the checkpoint still advances past it", async () => {
    seedFingerprint("f-1");
    seedConsent("f-1");
    seedFingerprint("f-no-consent"); // approved and adult, but no agreement was ever ticked
    seedFingerprint("f-3");
    seedConsent("f-3");
    seedEvent(1, "f-1", "ADD", new Date(1_700_000_000_000));
    seedEvent(2, "f-no-consent", "ADD", new Date(1_700_000_000_010));
    seedEvent(3, "f-3", "ADD", new Date(1_700_000_000_020));

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records.map((record) => record.id)).toEqual(["f-1", "f-3"]);
    // The checkpoint is the LAST raw event's pair, not the last served record's:
    // a caller can never stall behind a page of skipped events.
    expect(parsePartnerSignalCheckpoint(page.checkpoint)).toEqual({ t: 1_700_000_000_020, s: 3 });

    const next = await getPartnerSignalPage(parsePartnerSignalCheckpoint(page.checkpoint), PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(next.records).toEqual([]);
    expect(next.has_more).toBe(false);
    expect(next.checkpoint).toBe(page.checkpoint); // nothing moved: it never goes backwards
  });

  it("never serves an ADD whose consent was withdrawn, even when the WITHDRAW event is missing", async () => {
    // The belt behind the braces: syncPartnerFeedFingerprints writes the
    // WITHDRAW, but the serve-time check must hold even if it never ran.
    seedFingerprint("f-1");
    seedConsent("f-1", true); // withdrawn
    seedFingerprint("f-2");
    seedConsent("f-2", true); // withdrawn
    seedEvent(1, "f-1", "ADD", new Date(1_700_000_000_000));
    seedEvent(2, "f-2", "ADD", new Date(1_700_000_000_010));

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records).toEqual([]);
    expect(parsePartnerSignalCheckpoint(page.checkpoint)).toEqual({ t: 1_700_000_000_010, s: 2 });
  });

  it("refuses every status the shareable set excludes (Rule 2, re-derived at serve time)", async () => {
    for (const status of ["PENDING_REVIEW", "REJECTED"] as const) {
      seedFingerprint(`f-${status}`, { status });
      seedConsent(`f-${status}`);
      seedEvent(status === "PENDING_REVIEW" ? 1 : 2, `f-${status}`, "ADD", new Date(1_700_000_000_000));
    }
    seedFingerprint("f-dispatched", { status: "DISPATCHED" });
    seedConsent("f-dispatched");
    seedEvent(3, "f-dispatched", "ADD", new Date(1_700_000_000_030));

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records.map((record) => record.id)).toEqual(["f-dispatched"]);
  });

  it("serves lowercase hashes only, and nothing below the publish quality", async () => {
    seedFingerprint("f-upper", { hash: HEX_A.toUpperCase(), quality: 100 });
    seedConsent("f-upper");
    seedEvent(1, "f-upper", "ADD", new Date(1_700_000_000_000));

    seedFingerprint("f-low", { hash: HEX_B, quality: 49 });
    seedConsent("f-low");
    seedEvent(2, "f-low", "ADD", new Date(1_700_000_000_010));

    seedFingerprint("f-edge", { hash: HEX_C, quality: 50 });
    seedConsent("f-edge");
    seedEvent(3, "f-edge", "ADD", new Date(1_700_000_000_020));

    seedFingerprint("f-broken", { hash: "not-a-hash", quality: 100 });
    seedConsent("f-broken");
    seedEvent(4, "f-broken", "ADD", new Date(1_700_000_000_030));

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records).toEqual([
      { id: "f-upper", signal_type: "pdq", hash: HEX_A, deleted: false, updated_at: 1_700_000_000, tags: TAGS },
      { id: "f-edge", signal_type: "pdq", hash: HEX_C, deleted: false, updated_at: 1_700_000_000, tags: TAGS },
    ]);
  });

  it("serves a video's full frame list as the vPDQ signal string, dropping frames below the publish quality", async () => {
    seedFingerprint("f-video", {
      algorithm: "VPDQ",
      hash: HEX_A, // the best-frame hash the row carries: never what /signals serves
      quality: 80,
      frames: [
        { hash: HEX_A, quality: 80, t: 0 },
        { hash: HEX_B, quality: 30, t: 1 }, // below 50: dropped
        { hash: HEX_C, quality: 50, t: 2 },
      ],
    });
    seedConsent("f-video");
    seedEvent(1, "f-video", "ADD", new Date(1_700_000_000_000), "video");

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records).toEqual([
      {
        id: "f-video",
        signal_type: "vpdq",
        hash: vpdqSignalString([{ hash: HEX_A, quality: 80, t: 0 }, { hash: HEX_C, quality: 50, t: 2 }]),
        deleted: false,
        updated_at: 1_700_000_000,
        tags: TAGS,
      },
    ]);
    expect(page.records[0]!.hash).toBe(`["${HEX_A},80,0.000", "${HEX_C},50,2.000"]`);
  });

  it("serves nothing for a video whose frames are all below the publish quality, or whose frames cannot be read", async () => {
    seedFingerprint("f-all-low", { algorithm: "VPDQ", quality: 40, frames: [{ hash: HEX_A, quality: 40, t: 0 }] });
    seedConsent("f-all-low");
    seedEvent(1, "f-all-low", "ADD", new Date(1_700_000_000_000), "video");

    const unreadable = crawlMemory().fingerprints.get("f-all-low")!;
    seedFingerprint("f-no-frames", { algorithm: "VPDQ", quality: 90 });
    seedConsent("f-no-frames");
    seedEvent(2, "f-no-frames", "ADD", new Date(1_700_000_000_010), "video");
    unreadable.videoFramesEncrypted = "not-encrypted";
    seedFingerprint("f-bad-frames", { algorithm: "VPDQ", quality: 90, frames: [{ hash: "nope", quality: 90, t: 0 }] });
    seedConsent("f-bad-frames");
    seedEvent(3, "f-bad-frames", "ADD", new Date(1_700_000_000_020), "video");

    const page = await getPartnerSignalPage(null, PARTNER_SIGNALS_DEFAULT_PAGE);
    expect(page.records).toEqual([]);
    // But the tombstones after them still advance the checkpoint.
    expect(parsePartnerSignalCheckpoint(page.checkpoint)).toEqual({ t: 1_700_000_000_020, s: 3 });
  });
});

describe("GET /api/partner/v1/signals, the route", () => {
  async function seedKeyWithScopes(scopes?: readonly string[]) {
    const partnerId = seedPartner(`partner-${Math.random().toString(36).slice(2, 8)}`);
    return (await issuePartnerKey(partnerId, "test key", scopes)).key;
  }

  it("refuses a keyless request and keeps every response no-store", async () => {
    const key = await seedKeyWithScopes();
    const denied = await getSignals(request(null));
    expect(denied.status).toBe(401);

    const ok = await getSignals(request(key));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = (await ok.json()) as { checkpoint: string; has_more: boolean; records: unknown[] };
    expect(body).toEqual({ checkpoint: expect.any(String), has_more: false, records: [] });
  });

  it("answers 400 invalid_checkpoint for anything not a minted checkpoint, and treats empty as the beginning", async () => {
    const key = await seedKeyWithScopes();
    seedFingerprint("f-1");
    seedConsent("f-1");
    seedEvent(1, "f-1", "ADD", new Date());

    for (const bad of ["?checkpoint=abc", "?checkpoint=%7B%22t%22%3A1%7D", "?checkpoint=" + "x".repeat(300), "?page_size=0"]) {
      const response = await getSignals(request(key, bad));
      expect(response.status).toBe(400);
    }
    // Wait: page_size 0 has its own error code; keep both asserts explicit.
    expect(await (await getSignals(request(key, "?checkpoint=abc"))).json()).toEqual({ error: "invalid_checkpoint" });
    expect(await (await getSignals(request(key, "?page_size=0"))).json()).toEqual({ error: "invalid_page_size" });

    // Empty means the beginning: a full page from the start.
    const fromEmpty = await getSignals(request(key, "?checkpoint="));
    expect(((await fromEmpty.json()) as { records: unknown[] }).records).toHaveLength(1);

    // A page_size of 1 serves one record and says more may follow.
    const paged = await getSignals(request(key, "?page_size=1"));
    const body = (await paged.json()) as { records: unknown[]; has_more: boolean; checkpoint: string };
    expect(body.records).toHaveLength(1);
    expect(body.has_more).toBe(true);
    // And the minted checkpoint resumes exactly past it.
    const next = await getSignals(request(key, `?checkpoint=${encodeURIComponent(body.checkpoint)}`));
    expect(((await next.json()) as { records: unknown[] }).records).toEqual([]);
  });

  it("answers 403 insufficient_scope for a key issued without the feed scope", async () => {
    const outcomesOnly = await seedKeyWithScopes(["outcomes"]);
    const denied = await getSignals(request(outcomesOnly));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "insufficient_scope" });

    // The old route is behind the same scope.
    const feedDenied = await getFingerprints(
      new Request("https://asmita.test/api/partner/v1/fingerprints", {
        headers: { authorization: `Bearer ${outcomesOnly}`, "cf-connecting-ip": "198.51.100.7" },
      }),
    );
    expect(feedDenied.status).toBe(403);
    expect(await feedDenied.json()).toEqual({ error: "insufficient_scope" });

    // A key from before scopes existed (no scopes column value) keeps both.
    const partnerId = seedPartner("partner-legacy");
    partnerMemory().keys.set("legacy-key", {
      id: "legacy-key", partnerId, keyHash: hashPartnerKey("ppk_" + "c".repeat(48)), label: "legacy",
      createdAt: new Date(), revokedAt: null, lastUsedAt: null,
    } as never);
    const legacy = await getSignals(request("ppk_" + "c".repeat(48)));
    expect(legacy.status).toBe(200);
  });

  it("rate limits /signals under its own bucket, separate from /fingerprints", async () => {
    const key = await seedKeyWithScopes();
    let limited = 0;
    for (let i = 0; i < 320; i += 1) {
      const response = await getSignals(request(key));
      if (response.status === 429) {
        limited = i + 1;
        expect(await response.json()).toEqual({ error: "rate_limited" });
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limited).toBeGreaterThan(0);

    // The key exhausted its signals bucket only: the fingerprints route has
    // its own per-key budget (and a fresh IP), so it still answers.
    const feed = await getFingerprints(
      new Request("https://asmita.test/api/partner/v1/fingerprints", {
        headers: { authorization: `Bearer ${key}`, "cf-connecting-ip": "198.51.100.9" },
      }),
    );
    expect(feed.status).toBe(200);
  }, 30000);
});

describe("the /signals page, Kysely path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(true);
    mocks.kysely.state.rows = {};
    mocks.kysely.state.calls.length = 0;
  });

  function seedKyselyFeed() {
    mocks.kysely.state.rows.PartnerFeedEvent = [
      { seq: 3, type: "ADD", fingerprintId: "f-3", kind: "image", createdAt: new Date(1_700_000_000_000) },
      { seq: 1, type: "ADD", fingerprintId: "f-1", kind: "image", createdAt: new Date(1_700_000_000_500) },
      { seq: 2, type: "ADD", fingerprintId: "f-2", kind: "image", createdAt: new Date(1_700_000_000_500) },
      { seq: 4, type: "WITHDRAW", fingerprintId: "f-2", kind: "image", createdAt: new Date(1_700_000_001_000) },
    ];
    mocks.kysely.state.rows.HashSubmission = ["f-1", "f-2", "f-3"].map((id) => ({
      id, caseId: "case-1", status: "APPROVED", algorithm: "PDQ", hashEncrypted: encryptField(HEX_A), quality: 100, videoFramesEncrypted: null,
    }));
    mocks.kysely.state.rows.PartnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.kysely.state.rows.Case = [{ id: "case-1", "Case.id": "case-1", referenceNumber: "ASMITA-2026-00001", "User.ageOver18": true }];
  }

  it("pages by the (createdAt, seq) cursor predicate, in order, with the same shareability re-check", async () => {
    seedKyselyFeed();

    const first = await getPartnerSignalPage(null, 2);
    expect(first.records.map((record) => record.id)).toEqual(["f-3", "f-1"]);
    expect(first.has_more).toBe(true);
    const second = await getPartnerSignalPage(parsePartnerSignalCheckpoint(first.checkpoint), 2);
    // The next two raw events are f-2's ADD and f-2's withdrawal: a live
    // record then its explicit tombstone.
    expect(second.records.map((record) => [record.id, record.deleted])).toEqual([["f-2", false], ["f-2", true]]);
    expect(second.has_more).toBe(true);
    const third = await getPartnerSignalPage(parsePartnerSignalCheckpoint(second.checkpoint), 2);
    expect(third.records).toEqual([]);
    expect(third.has_more).toBe(false);

    // The page query: strictly-after the (t, s) pair, ordered by createdAt
    // then seq, capped by the limit — the shape the (createdAt, seq) index serves.
    const pageQueries = mocks.kysely.state.calls.filter((call) => call.table === "PartnerFeedEvent" && call.op === "select");
    expect(pageQueries).toHaveLength(3);
    const firstQuery = pageQueries[0]!;
    expect(firstQuery.detail.orderBys).toEqual(["createdAt", "seq"]);
    expect(firstQuery.detail.limit).toBe(2);
    expect(firstQuery.detail.select).toEqual(["seq", "type", "fingerprintId", "kind", "createdAt"]);
    // The third page carries the second page's last raw pair in its predicate.
    const thirdQuery = pageQueries[2]!;
    expect(thirdQuery.detail.wheres).toEqual([
      {
        kind: "or",
        parts: [
          { kind: "cmp", column: "createdAt", op: ">", value: new Date(1_700_000_001_000) },
          { kind: "and", parts: [
            { kind: "cmp", column: "createdAt", op: "=", value: new Date(1_700_000_001_000) },
            { kind: "cmp", column: "seq", op: ">", value: 4 },
          ] },
        ],
      },
    ]);

    // The shareability re-check is the /fingerprints one: the fingerprint
    // rows, then the live consents, then the adult join to User.ageOver18.
    const hashQuery = mocks.kysely.state.calls.find((call) => call.table === "HashSubmission");
    expect(hashQuery?.detail.wheres).toEqual([["id", "in", ["f-3", "f-1"]]]);
    const consentQuery = mocks.kysely.state.calls.find((call) => call.table === "PartnerShareConsent");
    expect(consentQuery?.detail.wheres).toEqual([["caseId", "in", ["case-1"]], ["withdrawnAt", "is", null]]);
    const adultQuery = mocks.kysely.state.calls.find((call) => call.table === "Case" && call.detail.join === "User");
    expect(adultQuery?.detail.wheres).toEqual([["Case.id", "in", ["case-1"]], ["User.ageOver18", "=", true]]);
  });

  it("looks up the latest event per fingerprint, never by scanning the whole table (WP110 performance fix)", async () => {
    mocks.kysely.state.rows.HashSubmission = [
      { id: "hash-1", caseId: "case-1", status: "APPROVED", algorithm: "PDQ" },
      { id: "hash-2", caseId: "case-1", status: "REJECTED", algorithm: "PDQ" },
    ];
    mocks.kysely.state.rows.PartnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.kysely.state.rows.Case = [{ id: "case-1", "Case.id": "case-1", referenceNumber: "ASMITA-2026-00001", "User.ageOver18": true }];
    mocks.kysely.state.rows.PartnerFeedEvent = [{ fingerprintId: "hash-1", type: "ADD", seq: 1 }];

    const result = await syncPartnerFeedFingerprints(["hash-1", "hash-2"]);
    expect(result).toEqual({ added: 0, withdrawn: 0 });

    const eventQuery = mocks.kysely.state.calls.find((call) => call.table === "PartnerFeedEvent" && call.op === "select");
    expect(eventQuery?.detail.wheres).toEqual([["fingerprintId", "in", ["hash-1", "hash-2"]]]); // indexed, not a full scan
    expect(eventQuery?.detail.orderBys).toEqual(["seq"]);
  });

  it("erasure withdraws per fingerprint too, never by scanning the whole table", async () => {
    mocks.kysely.state.rows.HashSubmission = [{ id: "hash-1", caseId: "case-1", algorithm: "PDQ" }];
    mocks.kysely.state.rows.PartnerFeedEvent = [{ fingerprintId: "hash-1", type: "ADD", seq: 1 }];

    const withdrawn = await withdrawSharedFingerprintsForErasureKysely(
      mocks.kysely.db as unknown as Parameters<typeof withdrawSharedFingerprintsForErasureKysely>[0],
      ["case-1"],
      new Map([["case-1", "ASMITA-2026-00001"]]),
    );
    expect(withdrawn).toBe(1);

    const eventQuery = mocks.kysely.state.calls.find((call) => call.table === "PartnerFeedEvent" && call.op === "select");
    expect(eventQuery?.detail.wheres).toEqual([["fingerprintId", "in", ["hash-1"]]]);
    const insert = mocks.kysely.state.calls.find((call) => call.table === "PartnerFeedEvent" && call.op === "insert");
    expect(insert?.detail.values).toEqual([
      expect.objectContaining({ fingerprintId: "hash-1", type: "WITHDRAW", caseId: "case-1", caseRef: "ASMITA-2026-00001" }),
    ]);
  });
});

describe("the /signals page and key scopes, Prisma path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(false);
    mocks.prisma.state.tables = {};
    mocks.prisma.state.createManyCalls.length = 0;
    mocks.prisma.state.createCalls.length = 0;
    mocks.prisma.state.findManyArgs.length = 0;
  });

  it("pages with the same cursor predicate and order through Prisma", async () => {
    mocks.prisma.state.tables.partnerFeedEvent = [
      { seq: 3, type: "ADD", fingerprintId: "f-3", kind: "image", createdAt: new Date(1_700_000_000_000) },
      { seq: 1, type: "ADD", fingerprintId: "f-1", kind: "image", createdAt: new Date(1_700_000_000_500) },
      { seq: 2, type: "ADD", fingerprintId: "f-2", kind: "image", createdAt: new Date(1_700_000_000_500) },
    ];
    mocks.prisma.state.tables.hashSubmission = ["f-1", "f-2", "f-3"].map((id) => ({
      id, caseId: "case-1", status: "APPROVED", algorithm: "PDQ", hashEncrypted: encryptField(HEX_A), quality: 100, videoFramesEncrypted: null,
    }));
    mocks.prisma.state.tables.partnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.prisma.state.tables.case = [{ id: "case-1", referenceNumber: "ASMITA-2026-00001" }];

    const page = await getPartnerSignalPage(null, 2);
    expect(page.records.map((record) => record.id)).toEqual(["f-3", "f-1"]);
    expect(page.has_more).toBe(true);

    const pageQuery = mocks.prisma.state.findManyArgs.filter((entry) => entry.table === "partnerFeedEvent").at(-1)!;
    expect(pageQuery.args.orderBy).toEqual([{ createdAt: "asc" }, { seq: "asc" }]);
    expect(pageQuery.args.take).toBe(2);
    expect(pageQuery.args.select).toEqual({ seq: true, type: true, fingerprintId: true, kind: true, createdAt: true });
    expect(pageQuery.args.where).toEqual({
      OR: [
        { createdAt: { gt: new Date(0) } },
        { createdAt: new Date(0), seq: { gt: 0 } },
      ],
    });

    // The shareability re-check reads the same three relations.
    const hashQuery = mocks.prisma.state.findManyArgs.filter((entry) => entry.table === "hashSubmission").at(-1)!;
    expect(hashQuery.args.where).toEqual({ id: { in: ["f-3", "f-1"] } });
    expect(hashQuery.args.select).toEqual(
      expect.objectContaining({ id: true, caseId: true, status: true, algorithm: true, hashEncrypted: true, quality: true, videoFramesEncrypted: true }),
    );
    const consentQuery = mocks.prisma.state.findManyArgs.filter((entry) => entry.table === "partnerShareConsent").at(-1)!;
    expect(consentQuery.args.where).toEqual({ caseId: { in: ["case-1"] }, withdrawnAt: null });
  });

  it("stores the issued scopes on a new key (WP110)", async () => {
    const { issuePartnerKey } = await import("@/lib/partner-auth");
    const issued = await issuePartnerKey("partner-1", "feed only", ["feed"]);
    expect(issued.scopes).toEqual(["feed"]);
    const create = mocks.prisma.state.createCalls.find((call) => call.table === "platformPartnerKey");
    expect(create?.data.scopes).toEqual(["feed"]);
  });
});
