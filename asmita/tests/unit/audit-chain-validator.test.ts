import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { auditLog: { findMany: vi.fn() } },
}));

import { db } from "@/lib/db";
import { validateAuditChainFromDb } from "@/lib/audit";
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

type EventInput = {
  sequence: number;
  eventType: string;
  entityId?: string;
  createdAt: string;
  previousHash: string;
  data?: Record<string, unknown>;
};

function buildEvent(input: EventInput) {
  // Mirror createAuditRecord's spread behavior: only include optional fields
  // when they have real values (undefined keys serialize differently).
  const record: Record<string, unknown> = {
    eventType: input.eventType,
    sequence: input.sequence,
    createdAt: input.createdAt,
    previousHash: input.previousHash,
  };
  if (input.entityId != null) record.entityId = input.entityId;
  if (input.data != null) record.data = input.data;
  const eventHash = sha256(canonicalize(record));
  return {
    sequence: input.sequence,
    eventType: input.eventType,
    entityType: null,
    entityId: input.entityId ?? null,
    actorId: null,
    data: input.data ?? null,
    ipHash: null,
    previousHash: input.previousHash,
    eventHash,
    createdAt: new Date(input.createdAt),
  };
}

function buildValidChain(length: number) {
  const events = [];
  let previousHash = "GENESIS";
  for (let i = 1; i <= length; i += 1) {
    const event = buildEvent({
      sequence: i,
      eventType: "URL_SUBMITTED",
      entityId: `url-${i}`,
      createdAt: `2026-05-${10 + i}T00:00:00.000Z`,
      previousHash,
    });
    events.push(event);
    previousHash = event.eventHash;
  }
  return events;
}

describe("validateAuditChainFromDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid for an empty chain", async () => {
    vi.mocked(db.auditLog.findMany).mockResolvedValue([] as never);
    const result = await validateAuditChainFromDb();
    expect(result).toEqual({ valid: true, total: 0 });
  });

  it("validates a clean 3-event chain", async () => {
    const chain = buildValidChain(3);
    vi.mocked(db.auditLog.findMany).mockResolvedValue(chain as never);
    const result = await validateAuditChainFromDb();
    expect(result).toEqual({ valid: true, total: 3 });
  });

  it("detects a missing sequence (gap)", async () => {
    const chain = buildValidChain(3);
    const corrupted = [chain[0], chain[2]]; // skip seq 2
    vi.mocked(db.auditLog.findMany).mockResolvedValue(corrupted as never);
    const result = await validateAuditChainFromDb();
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toBe("missing_previous");
    expect(result.brokenAt?.sequence).toBe(3);
  });

  it("detects a tampered previousHash", async () => {
    const chain = buildValidChain(3);
    chain[2] = { ...chain[2], previousHash: "TAMPERED" };
    vi.mocked(db.auditLog.findMany).mockResolvedValue(chain as never);
    const result = await validateAuditChainFromDb();
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toBe("previous_hash_mismatch");
    expect(result.brokenAt?.sequence).toBe(3);
  });

  it("detects a tampered event body that doesn't match its eventHash", async () => {
    const chain = buildValidChain(3);
    chain[1] = { ...chain[1], entityId: "tampered-id" };
    vi.mocked(db.auditLog.findMany).mockResolvedValue(chain as never);
    const result = await validateAuditChainFromDb();
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toBe("event_hash_mismatch");
    expect(result.brokenAt?.sequence).toBe(2);
  });
});
