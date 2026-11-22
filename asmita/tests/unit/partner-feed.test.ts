import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP32 (partner programme part 2): the partner feed, src/lib/partner-feed.ts
// — the append-only event log behind GET /api/partner/v1/fingerprints. Proves
// Rule 1 (an event carries only the fingerprint id, its kind, the hash while
// shareable, and the case reference), Rule 2 (a fingerprint is shared only
// with a live agreement and an approved status, and every stop — withdrawal,
// rejection, erasure — writes a WITHDRAW), Rule 3 (the adult check at the
// query on the database paths) and the append-only, cursor-driven page.
// Synthetic data only: example case ids and random hex hashes.

const mocks = vi.hoisted(() => {
  // The Kysely recording fake from partner-admin-kysely.test.ts.
  const kysely = (() => {
    const state = {
      rows: {} as Record<string, Array<Record<string, unknown>>>,
      calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    };

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
              else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
              else if (prop === "innerJoin") detail.join = args[0];
              return proxy;
            };
          },
        },
      );
      return proxy;
    }

    function selectRows(table: string, detail: Record<string, unknown>) {
      let rows = state.rows[table] ?? [];
      for (const where of (detail.wheres as unknown[][] | undefined) ?? []) {
        const [column, operator, value] = where as [string, string, unknown];
        if (operator === "=") rows = rows.filter((row) => row[column] === value);
        else if (operator === "in" && Array.isArray(value)) rows = rows.filter((row) => value.includes(row[column]));
        // "is" (null checks) and comparisons like ">" are served unfiltered by
        // this fake; the tests below assert on the recorded query instead.
      }
      return rows;
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

  // A small table fake for the Prisma paths: findMany filters on `in` and
  // equality, createMany records what the sync wrote. findFirst always
  // answers null: in the tick's transaction that is the pre-insert state
  // (no live agreement yet), which is what the flow under test needs.
  const prisma = (() => {
    const state = {
      tables: {} as Record<string, Array<Record<string, unknown>>>,
      createManyCalls: [] as Array<{ table: string; data: unknown }>,
    };
    function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
      return Object.entries(where).every(([key, condition]) => {
        if (key === "user") return true; // the adult filter is asserted via the recorded query
        if (condition && typeof condition === "object" && !Array.isArray(condition)) {
          const c = condition as { in?: unknown[]; not?: null };
          if ("not" in c) return row[key] !== c.not;
          if (c.in) return c.in.includes(row[key]);
          return true;
        }
        return row[key] === condition;
      });
    }
    const delegate = (table: string) => ({
      findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> } = {}) => {
        const rows = (state.tables[table] ?? []).filter((row) => matches(row, where));
        if (!select) return rows.map((row) => ({ ...row }));
        return rows.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
      },
      findFirst: async () => null,
      createMany: async ({ data }: { data: unknown }) => {
        state.createManyCalls.push({ table, data });
        return { count: Array.isArray(data) ? data.length : 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.tables[table] ??= [];
        state.tables[table].push({ id: `${table}-new`, ...data });
        return { id: `${table}-new` };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = (state.tables[table] ?? []).filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    });
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

import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory, type MemoryFingerprint } from "@/lib/crawl-store";
import { encryptField } from "@/lib/encryption";
import {
  feedHashPayload,
  fingerprintWasShared,
  getPartnerFeedPage,
  kindForAlgorithm,
  PARTNER_FEED_MAX_PAGE,
  PARTNER_FEED_SETTLE_SECONDS,
  syncPartnerFeedFingerprint,
  syncPartnerFeedForCase,
} from "@/lib/partner-feed";
import { recordPartnerShareConsent, withdrawPartnerShareConsent } from "@/lib/partner-share-consent";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { cases, deactivateUser, hardDeleteDueUsers, type CaseRecord } from "@/lib/store";
import { templateDigest } from "@/lib/signed-template";

const template = {
  id: "partner-template-1",
  platformId: null,
  templateType: "PARTNER_SHARING_CONSENT",
  subjectTemplate: "Sharing agreement - {{caseReference}}",
  bodyTemplate: "AGREEMENT for {{caseReference}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

/**
 * The feed holds back events younger than PARTNER_FEED_SETTLE_SECONDS; these
 * tests poll right after writing, so they age every memory event past the
 * window first (all by the same amount, so their order is unchanged), as if
 * the partner had polled a minute later.
 */
function settleFeed() {
  for (const event of partnerMemory().feedEvents) {
    event.createdAt = new Date(new Date(event.createdAt).getTime() - (PARTNER_FEED_SETTLE_SECONDS + 1) * 1000);
  }
}

const HEX_A = "ab".repeat(32);
const HEX_B = "cd".repeat(32);

function memoryCase(id: string, referenceNumber: string, userId = "user-1"): CaseRecord {
  return { id, referenceNumber, userId, createdAt: "2026-11-19T00:00:00.000Z", status: "OPEN", urls: [] };
}

function memoryFingerprint(id: string, caseId: string, status: MemoryFingerprint["status"], hash = HEX_A) {
  crawlMemory().fingerprints.set(id, { id, caseId, hashEncrypted: encryptField(hash), quality: 100, status, crawlPoolId: null });
}

async function agree(caseId: string) {
  const saved = await recordPartnerShareConsent({
    caseId,
    hashSubmissionIds: [],
    templateId: template.id,
    templateDigest: templateDigest(template),
  });
  if (!saved.ok) throw new Error(`agree failed: ${JSON.stringify(saved)}`);
}

beforeEach(() => {
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetPartnerMemory();
  resetCrawlMemory();
  cases.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("the feed's event vocabulary", () => {
  it("maps algorithms to kinds and parses stored hash values", () => {
    expect(kindForAlgorithm("PDQ")).toBe("image");
    expect(kindForAlgorithm("vpdq")).toBe("video");
    expect(feedHashPayload("PDQ", HEX_A)).toEqual({ hash: HEX_A });
    expect(feedHashPayload("PDQ", `  ${HEX_A.toUpperCase()}  `)).toEqual({ hash: HEX_A });
    expect(feedHashPayload("PDQ", "not-a-hash")).toBeNull();
    expect(feedHashPayload("PDQ", "data:image/png;base64,AAAA")).toBeNull();
    expect(feedHashPayload("VPDQ", JSON.stringify([HEX_A, HEX_B]))).toEqual({ frames: [HEX_A, HEX_B] });
    expect(feedHashPayload("VPDQ", `${HEX_A},${HEX_B}`)).toEqual({ frames: [HEX_A, HEX_B] });
    expect(feedHashPayload("VPDQ", JSON.stringify([HEX_A, "nope"]))).toBeNull();
    expect(feedHashPayload("VPDQ", JSON.stringify([]))).toBeNull();
  });

  it("caps pages at 500 events", () => {
    expect(PARTNER_FEED_MAX_PAGE).toBe(500);
  });
});

describe("the feed's sync, in-memory store", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));

  it("a tick writes ADD events for the case's approved fingerprints only (Rules 1 and 2)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    cases.set("case-2", memoryCase("case-2", "ASMITA-2026-00002", "user-2"));
    memoryFingerprint("hash-1", "case-1", "APPROVED");
    memoryFingerprint("hash-2", "case-1", "PENDING_REVIEW", HEX_B);
    memoryFingerprint("hash-3", "case-1", "REJECTED", HEX_B);
    memoryFingerprint("hash-4", "case-2", "APPROVED", HEX_B); // another case: no agreement

    await agree("case-1");
    await syncPartnerFeedForCase("case-1"); // the tick's own hook; idempotent

    expect(partnerMemory().feedEvents).toEqual([
      expect.objectContaining({
        fingerprintId: "hash-1", type: "ADD", kind: "image", caseId: "case-1", caseRef: "ASMITA-2026-00001",
      }),
    ]);
    // Rule 1: the stored event carries ids and the reference, never the hash.
    expect(Object.keys(partnerMemory().feedEvents[0]!).sort()).toEqual(
      ["caseId", "caseRef", "createdAt", "fingerprintId", "id", "kind", "seq", "type"],
    );
  });

  it("an approval after the tick adds the fingerprint; a rejection withdraws it (Rule 2)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "PENDING_REVIEW");
    await agree("case-1");
    expect(partnerMemory().feedEvents).toEqual([]); // nothing shareable yet

    crawlMemory().fingerprints.get("hash-1")!.status = "APPROVED";
    await syncPartnerFeedFingerprint("hash-1");
    expect(partnerMemory().feedEvents.map((e) => [e.fingerprintId, e.type])).toEqual([["hash-1", "ADD"]]);

    crawlMemory().fingerprints.get("hash-1")!.status = "REJECTED";
    await syncPartnerFeedFingerprint("hash-1");
    expect(partnerMemory().feedEvents.map((e) => [e.fingerprintId, e.type])).toEqual([["hash-1", "ADD"], ["hash-1", "WITHDRAW"]]);

    // Re-approval shares it again: the log is append-only.
    crawlMemory().fingerprints.get("hash-1")!.status = "APPROVED";
    await syncPartnerFeedFingerprint("hash-1");
    expect(partnerMemory().feedEvents.map((e) => [e.fingerprintId, e.type])).toEqual([
      ["hash-1", "ADD"], ["hash-1", "WITHDRAW"], ["hash-1", "ADD"],
    ]);
  });

  it("a rejection of a never-shared fingerprint writes nothing", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "PENDING_REVIEW");
    await agree("case-1");
    crawlMemory().fingerprints.get("hash-1")!.status = "REJECTED";
    await syncPartnerFeedFingerprint("hash-1");
    expect(partnerMemory().feedEvents).toEqual([]);
  });

  it("withdrawing the agreement withdraws every shared fingerprint, and a new tick re-adds them", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "APPROVED");
    memoryFingerprint("hash-2", "case-1", "DISPATCHED", HEX_B);
    await agree("case-1");
    expect(partnerMemory().feedEvents).toHaveLength(2);

    await withdrawPartnerShareConsent("case-1");
    expect(partnerMemory().feedEvents.map((e) => [e.fingerprintId, e.type])).toEqual([
      ["hash-1", "ADD"], ["hash-2", "ADD"],
      ["hash-1", "WITHDRAW"], ["hash-2", "WITHDRAW"],
    ]);
    expect(await syncPartnerFeedForCase("case-1")).toEqual({ added: 0, withdrawn: 0 }); // idempotent

    await agree("case-1");
    expect(partnerMemory().feedEvents).toHaveLength(6);
  });

  it("serves pages in seq order with nextCursor, to the end", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    cases.set("case-2", memoryCase("case-2", "ASMITA-2026-00002", "user-2"));
    for (let i = 0; i < 5; i += 1) memoryFingerprint(`hash-${i}`, "case-1", "APPROVED", HEX_A);
    memoryFingerprint("hash-9", "case-2", "APPROVED", HEX_B);
    await agree("case-1");
    await agree("case-2");
    expect(partnerMemory().feedEvents).toHaveLength(6);

    settleFeed();
    const first = await getPartnerFeedPage(0, 4);
    expect(first.events).toHaveLength(4);
    expect(first.nextCursor).toBe(first.events[3]!.seq);
    const second = await getPartnerFeedPage(first.nextCursor!, 4);
    expect(second.events).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const walked = [...first.events, ...second.events];
    expect(walked.map((e) => e.seq)).toEqual(partnerMemory().feedEvents.map((e) => e.seq));
    // A cursor at the end answers empty, with no nextCursor.
    settleFeed();
    expect(await getPartnerFeedPage(walked[5]!.seq, 4)).toEqual({ events: [], nextCursor: null });
  });

  it("never serves the hash of a fingerprint that stopped being shareable (Rules 1 and 2)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "APPROVED");
    await agree("case-1");
    await withdrawPartnerShareConsent("case-1");

    // A partner polling from the beginning sees only the WITHDRAW — the ADD
    // is held back, so the withdrawn fingerprint never appears.
    settleFeed();
    const page = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    expect(page.events).toEqual([
      { seq: expect.any(Number), type: "withdraw", fingerprintId: "hash-1", kind: "image", caseRef: "ASMITA-2026-00001" },
    ]);

    // While it is shareable again, the ADD carries the hash and nothing else.
    await agree("case-1");
    settleFeed();
    const live = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    const add = live.events.find((e) => e.type === "add")!;
    expect(add).toEqual({
      seq: expect.any(Number), type: "add", fingerprintId: "hash-1", kind: "image", hash: HEX_A, caseRef: "ASMITA-2026-00001",
    });
    expect(Object.keys(add).sort()).toEqual(["caseRef", "fingerprintId", "hash", "kind", "seq", "type"]);

    // An unreadable stored hash is never served either.
    crawlMemory().fingerprints.get("hash-1")!.hashEncrypted = "not-encrypted";
    settleFeed();
    const broken = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    expect(broken.events.filter((e) => e.type === "add")).toEqual([]);
  });

  it("knows which fingerprint ids it ever shared", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    memoryFingerprint("hash-1", "case-1", "APPROVED");
    await agree("case-1");
    expect(await fingerprintWasShared("hash-1")).toBe(true);
    expect(await fingerprintWasShared("hash-2")).toBe(false);
  });

  it("a video ADD serves its full frame list, not the best-frame hash, frames below the publish quality dropped (WP110)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001"));
    const frames = [
      { hash: HEX_A, quality: 90, t: 0 },
      { hash: HEX_B, quality: 30, t: 1 },
      { hash: "ef".repeat(32), quality: 80, t: 2 },
    ];
    crawlMemory().fingerprints.set("hash-video", {
      id: "hash-video", caseId: "case-1", hashEncrypted: encryptField(HEX_A), quality: 90,
      status: "APPROVED", crawlPoolId: null, algorithm: "VPDQ",
      videoFramesEncrypted: encryptField(JSON.stringify(frames)),
    });
    await agree("case-1");

    settleFeed();
    const page = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    expect(page.events).toEqual([
      { seq: expect.any(Number), type: "add", fingerprintId: "hash-video", kind: "video", frames: [HEX_A, "ef".repeat(32)], caseRef: "ASMITA-2026-00001" },
    ]);

    // Every frame below the publish quality: the ADD is held back entirely.
    crawlMemory().fingerprints.get("hash-video")!.videoFramesEncrypted = encryptField(JSON.stringify([{ hash: HEX_A, quality: 40, t: 0 }]));
    partnerMemory().feedEvents.length = 0; // replay the same ADD against the weaker frames
    partnerMemory().feedEvents.push({ id: "e2", seq: 1, fingerprintId: "hash-video", type: "ADD", kind: "video", caseId: "case-1", caseRef: "ASMITA-2026-00001", createdAt: new Date() });
    settleFeed();
    const weaker = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    expect(weaker.events).toEqual([]);
  });

  it("account erasure withdraws what was shared of hers and drops her outcome rows (Rule 2)", async () => {
    cases.set("case-1", memoryCase("case-1", "ASMITA-2026-00001", "user-erase"));
    memoryFingerprint("hash-1", "case-1", "APPROVED");
    await agree("case-1");
    partnerMemory().outcomes.push({
      id: "po-1", partnerId: "partner-1", fingerprintId: "hash-1", urlEncrypted: "enc", urlHash: "hash",
      submittedUrlId: null, caseId: "case-1", outcome: "REMOVED", note: null, createdAt: new Date(),
    });

    deactivateUser("user-erase");
    // The 30-day sweep (store.hardDeleteDueUsers) runs the erasure hooks even
    // though no withdrawal event was ever written before it: nothing of hers
    // may stay shareable.
    const deleted = await hardDeleteDueUsers(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    expect(deleted).toEqual(["user-erase"]);

    expect(partnerMemory().feedEvents.map((e) => [e.fingerprintId, e.type, e.caseRef])).toEqual([
      ["hash-1", "ADD", "ASMITA-2026-00001"],
      ["hash-1", "WITHDRAW", "ASMITA-2026-00001"],
    ]);
    expect(partnerMemory().outcomes).toEqual([]);
    // The kept fingerprint is no longer shareable: nothing is ever re-added.
    await syncPartnerFeedFingerprint("hash-1");
    expect(partnerMemory().feedEvents).toHaveLength(2);
  });
});

