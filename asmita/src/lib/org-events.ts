import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";

/*
 * Training and workshop sessions (docs/org/spec.md, WP56). Upcoming
 * published events appear on /training and /get-involved; past ones under
 * 'Past sessions'. Memory fallback like the partner sign-up.
 */

export const ORG_EVENT_MODES = ["ONLINE", "IN_PERSON", "HYBRID"] as const;
export type OrgEventMode = (typeof ORG_EVENT_MODES)[number];

export const ORG_EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export type OrgEventStatus = (typeof ORG_EVENT_STATUSES)[number];

const MAX_MEMORY_EVENTS = 200;

export type OrgEvent = {
  id: string;
  titleEn: string;
  titleHi: string | null;
  startsAt: string;
  endsAt: string | null;
  mode: OrgEventMode;
  city: string | null;
  registrationUrl: string | null;
  descriptionMd: string;
  status: OrgEventStatus;
  createdAt: string;
  updatedAt: string;
};

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const orgEventSchema = z
  .object({
    titleEn: text(2, 160),
    titleHi: text(2, 160).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    mode: z.enum(ORG_EVENT_MODES),
    city: text(2, 80).optional(),
    registrationUrl: z.string().trim().url().max(500).optional(),
    descriptionMd: z.string().trim().min(1).max(20_000),
  })
  .strict()
  .refine((event) => !event.endsAt || new Date(event.endsAt) > new Date(event.startsAt), {
    message: "ends_before_starts",
    path: ["endsAt"],
  });

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Local development and tests without a database keep events here, capped. */
export const orgEvents: OrgEvent[] = [];

function remember(event: OrgEvent) {
  orgEvents.push(event);
  if (orgEvents.length > MAX_MEMORY_EVENTS) {
    orgEvents.splice(0, orgEvents.length - MAX_MEMORY_EVENTS);
  }
}

function rowToEvent(row: Record<string, unknown>): OrgEvent {
  return {
    id: row.id as string,
    titleEn: row.titleEn as string,
    titleHi: (row.titleHi as string | null) ?? null,
    startsAt: new Date(row.startsAt as string).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt as string).toISOString() : null,
    mode: row.mode as OrgEventMode,
    city: (row.city as string | null) ?? null,
    registrationUrl: (row.registrationUrl as string | null) ?? null,
    descriptionMd: row.descriptionMd as string,
    status: row.status as OrgEventStatus,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

export async function createOrgEvent(
  input: z.infer<typeof orgEventSchema>,
  actorId: string,
): Promise<{ ok: true; event: OrgEvent }> {
  const now = new Date().toISOString();
  let event: OrgEvent;
  if (devNoDb()) {
    event = {
      id: randomUUID(),
      titleEn: input.titleEn,
      titleHi: input.titleHi ?? null,
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      mode: input.mode,
      city: input.city ?? null,
      registrationUrl: input.registrationUrl ?? null,
      descriptionMd: input.descriptionMd,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };
    remember(event);
  } else {
    const { db } = await import("@/lib/db");
    event = rowToEvent(
      await db.orgEvent.create({
        data: {
          titleEn: input.titleEn,
          titleHi: input.titleHi ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          mode: input.mode,
          city: input.city ?? null,
          registrationUrl: input.registrationUrl ?? null,
          descriptionMd: input.descriptionMd,
        },
      }),
    );
  }
  await writeAuditLog({
    eventType: "ORG_EVENT_SAVED",
    entityType: "OrgEvent",
    entityId: event.id,
    actorId,
    data: { action: "created", titleEn: event.titleEn, startsAt: event.startsAt },
  });
  return { ok: true, event };
}

export async function updateOrgEvent(
  id: string,
  input: z.infer<typeof orgEventSchema>,
  actorId: string,
): Promise<{ ok: true; event: OrgEvent } | { ok: false; error: "event_not_found" }> {
  const fields = {
    titleEn: input.titleEn,
    titleHi: input.titleHi ?? null,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    mode: input.mode,
    city: input.city ?? null,
    registrationUrl: input.registrationUrl ?? null,
    descriptionMd: input.descriptionMd,
  };
  let event: OrgEvent;
  if (devNoDb()) {
    const current = orgEvents.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "event_not_found" };
    Object.assign(current, fields, { updatedAt: new Date().toISOString() });
    event = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      event = rowToEvent(await db.orgEvent.update({ where: { id }, data: fields }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "event_not_found" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_EVENT_SAVED",
    entityType: "OrgEvent",
    entityId: id,
    actorId,
    data: { action: "updated", titleEn: event.titleEn },
  });
  return { ok: true, event };
}

export async function setOrgEventStatus(
  id: string,
  status: OrgEventStatus,
  actorId: string,
): Promise<{ ok: true; event: OrgEvent } | { ok: false; error: "event_not_found" }> {
  let event: OrgEvent;
  if (devNoDb()) {
    const current = orgEvents.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "event_not_found" };
    current.status = status;
    current.updatedAt = new Date().toISOString();
    event = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      event = rowToEvent(await db.orgEvent.update({ where: { id }, data: { status } }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "event_not_found" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_EVENT_STATUS_CHANGED",
    entityType: "OrgEvent",
    entityId: id,
    actorId,
    data: { status, titleEn: event.titleEn },
  });
  return { ok: true, event };
}

export type OrgEventView = {
  upcoming: OrgEvent[];
  past: OrgEvent[];
};

/** Published events split into upcoming (startsAt in the future) and past. */
export async function listPublicOrgEvents(now = new Date()): Promise<OrgEventView> {
  const published = await listOrgEventsForAdmin({ status: "PUBLISHED" });
  const point = now.getTime();
  const upcoming: OrgEvent[] = [];
  const past: OrgEvent[] = [];
  for (const event of published) {
    (new Date(event.startsAt).getTime() >= point ? upcoming : past).push(event);
  }
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

export async function listOrgEventsForAdmin(options: { status?: OrgEventStatus } = {}): Promise<OrgEvent[]> {
  if (devNoDb()) {
    return orgEvents
      .filter((event) => !options.status || event.status === options.status)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.orgEvent.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: { startsAt: "desc" },
  });
  return rows.map(rowToEvent);
}
