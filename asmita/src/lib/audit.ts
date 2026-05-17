import type { AuditEventType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/hash";

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

export const inMemoryAuditLog: StoredAuditEvent[] = [];

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
    const previous = inMemoryAuditLog.at(-1);
    const record = createAuditRecord(event, inMemoryAuditLog.length + 1, previous?.eventHash || "GENESIS");
    const eventHash = sha256(canonicalize(record));
    inMemoryAuditLog.push(Object.freeze({ ...record, eventHash }));
    if (process.env.AUDIT_LOG_PERSISTENCE === "database") {
      await persistAuditLog(event);
    }
  } catch {
    // Audit logging must never break the victim-facing flow.
  }
}

export function readAuditTrail(entityId: string) {
  return inMemoryAuditLog.filter((event) => event.entityId === entityId);
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
  const rows = await db.auditLog.findMany({
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
    const recomputed = sha256(
      canonicalize({
        eventType: row.eventType,
        entityType: row.entityType ?? undefined,
        entityId: row.entityId ?? undefined,
        actorId: row.actorId ?? undefined,
        data: row.data ?? undefined,
        ipHash: row.ipHash ?? undefined,
        sequence: row.sequence,
        createdAt: row.createdAt.toISOString(),
        previousHash: row.previousHash,
      }),
    );
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
        data: event.data as Prisma.InputJsonValue | undefined,
      },
    });
  });
}
