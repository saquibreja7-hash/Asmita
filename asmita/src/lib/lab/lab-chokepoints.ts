import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { isoDate, LAB_CHOKEPOINT_KINDS, labMemory, type LabChokepointKind, type LabServiceKind, type MemoryLabChokepoint } from "@/lib/lab/lab-store";
import { listLabServices } from "@/lib/lab/lab-services";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * E2 (docs/lab/charter.md): the companies a tracked service depends on —
 * host, CDN, registrar, payment processor, app store, ad network or the
 * platform an account runs on — each with the abuse contact an analyst
 * copied from that provider's own abuse page, and evidence notes.
 */

const CHOKEPOINT_COLUMNS = ["id", "serviceId", "kind", "provider", "abuseContact", "evidenceNotes", "createdAt", "updatedAt"] as const;

export type LabChokepointView = {
  id: string;
  serviceId: string;
  /** The service's name, joined in for the console list. */
  serviceName: string;
  kind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  evidenceNotes: string | null;
  createdAt: string;
};

/** A chokepoint with its service, as the report drafting flow needs it. */
export type LabChokepointWithService = LabChokepointView & {
  service: { name: string; kind: LabServiceKind; urls: string[] };
};

type ChokepointRow = Omit<LabChokepointView, "createdAt" | "serviceName"> & { createdAt: Date | string };

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export const labChokepointInputSchema = z
  .object({
    serviceId: z.string().min(1).max(64),
    kind: z.enum(LAB_CHOKEPOINT_KINDS),
    provider: z.string().trim().min(1).max(200),
    abuseContact: z.string().trim().min(1).max(500),
    evidenceNotes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const labChokepointUpdateSchema = z
  .object({
    kind: z.enum(LAB_CHOKEPOINT_KINDS).optional(),
    provider: z.string().trim().min(1).max(200).optional(),
    abuseContact: z.string().trim().min(1).max(500).optional(),
    evidenceNotes: z.string().max(5000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "empty_update");

export type LabChokepointInput = z.infer<typeof labChokepointInputSchema>;
export type LabChokepointUpdate = z.infer<typeof labChokepointUpdateSchema>;

function toView(row: ChokepointRow, serviceName: string): LabChokepointView {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceName,
    kind: row.kind,
    provider: row.provider,
    abuseContact: row.abuseContact,
    evidenceNotes: row.evidenceNotes,
    createdAt: isoDate(row.createdAt) ?? new Date().toISOString(),
  };
}

async function serviceNameFor(serviceId: string): Promise<string> {
  const services = await listLabServices();
  return services.find((service) => service.id === serviceId)?.name ?? "—";
}

export async function listLabChokepoints(): Promise<LabChokepointView[]> {
  let rows: ChokepointRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().chokepoints.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabChokepoint").select([...CHOKEPOINT_COLUMNS]).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labChokepoint.findMany();
  }
  const names = new Map((await listLabServices()).map((service) => [service.id, service.name]));
  return rows
    .map((row) => toView(row, names.get(row.serviceId) ?? "—"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getLabChokepoint(id: string): Promise<LabChokepointWithService | null> {
  const chokepoints = await listLabChokepoints();
  const chokepoint = chokepoints.find((entry) => entry.id === id);
  if (!chokepoint) return null;
  const service = (await listLabServices()).find((entry) => entry.id === chokepoint.serviceId);
  if (!service) return null;
  return { ...chokepoint, service: { name: service.name, kind: service.kind, urls: service.urls } };
}

export async function createLabChokepoint(
  input: LabChokepointInput,
  actorId: string,
): Promise<{ ok: true; chokepoint: LabChokepointView } | { ok: false; error: "invalid_payload" | "service_not_found" }> {
  const parsed = labChokepointInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const service = (await listLabServices()).find((entry) => entry.id === data.serviceId);
  if (!service) return { ok: false, error: "service_not_found" };
  const now = new Date();
  const values = {
    kind: data.kind,
    provider: data.provider,
    abuseContact: data.abuseContact,
    evidenceNotes: data.evidenceNotes ?? null,
    updatedAt: now,
  };
  let view: LabChokepointView;
  if (isDevNoDb()) {
    const row: MemoryLabChokepoint = { id: randomUUID(), serviceId: data.serviceId, createdAt: now, ...values };
    labMemory().chokepoints.set(row.id, row);
    view = toView(row, service.name);
  } else if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabChokepoint")
      .values({ id: randomUUID(), serviceId: data.serviceId, createdAt: now, ...values })
      .returning([...CHOKEPOINT_COLUMNS])
      .executeTakeFirstOrThrow();
    view = toView(inserted, service.name);
  } else {
    const { db } = await import("@/lib/db");
    const created = await db.labChokepoint.create({
      data: { serviceId: data.serviceId, kind: data.kind, provider: data.provider, abuseContact: data.abuseContact, evidenceNotes: data.evidenceNotes ?? null },
    });
    view = toView(created, service.name);
  }
  await writeAuditLog({
    eventType: "LAB_CHOKEPOINT_CREATED",
    entityType: "LabChokepoint",
    entityId: view.id,
    actorId,
    data: { kind: view.kind, serviceId: view.serviceId },
  });
  return { ok: true, chokepoint: view };
}

export async function updateLabChokepoint(
  id: string,
  patch: LabChokepointUpdate,
  actorId: string,
): Promise<{ ok: true; chokepoint: LabChokepointView } | { ok: false; error: "invalid_payload" | "chokepoint_not_found" }> {
  const parsed = labChokepointUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const changed = Object.keys(data) as Array<keyof typeof data>;
  if (changed.length === 0) return { ok: false, error: "invalid_payload" };
  const now = new Date();
  const values = {
    ...(data.kind !== undefined ? { kind: data.kind } : {}),
    ...(data.provider !== undefined ? { provider: data.provider } : {}),
    ...(data.abuseContact !== undefined ? { abuseContact: data.abuseContact } : {}),
    ...(data.evidenceNotes !== undefined ? { evidenceNotes: data.evidenceNotes } : {}),
    updatedAt: now,
  };
  let updated: ChokepointRow | null = null;
  if (isDevNoDb()) {
    updated = labMemory().chokepoints.get(id) ?? null;
    if (updated) Object.assign(updated, values);
  } else if (usesWorkerKysely()) {
    updated = (await getWorkerDb().updateTable("LabChokepoint")
      .set(values)
      .where("id", "=", id)
      .returning([...CHOKEPOINT_COLUMNS])
      .executeTakeFirst()) ?? null;
  } else {
    const { db } = await import("@/lib/db");
    try {
      updated = await db.labChokepoint.update({ where: { id }, data: values });
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "chokepoint_not_found" };
      throw err;
    }
  }
  if (!updated) return { ok: false, error: "chokepoint_not_found" };
  const view = toView(updated, await serviceNameFor(updated.serviceId));
  await writeAuditLog({
    eventType: "LAB_CHOKEPOINT_UPDATED",
    entityType: "LabChokepoint",
    entityId: id,
    actorId,
    data: { fields: changed },
  });
  return { ok: true, chokepoint: view };
}
