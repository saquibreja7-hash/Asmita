import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  LAB_SERVICE_KINDS,
  LAB_SERVICE_STATUSES,
  isoDate,
  labMemory,
  type LabServiceKind,
  type LabServiceStatus,
  type LabUrlStatus,
  type MemoryLabService,
} from "@/lib/lab/lab-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * E2 (docs/lab/charter.md): the nudify-service map. LabService rows and the
 * admin route over them. Real names and URLs live in the database only;
 * audit entries carry ids and counts, never a name or address.
 *
 * Triple backend like every lab module: memory when no database is
 * configured (dev and tests), Kysely on the Worker, Prisma on Node.
 */

const SERVICE_COLUMNS = [
  "id", "name", "kind", "urls", "status", "urlStatuses", "downSince", "firstSeenAt", "lastCheckedAt", "notes",
] as const;

export type LabServiceView = {
  id: string;
  name: string;
  kind: LabServiceKind;
  urls: string[];
  status: LabServiceStatus;
  urlStatuses: LabUrlStatus[] | null;
  downSince: string | null;
  firstSeenAt: string;
  lastCheckedAt: string | null;
  notes: string | null;
};

type ServiceRow = {
  id: string;
  name: string;
  kind: LabServiceKind;
  urls: string[] | null;
  status: LabServiceStatus | null;
  urlStatuses: unknown;
  downSince: Date | string | null;
  firstSeenAt: Date | string;
  lastCheckedAt: Date | string | null;
  notes: string | null;
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

const urlStatusSchema = z.array(
  z.object({ url: z.string().min(1).max(2000), up: z.boolean(), checkedAt: z.string().min(1) }).strict(),
);

/** The urlStatuses column is JSON in the database; a malformed value reads as none. */
export function parseUrlStatuses(value: unknown): LabUrlStatus[] | null {
  const parsed = urlStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toServiceView(row: ServiceRow): LabServiceView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    urls: row.urls ?? [],
    status: row.status ?? "UNKNOWN",
    urlStatuses: parseUrlStatuses(row.urlStatuses),
    downSince: isoDate(row.downSince),
    firstSeenAt: isoDate(row.firstSeenAt) ?? new Date().toISOString(),
    lastCheckedAt: isoDate(row.lastCheckedAt),
    notes: row.notes,
  };
}

/** A public http(s) address, without credentials. Invented hosts only in tests (example.test). */
export const labUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (parsed.username || parsed.password) return false;
      return parsed.hostname.includes(".");
    } catch {
      return false;
    }
  }, "not_a_public_http_url");

export const labServiceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(LAB_SERVICE_KINDS),
    urls: z.array(labUrlSchema).min(1).max(20),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const labServiceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(LAB_SERVICE_KINDS).optional(),
    urls: z.array(labUrlSchema).min(1).max(20).optional(),
    status: z.enum(LAB_SERVICE_STATUSES).optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "empty_update");

export type LabServiceInput = z.infer<typeof labServiceInputSchema>;
export type LabServiceUpdate = z.infer<typeof labServiceUpdateSchema>;

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.map((url) => url.trim()))];
}

export async function listLabServices(): Promise<LabServiceView[]> {
  let rows: ServiceRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().services.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabService").select([...SERVICE_COLUMNS]).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labService.findMany();
  }
  return rows.map(toServiceView).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLabService(id: string): Promise<LabServiceView | null> {
  const services = await listLabServices();
  return services.find((service) => service.id === id) ?? null;
}

