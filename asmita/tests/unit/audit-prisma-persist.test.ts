import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Prisma (Node) path of the audit writer, against a mocked client.
// Prisma rejects a plain `null` for the nullable Json `data` column (it wants
// Prisma.DbNull or the field left out), so a row for an event without data
// must not carry `data: null`. Before the fix every such event threw inside
// createMany and was swallowed by writeAuditLogs' console.error.

const db = vi.hoisted(() => ({
  auditLog: { findFirst: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { writeAuditLogs } from "@/lib/audit";
import { sha256 } from "@/lib/hash";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

beforeEach(() => {
  vi.stubEnv("AUDIT_LOG_PERSISTENCE", "database");
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  db.$executeRawUnsafe.mockResolvedValue(undefined);
  db.auditLog.findFirst.mockResolvedValue({ sequence: 4, eventHash: "previous-hash" });
  // Mirror Prisma's validation: a plain null for a Json? column is refused.
  db.auditLog.createMany.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    for (const row of data) {
      if ("data" in row && row.data === null) throw new Error("Argument data: plain null is not allowed for Json? (use Prisma.DbNull)");
    }
    return { count: data.length };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("audit log, Prisma path", () => {
  it("never sends a plain null data field and keeps the event hashes unchanged", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await writeAuditLogs([
      { eventType: "CASE_CREATED", entityType: "case", entityId: "case-1" },
      { eventType: "ADMIN_ACTION", entityId: "src-1", data: { action: "crawl_source_created" } },
    ]);

    expect(consoleError).not.toHaveBeenCalled();
    expect(db.auditLog.createMany).toHaveBeenCalledTimes(1);
    const rows = db.auditLog.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.data).not.toBeNull();
    expect("data" in rows[0]).toBe(false);
    expect(rows[1].data).toEqual({ action: "crawl_source_created" });

    // The hash is the one the chain validator recomputes: data absent from
    // the first record, present on the second.
    const first = {
      eventType: "CASE_CREATED", entityType: "case", entityId: "case-1",
      sequence: 5, createdAt: (rows[0].createdAt as Date).toISOString(), previousHash: "previous-hash",
    };
    expect(rows[0].eventHash).toBe(sha256(canonicalize(first)));
    const second = {
      eventType: "ADMIN_ACTION", entityId: "src-1", data: { action: "crawl_source_created" },
      sequence: 6, createdAt: (rows[1].createdAt as Date).toISOString(), previousHash: rows[0].eventHash,
    };
    expect(rows[1].eventHash).toBe(sha256(canonicalize(second)));
  });
});
