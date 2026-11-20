import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP30 on the Kysely (Worker) path, against a recording fake in the style of
// the other crawler tests: approving inserts the partner with the
// application's email ciphertext copied as-is, guarded status writes, key
// issue/revoke with the hash only, and the partner-key verification lookups.
// Placeholder rows only.

const kysely = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    // What an update answers from executeTakeFirst: {numUpdatedRows} by
    // default, overridable per table to simulate a guarded write that
    // changed nothing (a concurrent action won the race).
    updateResults: {} as Record<string, { numUpdatedRows: number }>,
  };

  function builder(op: string, table: string, detail: Record<string, unknown>) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "execute") return async () => selectRows(table, detail).map((row) => ({ ...row }));
          if (prop === "executeTakeFirst") {
            return async () => {
              // Updates read numUpdatedRows (my code: Number(result.numUpdatedRows)),
              // unless they asked for the row back (returningAll).
              if (op === "update" && !detail.returningAll) return state.updateResults[table] ?? { numUpdatedRows: 1 };
              return selectRows(table, detail)[0];
            };
          }
          if (prop === "then") return undefined;
          return (...args: unknown[]) => {
            if (prop === "values") detail.values = args[0];
            else if (prop === "set") detail.set = args[0];
            else if (prop === "select") detail.select = args[0];
            else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
            else if (prop === "onConflict") detail.onConflict = true; // the callback never runs in the fake
            else if (prop === "returningAll") detail.returningAll = true;
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  // The rows a select answers, honouring the equality and IN filters the
  // query recorded (the scoped key lookup relies on this).
  function selectRows(table: string, detail: Record<string, unknown>) {
    let rows = state.rows[table] ?? [];
    for (const where of (detail.wheres as unknown[][] | undefined) ?? []) {
      const [column, operator, value] = where as [string, string, unknown];
      if (operator === "=") rows = rows.filter((row) => row[column] === value);
      else if (operator === "in" && Array.isArray(value)) rows = rows.filter((row) => value.includes(row[column]));
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
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => true, getWorkerDb: () => kysely.db }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import {
  actOnPartnerApplication,
  listPlatformPartners,
  recordPartnerCrawlPermission,
  revokePlatformPartnerKey,
  setPlatformPartnerStatus,
  updatePlatformPartner,
} from "@/lib/partner-admin";
import { issuePartnerKey, revokePartnerKey, verifyPartnerKey } from "@/lib/partner-auth";
import { encryptField } from "@/lib/encryption";
import { hashPartnerKey } from "@/lib/partner-auth";
import { inMemoryAuditLog } from "@/lib/audit";

const ACTOR = "admin-1";

function callsOn(table: string) {
  return kysely.state.calls.filter((call) => call.table === table);
}

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    platformName: "ExampleTube",
    websiteDomain: "example-tube.example",
    contactEmail: "CIPHERTEXT-OF-CONTACT",
    status: "NEW",
    ...overrides,
  };
}

function partnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    name: "ExampleTube",
    primaryDomain: "example-tube.example",
    extraDomains: ["cdn.example-tube.example"],
    status: "ACTIVE",
    channelEmailEncrypted: encryptField("notices@example.test"),
    createdFromApplicationId: "app-1",
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date("2026-11-19T08:00:00.000Z"),
    updatedAt: new Date("2026-11-19T08:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  kysely.state.rows = {};
  kysely.state.updateResults = {};
  kysely.state.calls.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("actOnPartnerApplication, Kysely path", () => {
  it("approving inserts the partner with the email ciphertext copied as-is, then flips the application", async () => {
    kysely.state.rows.PlatformPartnerApplication = [applicationRow()];
    // An unrelated partner row: the fake answers the insert's RETURNING from
    // this table, and the ownership check reads its domains first.
    kysely.state.rows.PlatformPartner = [{ id: "p-1", primaryDomain: "unrelated.example", extraDomains: [] }];

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: true, status: "ONBOARDED", partnerId: "p-1" });

    const inserts = callsOn("PlatformPartner").filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].detail.onConflict).toBe(true);
    expect(inserts[0].detail.values).toMatchObject({
      name: "ExampleTube",
      primaryDomain: "example-tube.example",
      extraDomains: [],
      status: "ACTIVE",
      // The application's ciphertext is copied without a decrypt/re-encrypt round trip.
      channelEmailEncrypted: "CIPHERTEXT-OF-CONTACT",
      createdFromApplicationId: "app-1",
    });
    expect(inserts[0].detail.values).toMatchObject({ createdAt: expect.any(Date), updatedAt: expect.any(Date) });

    const updates = callsOn("PlatformPartnerApplication").filter((call) => call.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].detail.set).toEqual({ status: "ONBOARDED" });
    expect((updates[0].detail.wheres as unknown[][])[0]).toEqual(["id", "=", "app-1"]);
    expect((updates[0].detail.wheres as unknown[][])[1]).toEqual(["status", "in", ["NEW", "CONTACTED"]]);

    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_approved");
    expect(inMemoryAuditLog[0].entityId).toBe("p-1");
    expect(inMemoryAuditLog[0].actorId).toBe(ACTOR);
  });

  it("answers partner_exists when the insert conflicts, without flipping the application", async () => {
    kysely.state.rows.PlatformPartnerApplication = [applicationRow()];
    kysely.state.rows.PlatformPartner = []; // ON CONFLICT DO NOTHING: no row back

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "partner_exists" });
    // The status write runs after the insert inside the transaction; on the
    // real database the rollback removes it, so it is never visible.
    expect(kysely.state.updateResults.PlatformPartnerApplication).toBeUndefined();
  });

  it("refuses a domain another partner owns as an extra domain, before any write", async () => {
    // Rule 1: one domain, one partner. The existing partner holds
    // cdn.example-tube.example as an extra domain, so the application for
    // that domain cannot be onboarded, not even with a different primary.
    kysely.state.rows.PlatformPartnerApplication = [applicationRow({ websiteDomain: "cdn.example-tube.example" })];
    kysely.state.rows.PlatformPartner = [partnerRow()];

    const result = await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "partner_exists" });
    expect(callsOn("PlatformPartner").filter((call) => call.op === "insert")).toHaveLength(0);
    expect(callsOn("PlatformPartnerApplication").filter((call) => call.op === "update")).toHaveLength(0);
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("marks contacted with a guarded write, and reports invalid_status when the guard matches nothing", async () => {
    kysely.state.rows.PlatformPartnerApplication = [applicationRow()];
    expect(await actOnPartnerApplication({ applicationId: "app-1", action: "contacted" }, ACTOR)).toEqual({
      ok: true,
      status: "CONTACTED",
    });
    const update = callsOn("PlatformPartnerApplication").find((call) => call.op === "update")!;
    expect(update.detail.set).toEqual({ status: "CONTACTED" });
    expect((update.detail.wheres as unknown[][])[1]).toEqual(["status", "in", ["NEW"]]);
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_application_contacted");

    kysely.state.updateResults.PlatformPartnerApplication = { numUpdatedRows: 0 };
    expect(await actOnPartnerApplication({ applicationId: "app-1", action: "contacted" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_status",
    });

    // A terminal application changes nothing: one read, no writes.
    kysely.state.calls.length = 0;
    kysely.state.rows.PlatformPartnerApplication = [applicationRow({ status: "DECLINED" })];
    expect(await actOnPartnerApplication({ applicationId: "app-1", action: "approve" }, ACTOR)).toEqual({
      ok: false,
      error: "invalid_status",
    });
    expect(callsOn("PlatformPartner")).toHaveLength(0);
    expect(callsOn("PlatformPartnerApplication").filter((call) => call.op === "update")).toHaveLength(0);
  });
});

describe("partner reads and writes, Kysely path", () => {
  it("lists partners with the channel email decrypted", async () => {
    kysely.state.rows.PlatformPartner = [partnerRow()];
    const views = await listPlatformPartners();
    expect(views).toEqual([
      expect.objectContaining({
        id: "p-1",
        primaryDomain: "example-tube.example",
        extraDomains: ["cdn.example-tube.example"],
        status: "ACTIVE",
        channelEmail: "notices@example.test",
      }),
    ]);
  });

  it("refuses a domain another partner owns before any write", async () => {
    kysely.state.rows.PlatformPartner = [
      partnerRow(),
      partnerRow({ id: "p-2", primaryDomain: "taken.example", extraDomains: [] }),
    ];
    const result = await updatePlatformPartner({ partnerId: "p-1", primaryDomain: "taken.example" }, ACTOR);
    expect(result).toEqual({ ok: false, error: "domain_in_use" });
    expect(callsOn("PlatformPartner").filter((call) => call.op === "update")).toHaveLength(0);
  });

  it("writes domain edits and the crawl permission with updatedAt", async () => {
    kysely.state.rows.PlatformPartner = [partnerRow()];

    const edited = await updatePlatformPartner({ partnerId: "p-1", primaryDomain: "new.example" }, ACTOR);
    expect(edited.ok).toBe(true);
    const update = callsOn("PlatformPartner").find((call) => call.op === "update")!;
    expect(update.detail.set).toMatchObject({ primaryDomain: "new.example", updatedAt: expect.any(Date) });

    const permission = await recordPartnerCrawlPermission(
      { partnerId: "p-1", date: "2026-11-18", note: "Email from their DPO, on file" },
      ACTOR,
      new Date("2026-11-19T12:00:00.000Z"),
    );
    expect(permission.ok).toBe(true);
    const last = callsOn("PlatformPartner").filter((call) => call.op === "update").pop()!;
    expect(last.detail.set).toMatchObject({
      crawlPermissionRecordedAt: new Date("2026-11-18T00:00:00.000Z"),
      crawlPermissionRecordedById: ACTOR,
      crawlPermissionNote: "Email from their DPO, on file",
    });

    expect(await recordPartnerCrawlPermission({ partnerId: "p-1", date: "2999-01-01", note: "Not yet" }, ACTOR)).toEqual({
      ok: false,
      error: "future_date",
    });
  });

  it("suspends with a status write and refuses a no-op", async () => {
    kysely.state.rows.PlatformPartner = [partnerRow()];
    const suspended = await setPlatformPartnerStatus({ partnerId: "p-1", status: "SUSPENDED" }, ACTOR);
    expect(suspended.ok).toBe(true);
    expect(callsOn("PlatformPartner").find((call) => call.op === "update")!.detail.set).toMatchObject({
      status: "SUSPENDED",
      updatedAt: expect.any(Date),
    });
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_suspended");

    // The fake does not mutate rows on update: re-seed the suspended state,
    // as the database would now hold it.
    kysely.state.rows.PlatformPartner = [partnerRow({ status: "SUSPENDED" })];
    expect(await setPlatformPartnerStatus({ partnerId: "p-1", status: "SUSPENDED" }, ACTOR)).toEqual({
      ok: false,
      error: "no_change",
    });
    expect(callsOn("PlatformPartner").filter((call) => call.op === "update")).toHaveLength(1);
  });
});

