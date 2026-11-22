import { randomUUID } from "node:crypto";
import { z } from "zod";
import { safeLink } from "@/lib/safe-link";
import { writeAuditLog } from "@/lib/audit";

/*
 * Organization partners (docs/org/spec.md, WP57): the 'Current partners'
 * list on /partners and, when any are public, the Supporters strip.
 * Admin-managed only — partners are never created by the public. Memory
 * fallback like the partner sign-up.
 */

export const ORG_PARTNER_TYPES = ["NGO", "LEGAL", "LAW_ENFORCEMENT", "ACADEMIC", "PLATFORM"] as const;
export type OrgPartnerType = (typeof ORG_PARTNER_TYPES)[number];

const MAX_MEMORY_PARTNERS = 200;

export type OrgPartner = {
  id: string;
  name: string;
  type: OrgPartnerType;
  /** A file under public/partners/ that the owner adds, e.g. "/partners/x.svg". */
  logoPath: string | null;
  url: string | null;
  blurbEn: string;
  blurbHi: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

// Logo files live under public/partners/ on this site; nothing remote.
const logoPath = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/partners\/[a-z0-9][a-z0-9-_.]*\.(svg|png|webp|jpg)$/i, "logo_path");

export const orgPartnerSchema = z
  .object({
    name: text(2, 120),
    type: z.enum(ORG_PARTNER_TYPES),
    logoPath: logoPath.optional(),
    url: safeLink(300).optional(),
    blurbEn: text(2, 400),
    blurbHi: text(2, 400).optional(),
  })
  .strict();

export const orgPartnerReorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).strict();

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Local development and tests without a database keep partners here, capped. */
export const orgPartners: OrgPartner[] = [];

function remember(partner: OrgPartner) {
  orgPartners.push(partner);
  if (orgPartners.length > MAX_MEMORY_PARTNERS) {
    orgPartners.splice(0, orgPartners.length - MAX_MEMORY_PARTNERS);
  }
}

function rowToPartner(row: Record<string, unknown>): OrgPartner {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as OrgPartnerType,
    logoPath: (row.logoPath as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    blurbEn: row.blurbEn as string,
    blurbHi: (row.blurbHi as string | null) ?? null,
    isPublic: Boolean(row.isPublic),
    sortOrder: row.sortOrder as number,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

function nextSortOrder(): number {
  const highest = orgPartners.reduce((max, partner) => Math.max(max, partner.sortOrder), 0);
  return highest + 1;
}

export async function createOrgPartner(
  input: z.infer<typeof orgPartnerSchema>,
  actorId: string,
): Promise<{ ok: true; partner: OrgPartner }> {
  const now = new Date().toISOString();
  let partner: OrgPartner;
  if (devNoDb()) {
    partner = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      logoPath: input.logoPath ?? null,
      url: input.url ?? null,
      blurbEn: input.blurbEn,
      blurbHi: input.blurbHi ?? null,
      isPublic: false,
      sortOrder: nextSortOrder(),
      createdAt: now,
      updatedAt: now,
    };
    remember(partner);
  } else {
    const { db } = await import("@/lib/db");
    partner = rowToPartner(
      await db.orgPartner.create({
        data: {
          name: input.name,
          type: input.type,
          logoPath: input.logoPath ?? null,
          url: input.url ?? null,
          blurbEn: input.blurbEn,
          blurbHi: input.blurbHi ?? null,
          isPublic: false,
        },
      }),
    );
  }
  await writeAuditLog({
    eventType: "ORG_PARTNER_SAVED",
    entityType: "OrgPartner",
    entityId: partner.id,
    actorId,
    data: { action: "created", name: partner.name, type: partner.type },
  });
  return { ok: true, partner };
}

export async function updateOrgPartner(
  id: string,
  input: z.infer<typeof orgPartnerSchema>,
  actorId: string,
): Promise<{ ok: true; partner: OrgPartner } | { ok: false; error: "partner_not_found" }> {
  const fields = {
    name: input.name,
    type: input.type,
    logoPath: input.logoPath ?? null,
    url: input.url ?? null,
    blurbEn: input.blurbEn,
    blurbHi: input.blurbHi ?? null,
  };
  let partner: OrgPartner;
  if (devNoDb()) {
    const current = orgPartners.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "partner_not_found" };
    Object.assign(current, fields, { updatedAt: new Date().toISOString() });
    partner = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      partner = rowToPartner(await db.orgPartner.update({ where: { id }, data: fields }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "partner_not_found" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_PARTNER_SAVED",
    entityType: "OrgPartner",
    entityId: id,
    actorId,
    data: { action: "updated", name: partner.name, type: partner.type },
  });
  return { ok: true, partner };
}

export async function setOrgPartnerVisibility(
  id: string,
  isPublic: boolean,
  actorId: string,
): Promise<{ ok: true; partner: OrgPartner } | { ok: false; error: "partner_not_found" }> {
  let partner: OrgPartner;
  if (devNoDb()) {
    const current = orgPartners.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "partner_not_found" };
    current.isPublic = isPublic;
    current.updatedAt = new Date().toISOString();
    partner = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      partner = rowToPartner(await db.orgPartner.update({ where: { id }, data: { isPublic } }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "partner_not_found" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_PARTNER_VISIBILITY_CHANGED",
    entityType: "OrgPartner",
    entityId: id,
    actorId,
    data: { isPublic, name: partner.name },
  });
  return { ok: true, partner };
}

/** Set the full display order; ids list every partner in its new order. */
export async function reorderOrgPartners(
  ids: string[],
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: "partner_not_found" }> {
  if (devNoDb()) {
    const byId = new Map(orgPartners.map((partner) => [partner.id, partner]));
    const missing = ids.some((id) => !byId.has(id));
    if (missing) return { ok: false, error: "partner_not_found" };
    ids.forEach((id, index) => {
      const partner = byId.get(id)!;
      partner.sortOrder = index + 1;
      partner.updatedAt = new Date().toISOString();
    });
  } else {
    const { db } = await import("@/lib/db");
    const existing = await db.orgPartner.findMany({ select: { id: true } });
    const known = new Set(existing.map((row) => row.id));
    if (ids.some((id) => !known.has(id))) return { ok: false, error: "partner_not_found" };
    await db.$transaction(
      ids.map((id, index) => db.orgPartner.update({ where: { id }, data: { sortOrder: index + 1 } })),
    );
  }
  await writeAuditLog({
    eventType: "ORG_PARTNER_REORDERED",
    entityType: "OrgPartner",
    actorId,
    data: { count: ids.length },
  });
  return { ok: true };
}

/** What /partners and the Supporters strip show: public partners, in order. */
export async function listPublicOrgPartners(): Promise<OrgPartner[]> {
  return listOrgPartnersForAdmin({ publicOnly: true });
}

export async function listOrgPartnersForAdmin(options: { publicOnly?: boolean } = {}): Promise<OrgPartner[]> {
  if (devNoDb()) {
    return orgPartners
      .filter((partner) => !options.publicOnly || partner.isPublic)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.orgPartner.findMany({
    where: options.publicOnly ? { isPublic: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(rowToPartner);
}