describe("the feed's sync, Prisma path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(false);
    mocks.prisma.state.tables = {};
    mocks.prisma.state.createManyCalls.length = 0;
  });

  it("the tick and its feed events are one transaction: ADDs are written through the tx (Rule 2)", async () => {
    mocks.prisma.state.tables.hashSubmission = [
      { id: "hash-1", caseId: "case-1", status: "APPROVED", algorithm: "PDQ" },
      { id: "hash-2", caseId: "case-1", status: "PENDING_REVIEW", algorithm: "PDQ" },
    ];
    mocks.prisma.state.tables.partnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.prisma.state.tables.case = [{ id: "case-1", referenceNumber: "ASMITA-2026-00001" }];

    const saved = await recordPartnerShareConsent({
      caseId: "case-1", hashSubmissionIds: ["hash-1"], templateId: template.id, templateDigest: templateDigest(template),
    });
    expect(saved.ok).toBe(true);

    const feedWrites = mocks.prisma.state.createManyCalls.filter((call) => call.table === "partnerFeedEvent");
    expect(feedWrites).toHaveLength(1);
    expect(feedWrites[0]!.data).toEqual([
      {
        id: expect.any(String), fingerprintId: "hash-1", type: "ADD", kind: "image",
        caseId: "case-1", caseRef: "ASMITA-2026-00001",
      },
    ]);

    // The adult check is asked at the query, not by filtering afterwards
    // (Rule 3): no adult case row, no feed event.
    mocks.prisma.state.tables.case = [];
    mocks.prisma.state.createManyCalls.length = 0;
    mocks.prisma.state.tables.partnerFeedEvent = [{ fingerprintId: "hash-1", type: "WITHDRAW" }];
    await syncPartnerFeedForCase("case-1");
    expect(mocks.prisma.state.createManyCalls).toEqual([]);
  });

  it("withdrawal writes its WITHDRAWs in the same transaction, and only when something was shared", async () => {
    mocks.prisma.state.tables.hashSubmission = [{ id: "hash-1", caseId: "case-1", status: "APPROVED", algorithm: "PDQ" }];
    mocks.prisma.state.tables.partnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.prisma.state.tables.case = [{ id: "case-1", referenceNumber: "ASMITA-2026-00001" }];
    mocks.prisma.state.tables.partnerFeedEvent = [{ fingerprintId: "hash-1", type: "ADD", seq: 1 }];

    const withdrawn = await withdrawPartnerShareConsent("case-1", "user-1");
    expect(withdrawn).toEqual({ ok: true, consentsWithdrawn: 1 });
    const feedWrites = mocks.prisma.state.createManyCalls.filter((call) => call.table === "partnerFeedEvent");
    expect(feedWrites).toHaveLength(1);
    expect(feedWrites[0]!.data).toEqual([
      {
        id: expect.any(String), fingerprintId: "hash-1", type: "WITHDRAW", kind: "image",
        caseId: "case-1", caseRef: "ASMITA-2026-00001",
      },
    ]);

    // Nothing live to withdraw: no write, no error.
    mocks.prisma.state.tables.partnerShareConsent = [{ caseId: "case-1", withdrawnAt: new Date() }];
    mocks.prisma.state.createManyCalls.length = 0;
    expect(await withdrawPartnerShareConsent("case-1", "user-1")).toEqual({ ok: false, error: "not_agreed" });
    expect(mocks.prisma.state.createManyCalls).toEqual([]);
  });
});