describe("partner keys, Kysely path", () => {
  it("issues a key storing only its hash, and revokes with a guarded write", async () => {
    kysely.state.rows.PlatformPartner = [partnerRow()];

    const issued = await issuePartnerKey("p-1", "Integration key");
    expect(issued.key).toMatch(/^ppk_/);
    const insert = callsOn("PlatformPartnerKey").find((call) => call.op === "insert")!;
    expect(insert.detail.values).toMatchObject({
      partnerId: "p-1",
      keyHash: hashPartnerKey(issued.key),
      label: "Integration key",
    });
    expect(JSON.stringify(insert.detail.values)).not.toContain(issued.key);

    expect(await revokePartnerKey(issued.id)).toBe(true);
    const revoke = callsOn("PlatformPartnerKey").find((call) => call.op === "update")!;
    expect(revoke.detail.set).toMatchObject({ revokedAt: expect.any(Date) });
    expect((revoke.detail.wheres as unknown[][])[0]).toEqual(["id", "=", issued.id]);
    expect((revoke.detail.wheres as unknown[][])[1]).toEqual(["revokedAt", "is", null]);
  });

  it("verifies a key by hash lookup, then the partner's status, and touches lastUsedAt", async () => {
    const key = "ppk_" + "b".repeat(48);
    kysely.state.rows.PlatformPartnerKey = [
      { id: "k-1", partnerId: "p-1", keyHash: hashPartnerKey(key), revokedAt: null },
    ];
    kysely.state.rows.PlatformPartner = [partnerRow()];

    expect(await verifyPartnerKey(key)).toEqual({ ok: true, keyId: "k-1", partnerId: "p-1" });
    const touch = callsOn("PlatformPartnerKey").find((call) => call.op === "update")!;
    expect(touch.detail.set).toMatchObject({ lastUsedAt: expect.any(Date) });

    // Revoked and suspended variants.
    kysely.state.rows.PlatformPartnerKey = [{ id: "k-1", partnerId: "p-1", keyHash: hashPartnerKey(key), revokedAt: new Date() }];
    expect(await verifyPartnerKey(key)).toEqual({ ok: false, reason: "revoked" });
    kysely.state.rows.PlatformPartnerKey = [{ id: "k-1", partnerId: "p-1", keyHash: hashPartnerKey(key), revokedAt: null }];
    kysely.state.rows.PlatformPartner = [partnerRow({ status: "SUSPENDED" })];
    expect(await verifyPartnerKey(key)).toEqual({ ok: false, reason: "suspended" });
    expect(await verifyPartnerKey("ppk_" + "c".repeat(48))).toEqual({ ok: false, reason: "invalid" });
  });

  it("the admin revoke is scoped to the partner's own keys", async () => {
    kysely.state.rows.PlatformPartner = [partnerRow()];
    kysely.state.rows.PlatformPartnerKey = [
      { id: "k-1", partnerId: "p-2", label: "theirs", createdAt: new Date(), revokedAt: null, lastUsedAt: null },
    ];
    expect(await revokePlatformPartnerKey({ partnerId: "p-1", keyId: "k-1" }, ACTOR)).toEqual({
      ok: false,
      error: "key_not_found",
    });
    expect(callsOn("PlatformPartnerKey").filter((call) => call.op === "update")).toHaveLength(0);
  });
});
