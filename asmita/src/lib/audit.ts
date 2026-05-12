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
