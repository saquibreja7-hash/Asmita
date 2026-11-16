import type { AuditEventType } from "@prisma/client";
import { sha256 } from "@/lib/hash";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";

type AuditEvent = {
  eventType: AuditEventType;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  data?: Record<string, unknown>;
  ipHash?: string;
};

type StoredAuditEvent = AuditEvent & {
  sequence: number;
  createdAt: string;
  previousHash: string;
  eventHash: string;
};

// Memory mode only (local development and tests). When persistence is the
// database nothing is appended: a Worker isolate is recycled often, so the
// array would be partial anyway, and it would only grow. Readers use the
// audit_log table instead.
export const inMemoryAuditLog: StoredAuditEvent[] = [];

function persistsToDatabase() {
  return process.env.AUDIT_LOG_PERSISTENCE === "database";
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function writeAuditLog(event: AuditEvent) {
  try {
    if (persistsToDatabase()) {
      await persistAuditLog(event);
    } else {
      const previous = inMemoryAuditLog.at(-1);
      const record = createAuditRecord(event, inMemoryAuditLog.length + 1, previous?.eventHash || "GENESIS");
      const eventHash = sha256(canonicalize(record));
      inMemoryAuditLog.push(Object.freeze({ ...record, eventHash }));
    }
  } catch (err) {
    // Audit logging must never break the victim-facing flow, but a lost
    // entry must never be silent either.
    console.error(`Audit write failed for ${event.eventType}`, err);
  }
}

/**
 * Events for one entity, oldest first. In database mode this reads the newest
 * `limit` rows from audit_log (the in-memory array is empty or partial on a
 * Worker), then returns them in the same chronological order as memory mode.
 * The caller must already have checked that the entity belongs to the user.
 */
export async function readAuditTrail(entityId: string, limit = 200): Promise<Array<Omit<StoredAuditEvent, "eventType"> & { eventType: string }>> {
  if (!persistsToDatabase()) {
    return inMemoryAuditLog.filter((event) => event.entityId === entityId);
  }
  const rows = usesWorkerKysely()
    ? await getWorkerDb().selectFrom("audit_log").selectAll().where("entityId", "=", entityId).orderBy("sequence", "desc").limit(limit).execute()
    : await (await import("@/lib/db")).db.auditLog.findMany({
      where: { entityId },
      orderBy: { sequence: "desc" },
      take: limit,
    });
  return rows.reverse().map((row) => ({
    eventType: row.eventType,
    ...(row.entityType != null ? { entityType: row.entityType } : {}),
    ...(row.entityId != null ? { entityId: row.entityId } : {}),
    ...(row.actorId != null ? { actorId: row.actorId } : {}),
    ...(row.data != null ? { data: row.data as Record<string, unknown> } : {}),
    ...(row.ipHash != null ? { ipHash: row.ipHash } : {}),
    sequence: row.sequence,
    createdAt: row.createdAt.toISOString(),
    previousHash: row.previousHash,
    eventHash: row.eventHash,
  }));
}

export function verifyAuditChain() {
  return inMemoryAuditLog.every((event, index) => {
    const previous = index === 0 ? "GENESIS" : inMemoryAuditLog[index - 1]?.eventHash;
    const { eventHash, ...record } = event;
    return event.previousHash === previous && sha256(canonicalize(record)) === eventHash;
  });
}

export type AuditChainValidation = {
  valid: boolean;
  total: number;
  brokenAt?: {
    sequence: number;
    reason: "missing_previous" | "previous_hash_mismatch" | "event_hash_mismatch";
    expected?: string;
    actual?: string;
  };
};

export async function validateAuditChainFromDb(limit = 10_000): Promise<AuditChainValidation> {
  const rows = usesWorkerKysely()
    ? await getWorkerDb().selectFrom("audit_log").selectAll().orderBy("sequence", "asc").limit(limit).execute()
    : await (await import("@/lib/db")).db.auditLog.findMany({
    orderBy: { sequence: "asc" },
    take: limit,
    select: {
      sequence: true,
      eventType: true,
      entityType: true,
      entityId: true,
      actorId: true,
      data: true,
      ipHash: true,
      previousHash: true,
      eventHash: true,
      createdAt: true,
    },
    });

  let previousHash = "GENESIS";
  let expectedSequence = 1;

  for (const row of rows) {
    if (row.sequence !== expectedSequence) {
      return {
        valid: false,
        total: rows.length,
        brokenAt: {
          sequence: row.sequence,
          reason: "missing_previous",
          expected: String(expectedSequence),
          actual: String(row.sequence),
        },
      };
    }
    if (row.previousHash !== previousHash) {
      return {
        valid: false,
        total: rows.length,
        brokenAt: {
          sequence: row.sequence,
          reason: "previous_hash_mismatch",
          expected: previousHash,
          actual: row.previousHash,
        },
      };
    }
    // Reconstruct exactly as the writer does: spread only the fields that were
    // present in the original AuditEvent (optional fields are omitted when absent,
    // not set to undefined — undefined keys serialize differently in canonicalize).
    const hashInput: Record<string, unknown> = {
      eventType: row.eventType,
      sequence: row.sequence,
      createdAt: row.createdAt.toISOString(),
      previousHash: row.previousHash,
    };
    if (row.entityType != null) hashInput.entityType = row.entityType;
    if (row.entityId != null) hashInput.entityId = row.entityId;
    if (row.actorId != null) hashInput.actorId = row.actorId;
    if (row.data != null) hashInput.data = row.data;
    if (row.ipHash != null) hashInput.ipHash = row.ipHash;
    const recomputed = sha256(canonicalize(hashInput));
    if (recomputed !== row.eventHash) {
      return {
        valid: false,
        total: rows.length,
        brokenAt: {
          sequence: row.sequence,
          reason: "event_hash_mismatch",
          expected: recomputed,
          actual: row.eventHash,
        },
      };
    }
    previousHash = row.eventHash;
    expectedSequence += 1;
  }

  return { valid: true, total: rows.length };
}

function createAuditRecord(event: AuditEvent, sequence: number, previousHash: string) {
  return {
    ...event,
    sequence,
    createdAt: new Date().toISOString(),
    previousHash,
  };
}

async function persistAuditLog(event: AuditEvent) {
  if (usesWorkerKysely()) {
    await getWorkerDb().transaction().execute(async (tx) => {
      await sql`LOCK TABLE "audit_log" IN EXCLUSIVE MODE`.execute(tx);
      const previous = await tx.selectFrom("audit_log").select(["sequence", "eventHash"]).orderBy("sequence", "desc").executeTakeFirst();
      const record = createAuditRecord(event, (previous?.sequence || 0) + 1, previous?.eventHash || "GENESIS");
      await tx.insertInto("audit_log").values({
        id: randomUUID(), sequence: record.sequence, eventType: event.eventType, entityType: event.entityType ?? null,
        entityId: event.entityId ?? null, actorId: event.actorId ?? null, data: event.data ?? null, ipHash: event.ipHash ?? null,
        previousHash: record.previousHash, eventHash: sha256(canonicalize(record)), createdAt: new Date(record.createdAt),
      }).execute();
    });
    return;
  }
  const { db } = await import("@/lib/db");
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE "audit_log" IN EXCLUSIVE MODE');
    const previous = await tx.auditLog.findFirst({
      orderBy: { sequence: "desc" },
      select: { sequence: true, eventHash: true },
    });
    const record = createAuditRecord(event, (previous?.sequence || 0) + 1, previous?.eventHash || "GENESIS");
    const eventHash = sha256(canonicalize(record));
    await tx.auditLog.create({
      data: {
        ...event,
        sequence: record.sequence,
        previousHash: record.previousHash,
        eventHash,
        createdAt: new Date(record.createdAt),
        data: event.data as never,
      },
    });
  });
}