describe("the feed, Kysely path", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(true);
    mocks.kysely.state.rows = {};
    mocks.kysely.state.calls.length = 0;
  });

  it("serves a page with the shareability re-check, video fingerprints as frame lists (Rules 2 and 3 at the query)", async () => {
    mocks.kysely.state.rows.PartnerFeedEvent = [
      { seq: 1, type: "ADD", fingerprintId: "hash-1", kind: "image", caseRef: "ASMITA-2026-00001" },
      { seq: 2, type: "ADD", fingerprintId: "hash-2", kind: "image", caseRef: "ASMITA-2026-00001" },
      { seq: 3, type: "ADD", fingerprintId: "hash-video", kind: "video", caseRef: "ASMITA-2026-00001" },
      { seq: 4, type: "WITHDRAW", fingerprintId: "hash-3", kind: "image", caseRef: "ASMITA-2026-00002" },
    ];
    mocks.kysely.state.rows.HashSubmission = [
      { id: "hash-1", caseId: "case-1", status: "APPROVED", algorithm: "PDQ", hashEncrypted: encryptField(HEX_A), quality: 100, videoFramesEncrypted: null },
      { id: "hash-2", caseId: "case-1", status: "REJECTED", algorithm: "PDQ", hashEncrypted: encryptField(HEX_B), quality: 100, videoFramesEncrypted: null },
      {
        id: "hash-video", caseId: "case-1", status: "APPROVED", algorithm: "VPDQ", hashEncrypted: encryptField(HEX_A), quality: 90,
        // The stored shape since video fingerprints: the full frame list lives
        // in videoFramesEncrypted and hashEncrypted keeps only the best frame.
        videoFramesEncrypted: encryptField(JSON.stringify([
          { hash: HEX_A, quality: 90, t: 0 },
          { hash: HEX_B, quality: 30, t: 1 },
          { hash: "ef".repeat(32), quality: 80, t: 2 },
        ])),
      },
    ];
    mocks.kysely.state.rows.PartnerShareConsent = [{ caseId: "case-1", withdrawnAt: null }];
    mocks.kysely.state.rows.Case = [{ id: "case-1", "Case.id": "case-1", referenceNumber: "ASMITA-2026-00001", "User.ageOver18": true }];

    const page = await getPartnerFeedPage(0, PARTNER_FEED_MAX_PAGE);
    // hash-2 was rejected since its ADD: its event is held back, its hash never served.
    // hash-video serves its full frame list, not the best-frame hash, with the
    // frames below the publish quality dropped (WP110).
    expect(page.events).toEqual([
      { seq: 1, type: "add", fingerprintId: "hash-1", kind: "image", hash: HEX_A, caseRef: "ASMITA-2026-00001" },
      { seq: 3, type: "add", fingerprintId: "hash-video", kind: "video", frames: [HEX_A, "ef".repeat(32)], caseRef: "ASMITA-2026-00001" },
      { seq: 4, type: "withdraw", fingerprintId: "hash-3", kind: "image", caseRef: "ASMITA-2026-00002" },
    ]);

    // The page query is the cursor form (seq > cursor, ordered, limited), and
    // the adult check joins through to User.ageOver18.
    const feedQuery = mocks.kysely.state.calls.find((call) => call.table === "PartnerFeedEvent" && call.op === "select");
    expect(feedQuery?.detail.select).toEqual(["seq", "type", "fingerprintId", "kind", "caseRef"]);
    const adultQuery = mocks.kysely.state.calls.find((call) => call.table === "Case" && call.detail.join === "User");
    expect(adultQuery?.detail.wheres).toEqual([["Case.id", "in", ["case-1"]], ["User.ageOver18", "=", true]]);
  });
});