export async function createLabService(
  input: LabServiceInput,
  actorId: string,
): Promise<{ ok: true; service: LabServiceView } | { ok: false; error: "invalid_payload" }> {
  const parsed = labServiceInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const urls = dedupe(data.urls);
  const now = new Date();
  let view: LabServiceView;
  if (isDevNoDb()) {
    const row: MemoryLabService = {
      id: randomUUID(),
      name: data.name,
      kind: data.kind,
      urls,
      status: "UNKNOWN",
      urlStatuses: null,
      downSince: null,
      firstSeenAt: now,
      lastCheckedAt: null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    labMemory().services.set(row.id, row);
    view = toServiceView(row);
  } else if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabService")
      .values({
        id: randomUUID(), name: data.name, kind: data.kind, urls,
        status: "UNKNOWN", urlStatuses: null, downSince: null,
        firstSeenAt: now, lastCheckedAt: null, notes: data.notes ?? null,
        createdAt: now, updatedAt: now,
      })
      .returning([...SERVICE_COLUMNS])
      .executeTakeFirstOrThrow();
    view = toServiceView(inserted);
  } else {
    const { db } = await import("@/lib/db");
    const created = await db.labService.create({
      data: { name: data.name, kind: data.kind, urls, notes: data.notes ?? null },
    });
    view = toServiceView(created);
  }
  await writeAuditLog({
    eventType: "LAB_SERVICE_CREATED",
    entityType: "LabService",
    entityId: view.id,
    actorId,
    data: { kind: view.kind, urlCount: urls.length },
  });
  return { ok: true, service: view };
}

export async function updateLabService(
  id: string,
  patch: LabServiceUpdate,
  actorId: string,
): Promise<{ ok: true; service: LabServiceView } | { ok: false; error: "invalid_payload" | "service_not_found" }> {
  const parsed = labServiceUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const changed = Object.keys(data) as Array<keyof typeof data>;
  if (changed.length === 0) return { ok: false, error: "invalid_payload" };
  const now = new Date();
  const values = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.kind !== undefined ? { kind: data.kind } : {}),
    ...(data.urls !== undefined ? { urls: dedupe(data.urls) } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    updatedAt: now,
  };
  let view: LabServiceView | null = null;
  if (isDevNoDb()) {
    const row = labMemory().services.get(id);
    if (row) {
      Object.assign(row, values);
      view = toServiceView(row);
    }
  } else if (usesWorkerKysely()) {
    const updated = await getWorkerDb().updateTable("LabService")
      .set(values)
      .where("id", "=", id)
      .returning([...SERVICE_COLUMNS])
      .executeTakeFirst();
    if (updated) view = toServiceView(updated);
  } else {
    const { db } = await import("@/lib/db");
    try {
      view = toServiceView(await db.labService.update({ where: { id }, data: values }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "service_not_found" };
      throw err;
    }
  }
  if (!view) return { ok: false, error: "service_not_found" };
  await writeAuditLog({
    eventType: "LAB_SERVICE_UPDATED",
    entityType: "LabService",
    entityId: id,
    actorId,
    data: { fields: changed },
  });
  return { ok: true, service: view };
}

/**
 * Writes one liveness pass for one service (lab-liveness.ts): the per-URL
 * results, the derived status (up if any URL answered, down if none did),
 * and downSince, which records the first time every URL was down and is
 * cleared as soon as one answers again. Not audited per service: the run
 * itself gets one LAB_LIVENESS_RUN entry with counts.
 */
export async function recordLabLiveness(
  serviceId: string,
  statuses: LabUrlStatus[],
  now: Date,
): Promise<LabServiceView | null> {
  const up = statuses.some((status) => status.up);
  const previous = await getLabService(serviceId);
  const downSince = up ? null : previous?.downSince ? new Date(previous.downSince) : now;
  const status: LabServiceStatus = up ? "ACTIVE" : "DOWN";
  const values = {
    urlStatuses: statuses,
    status,
    lastCheckedAt: now,
    downSince,
    updatedAt: now,
  };
  if (isDevNoDb()) {
    const row = labMemory().services.get(serviceId);
    if (!row) return null;
    Object.assign(row, values);
    return toServiceView(row);
  }
  if (usesWorkerKysely()) {
    const updated = await getWorkerDb().updateTable("LabService")
      .set(values)
      .where("id", "=", serviceId)
      .returning([...SERVICE_COLUMNS])
      .executeTakeFirst();
    return updated ? toServiceView(updated) : null;
  }
  const { db } = await import("@/lib/db");
  try {
    return toServiceView(await db.labService.update({ where: { id: serviceId }, data: values }));
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return null;
    throw err;
  }
}
