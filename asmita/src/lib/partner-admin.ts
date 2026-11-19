import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/encryption";
import { normaliseDomain } from "@/lib/platform-partners-shared";
import { partnerApplications, type PartnerApplication } from "@/lib/platform-partners";
import { partnerMemory } from "@/lib/partner-store";
import { issuePartnerKey, revokePartnerKey } from "@/lib/partner-auth";
import { ensurePartnerCrawlSources } from "@/lib/partner-crawl";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Partner programme, part 2 — WP30, admin side. A partner exists only after
 * an admin approves a PlatformPartnerApplication; keys are issued by an admin
 * and shown once; crawler monitoring starts only after an admin records the
 * platform's written permission. Every action here writes an audit entry
 * (Rule 5), and nothing survivor-related is stored or read: partners are
 * business contacts, their data is encrypted exactly like the application's.
 *
 * Three backends, like every crawl module: the memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise.
 */

// ---------------------------------------------------------------------------
// Schemas (Rule 6: strict Zod validation on every route payload)

export const applicationActionSchema = z
  .object({
    action: z.enum(["contacted", "approve", "decline"]),
  })
  .strict();

export const updatePartnerSchema = z
  .object({
    primaryDomain: z.string().trim().min(3).max(253).optional(),
    extraDomains: z.array(z.string().trim().min(3).max(253)).max(20).optional(),
    // An empty string clears the channel email.
    channelEmail: z.union([z.literal(""), z.string().trim().toLowerCase().max(254).email()]).optional(),
  })
  .strict()
  .refine(
    (data) => data.primaryDomain !== undefined || data.extraDomains !== undefined || data.channelEmail !== undefined,
    { message: "nothing_to_change" },
  );

export const partnerStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).strict();

export const issueKeySchema = z.object({ label: z.string().trim().min(1).max(80) }).strict();

export const crawlPermissionSchema = z
  .object({
    // The date of the written permission, as the admin read it on the document.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Where the permission is filed (an email, a signed agreement, ...).
    note: z.string().trim().min(3).max(500),
  })
  .strict();

// ---------------------------------------------------------------------------
// Views

export type PlatformPartnerStatusValue = "ACTIVE" | "SUSPENDED";

export type PlatformPartnerView = {
  id: string;
  name: string;
  primaryDomain: string;
  extraDomains: string[];
  status: PlatformPartnerStatusValue;
  /** Decrypted for the console; "[could not decrypt]" when the row is unreadable. */
  channelEmail: string | null;
  createdFromApplicationId: string | null;
  crawlPermissionRecordedAt: string | null;
  crawlPermissionRecordedById: string | null;
  crawlPermissionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The key is never in a view: it is shown once at issue, the hash never leaves the store. */
export type PlatformPartnerKeyView = {
  id: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  primaryDomain: string;
  extraDomains: string[];
  status: string;
  channelEmailEncrypted: string | null;
  createdFromApplicationId: string | null;
  crawlPermissionRecordedAt: Date | string | null;
  crawlPermissionRecordedById: string | null;
  crawlPermissionNote: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function iso(value: Date | string | null): string | null {
  return value === null || value === undefined ? null : new Date(value).toISOString();
}

function toPartnerView(row: PartnerRow): PlatformPartnerView {
  let channelEmail: string | null = null;
  if (row.channelEmailEncrypted) {
    try {
      channelEmail = decryptField(row.channelEmailEncrypted);
    } catch {
      channelEmail = "[could not decrypt]";
    }
  }
  return {
    id: row.id,
    name: row.name,
    primaryDomain: row.primaryDomain,
    extraDomains: row.extraDomains,
    status: row.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    channelEmail,
    createdFromApplicationId: row.createdFromApplicationId,
    crawlPermissionRecordedAt: iso(row.crawlPermissionRecordedAt),
    crawlPermissionRecordedById: row.crawlPermissionRecordedById,
    crawlPermissionNote: row.crawlPermissionNote,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Reads

export async function listPlatformPartners(): Promise<PlatformPartnerView[]> {
  if (isDevNoDb()) return [...partnerMemory().partners.values()].map((row) => toPartnerView(row)).sort((a, b) => a.name.localeCompare(b.name));
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("PlatformPartner").selectAll().orderBy("name").execute();
    return rows.map((row) => toPartnerView(row as PartnerRow));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.platformPartner.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => toPartnerView(row as unknown as PartnerRow));
}

export async function getPlatformPartner(partnerId: string): Promise<PlatformPartnerView | null> {
  if (isDevNoDb()) {
    const row = partnerMemory().partners.get(partnerId);
    return row ? toPartnerView(row) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PlatformPartner").selectAll().where("id", "=", partnerId).executeTakeFirst();
    return row ? toPartnerView(row as PartnerRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.platformPartner.findUnique({ where: { id: partnerId } });
  return row ? toPartnerView(row as unknown as PartnerRow) : null;
}

export async function listPlatformPartnerKeys(partnerId: string): Promise<PlatformPartnerKeyView[]> {
  type KeyRow = { id: string; label: string; createdAt: Date | string; revokedAt: Date | string | null; lastUsedAt: Date | string | null };
  const toView = (row: KeyRow) => ({
    id: row.id,
    label: row.label,
    createdAt: new Date(row.createdAt).toISOString(),
    revokedAt: iso(row.revokedAt),
    lastUsedAt: iso(row.lastUsedAt),
  });
  if (isDevNoDb()) {
    return [...partnerMemory().keys.values()].filter((key) => key.partnerId === partnerId)
      .map((key) => toView(key)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("PlatformPartnerKey")
      .select(["id", "label", "createdAt", "revokedAt", "lastUsedAt"])
      .where("partnerId", "=", partnerId).orderBy("createdAt").execute();
    return rows.map((row) => toView(row as KeyRow));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.platformPartnerKey.findMany({ where: { partnerId }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => toView(row as unknown as KeyRow));
}

// ---------------------------------------------------------------------------
// Application actions (mark contacted / approve / decline)

class InvalidStatus extends Error {}
class PartnerExists extends Error {}

export type ApplicationActionResult =
  | { ok: true; status: PartnerApplication["status"]; partnerId?: string }
  | { ok: false; error: "application_not_found" | "invalid_status" | "partner_exists" };

const OPEN_APPLICATION_STATUSES: PartnerApplication["status"][] = ["NEW", "CONTACTED"];

type ApplicationSnapshot = {
  id: string;
  platformName: string;
  websiteDomain: string;
  /** Ciphertext on the database paths, plaintext in the memory store. */
  contactEmail: string;
  status: string;
};

function findMemoryApplication(applicationId: string): PartnerApplication | undefined {
  return partnerApplications.find((application) => application.id === applicationId);
}

async function findApplication(applicationId: string): Promise<ApplicationSnapshot | null> {
  if (isDevNoDb()) {
    const application = findMemoryApplication(applicationId);
    return application ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PlatformPartnerApplication")
      .select(["id", "platformName", "websiteDomain", "contactEmail", "status"])
      .where("id", "=", applicationId).executeTakeFirst();
    return row ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.platformPartnerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, platformName: true, websiteDomain: true, contactEmail: true, status: true },
  });
}

/** Guarded status write: only from one of `from`, so two admins cannot double-act. */
async function setApplicationStatus(applicationId: string, from: PartnerApplication["status"][], status: string): Promise<boolean> {
  if (isDevNoDb()) {
    const application = findMemoryApplication(applicationId);
    if (!application || !from.includes(application.status)) return false;
    application.status = status as PartnerApplication["status"];
    return true;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("PlatformPartnerApplication").set({ status })
      .where("id", "=", applicationId).where("status", "in", from).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
  const { db } = await import("@/lib/db");
  const { count } = await db.platformPartnerApplication.updateMany({ where: { id: applicationId, status: { in: from } }, data: { status } });
  return count > 0;
}

/** Inserts the partner row; throws PartnerExists when the domain is taken. */
async function insertPartnerFromApplication(application: ApplicationSnapshot): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  // One domain belongs to one partner (Rule 1: a reported URL on a partner's
  // own domains must never be ambiguous): the insert is refused not only when
  // another partner's primary domain matches, but also when any partner holds
  // the domain as an extra. The unique index below still backstops races.
  for (const partner of await allPartnerDomains()) {
    if (partner.primaryDomain === application.websiteDomain || partner.extraDomains.includes(application.websiteDomain)) {
      throw new PartnerExists();
    }
  }
  // On the database paths the application's contact email is already an
  // encryptField payload under the same key, so the ciphertext is copied
  // without a decrypt/re-encrypt round trip; in memory it is plaintext.
  const channelEmailEncrypted = isDevNoDb()
    ? encryptField(application.contactEmail)
    : application.contactEmail;
  if (isDevNoDb()) {
    const memory = partnerMemory();
    memory.partners.set(id, {
      id,
      name: application.platformName,
      primaryDomain: application.websiteDomain,
      extraDomains: [],
      status: "ACTIVE",
      channelEmailEncrypted,
      createdFromApplicationId: application.id,
      crawlPermissionRecordedAt: null,
      crawlPermissionRecordedById: null,
      crawlPermissionNote: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  if (usesWorkerKysely()) {
    try {
      const row = await getWorkerDb().insertInto("PlatformPartner").values({
        id,
        name: application.platformName,
        primaryDomain: application.websiteDomain,
        extraDomains: [],
        status: "ACTIVE",
        channelEmailEncrypted,
        createdFromApplicationId: application.id,
        createdAt: now,
        updatedAt: now,
      }).onConflict((oc) => oc.column("primaryDomain").doNothing()).returning("id").executeTakeFirst();
      if (!row) throw new PartnerExists();
      return row.id ?? id;
    } catch (err) {
      // Any unique violation (primary domain, or the application already
      // having a partner) means the platform is onboarded.
      if (err instanceof PartnerExists || (err as { code?: string }).code === "23505") throw new PartnerExists();
      throw err;
    }
  }
  const { db } = await import("@/lib/db");
  try {
    await db.platformPartner.create({
      data: {
        id,
        name: application.platformName,
        primaryDomain: application.websiteDomain,
        extraDomains: [],
        status: "ACTIVE",
        channelEmailEncrypted,
        createdFromApplicationId: application.id,
      },
      select: { id: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new PartnerExists();
    throw err;
  }
  return id;
}

export async function actOnPartnerApplication(
  input: z.infer<typeof applicationActionSchema> & { applicationId: string },
  actorId: string,
): Promise<ApplicationActionResult> {
  const application = await findApplication(input.applicationId);
  if (!application) return { ok: false, error: "application_not_found" };
  const fromStatus = application.status as PartnerApplication["status"];

  if (input.action === "contacted") {
    if (!(await setApplicationStatus(input.applicationId, ["NEW"], "CONTACTED"))) return { ok: false, error: "invalid_status" };
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "PlatformPartnerApplication",
      entityId: input.applicationId,
      actorId,
      data: { action: "partner_application_contacted", platformName: application.platformName, domain: application.websiteDomain },
    });
    return { ok: true, status: "CONTACTED" };
  }

  if (input.action === "decline") {
    if (!(await setApplicationStatus(input.applicationId, OPEN_APPLICATION_STATUSES, "DECLINED"))) return { ok: false, error: "invalid_status" };
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "PlatformPartnerApplication",
      entityId: input.applicationId,
      actorId,
      data: { action: "partner_application_declined", platformName: application.platformName, domain: application.websiteDomain },
    });
    return { ok: true, status: "DECLINED" };
  }

  // Approve: creates the PlatformPartner and marks the application
  // ONBOARDED, or changes nothing. A partner is ACTIVE from creation (Rule 5).
  if (!OPEN_APPLICATION_STATUSES.includes(fromStatus)) return { ok: false, error: "invalid_status" };
  let partnerId: string;
  try {
    if (isDevNoDb()) {
      partnerId = await insertPartnerFromApplication(application);
      if (!(await setApplicationStatus(input.applicationId, OPEN_APPLICATION_STATUSES, "ONBOARDED"))) {
        // Undo: another action changed the status under us.
        partnerMemory().partners.delete(partnerId);
        return { ok: false, error: "invalid_status" };
      }
    } else if (usesWorkerKysely()) {
      partnerId = await getWorkerDb().transaction().execute(async () => {
        const id = await insertPartnerFromApplication(application);
        if (!(await setApplicationStatus(input.applicationId, OPEN_APPLICATION_STATUSES, "ONBOARDED"))) throw new InvalidStatus();
        return id;
      });
    } else {
      const { db } = await import("@/lib/db");
      partnerId = await db.$transaction(async () => {
        const id = await insertPartnerFromApplication(application);
        if (!(await setApplicationStatus(input.applicationId, OPEN_APPLICATION_STATUSES, "ONBOARDED"))) throw new InvalidStatus();
        return id;
      });
    }
  } catch (err) {
    if (err instanceof PartnerExists) return { ok: false, error: "partner_exists" };
    if (err instanceof InvalidStatus) return { ok: false, error: "invalid_status" };
    throw err;
  }
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: partnerId,
    actorId,
    data: {
      action: "partner_approved",
      applicationId: input.applicationId,
      platformName: application.platformName,
      primaryDomain: application.websiteDomain,
    },
  });
  return { ok: true, status: "ONBOARDED", partnerId };
}

// ---------------------------------------------------------------------------
// Partner details: domains and channel email

export type UpdatePartnerResult =
  | { ok: true; partner: PlatformPartnerView }
  | { ok: false; error: "partner_not_found" | "invalid_domain" | "domain_in_use" };

/** Every domain a partner owns, for the overlap check. */
type PartnerDomains = { id: string; primaryDomain: string; extraDomains: string[] };

async function allPartnerDomains(): Promise<PartnerDomains[]> {
  if (isDevNoDb()) {
    return [...partnerMemory().partners.values()].map((partner) => ({ id: partner.id, primaryDomain: partner.primaryDomain, extraDomains: partner.extraDomains }));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("PlatformPartner").select(["id", "primaryDomain", "extraDomains"]).execute();
    return rows.map((row) => ({ id: row.id, primaryDomain: row.primaryDomain, extraDomains: row.extraDomains }));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.platformPartner.findMany({ select: { id: true, primaryDomain: true, extraDomains: true } });
  return rows.map((row) => ({ id: row.id, primaryDomain: row.primaryDomain, extraDomains: row.extraDomains }));
}

function normalisePartnerDomains(
  partnerId: string,
  primaryDomainInput: string | undefined,
  extraDomainsInput: string[] | undefined,
  current: PartnerDomains,
  others: PartnerDomains[],
): { ok: true; primaryDomain: string; extraDomains: string[] } | { ok: false; error: "invalid_domain" | "domain_in_use" } {
  const primary = primaryDomainInput !== undefined ? normaliseDomain(primaryDomainInput) : current.primaryDomain;
  if (!primary) return { ok: false, error: "invalid_domain" };
  const extras: string[] = [];
  if (extraDomainsInput !== undefined) {
    for (const entry of extraDomainsInput) {
      const domain = normaliseDomain(entry);
      if (!domain) return { ok: false, error: "invalid_domain" };
      if (domain !== primary && !extras.includes(domain)) extras.push(domain);
    }
  } else if (primary !== current.primaryDomain) {
    // The primary changed: drop it from the extras if it was there.
    extras.push(...current.extraDomains.filter((domain) => domain !== primary));
  } else {
    extras.push(...current.extraDomains);
  }
  // One domain belongs to one partner (Rule 1: partners receive the URLs on
  // their own domains, so ownership must never be ambiguous).
  const owned = new Map<string, string>();
  for (const other of others) {
    if (other.id === partnerId) continue;
    owned.set(other.primaryDomain, other.id);
    for (const domain of other.extraDomains) owned.set(domain, other.id);
  }
  for (const domain of [primary, ...extras]) {
    if (owned.has(domain)) return { ok: false, error: "domain_in_use" };
  }
  return { ok: true, primaryDomain: primary, extraDomains: extras };
}

export async function updatePlatformPartner(
  input: z.infer<typeof updatePartnerSchema> & { partnerId: string },
  actorId: string,
): Promise<UpdatePartnerResult> {
  const current = await getPlatformPartner(input.partnerId);
  if (!current) return { ok: false, error: "partner_not_found" };
  const domains = normalisePartnerDomains(
    input.partnerId,
    input.primaryDomain,
    input.extraDomains,
    { id: input.partnerId, primaryDomain: current.primaryDomain, extraDomains: current.extraDomains },
    await allPartnerDomains(),
  );
  if (!domains.ok) return domains;
  const channelEmail =
    input.channelEmail === undefined ? undefined : input.channelEmail === "" ? null : encryptField(input.channelEmail);
  const changes: PartnerChanges = {
    primaryDomain: domains.primaryDomain,
    extraDomains: domains.extraDomains,
    ...(channelEmail !== undefined ? { channelEmailEncrypted: channelEmail } : {}),
  };
  const auditChanges: Record<string, unknown> = {
    primaryDomain: domains.primaryDomain,
    extraDomains: domains.extraDomains,
    ...(channelEmail !== undefined ? { channelEmailChanged: true } : {}),
  };

  const updated = await writePartner(input.partnerId, changes);
  if (!updated) return { ok: false, error: "partner_not_found" };
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    actorId,
    // The channel email itself never enters the audit data; only that it changed.
    data: { action: "partner_updated", changes: auditChanges },
  });
  // WP33: new domains of a partner whose written permission to crawl is
  // already recorded may also be monitored, so they get their crawl source
  // the same way (disabled, awaiting the usual admin enable). Best effort.
  if (updated.crawlPermissionRecordedAt && (input.primaryDomain !== undefined || input.extraDomains !== undefined)) {
    try {
      await ensurePartnerCrawlSources(
        { id: input.partnerId, primaryDomain: updated.primaryDomain, extraDomains: updated.extraDomains },
        actorId,
      );
    } catch {
      console.error("partner_crawl_sources_failed");
    }
  }
  return { ok: true, partner: updated };
}

/** The fields of PlatformPartner the admin actions may change. */
type PartnerChanges = Partial<{
  primaryDomain: string;
  extraDomains: string[];
  status: PlatformPartnerStatusValue;
  channelEmailEncrypted: string | null;
  crawlPermissionRecordedAt: Date;
  crawlPermissionRecordedById: string;
  crawlPermissionNote: string;
}>;

/** Applies `changes` and returns the updated view, or null when the row is gone. */
async function writePartner(partnerId: string, changes: PartnerChanges): Promise<PlatformPartnerView | null> {
  if (isDevNoDb()) {
    const row = partnerMemory().partners.get(partnerId);
    if (!row) return null;
    Object.assign(row, changes, { updatedAt: new Date() });
    return toPartnerView(row);
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("PlatformPartner")
      .set({ ...changes, updatedAt: new Date() }).where("id", "=", partnerId)
      .returningAll().executeTakeFirst();
    return result ? toPartnerView(result as PartnerRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.platformPartner.update({ where: { id: partnerId }, data: changes });
  return toPartnerView(row as unknown as PartnerRow);
}

// ---------------------------------------------------------------------------
// Status: suspend / reactivate

export type PartnerStatusResult =
  | { ok: true; partner: PlatformPartnerView }
  | { ok: false; error: "partner_not_found" | "no_change" };

export async function setPlatformPartnerStatus(
  input: z.infer<typeof partnerStatusSchema> & { partnerId: string },
  actorId: string,
): Promise<PartnerStatusResult> {
  const current = await getPlatformPartner(input.partnerId);
  if (!current) return { ok: false, error: "partner_not_found" };
  if (current.status === input.status) return { ok: false, error: "no_change" };
  const updated = await writePartner(input.partnerId, { status: input.status });
  if (!updated) return { ok: false, error: "partner_not_found" };
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    actorId,
    data: {
      action: input.status === "SUSPENDED" ? "partner_suspended" : "partner_reactivated",
      domain: current.primaryDomain,
    },
  });
  return { ok: true, partner: updated };
}

// ---------------------------------------------------------------------------
// Keys: issued by an admin, shown once, revocable

export type IssueKeyResult =
  | { ok: true; keyId: string; key: string }
  | { ok: false; error: "partner_not_found" };

export async function issuePlatformPartnerKey(
  input: z.infer<typeof issueKeySchema> & { partnerId: string },
  actorId: string,
): Promise<IssueKeyResult> {
  const partner = await getPlatformPartner(input.partnerId);
  if (!partner) return { ok: false, error: "partner_not_found" };
  const issued = await issuePartnerKey(input.partnerId, input.label);
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    actorId,
    // Never the key, never its hash; the label is the admin's own name for it.
    data: { action: "partner_key_issued", keyId: issued.id, label: input.label },
  });
  return { ok: true, keyId: issued.id, key: issued.key };
}

export type RevokeKeyResult =
  | { ok: true }
  | { ok: false; error: "partner_not_found" | "key_not_found" | "key_revoked" };

export async function revokePlatformPartnerKey(
  input: { partnerId: string; keyId: string },
  actorId: string,
): Promise<RevokeKeyResult> {
  const partner = await getPlatformPartner(input.partnerId);
  if (!partner) return { ok: false, error: "partner_not_found" };
  const keys = await listPlatformPartnerKeys(input.partnerId);
  const key = keys.find((entry) => entry.id === input.keyId);
  if (!key) return { ok: false, error: "key_not_found" };
  if (key.revokedAt) return { ok: false, error: "key_revoked" };
  const revoked = await revokePartnerKey(input.keyId);
  if (!revoked) return { ok: false, error: "key_revoked" };
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    actorId,
    data: { action: "partner_key_revoked", keyId: input.keyId },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Written permission to crawl (gate for WP33's crawler monitoring)

export type CrawlPermissionResult =
  | { ok: true; partner: PlatformPartnerView; crawlSources?: { created: string[]; skipped: string[] } }
  | { ok: false; error: "partner_not_found" | "invalid_date" | "future_date" };

export async function recordPartnerCrawlPermission(
  input: z.infer<typeof crawlPermissionSchema> & { partnerId: string },
  actorId: string,
  now: Date = new Date(),
): Promise<CrawlPermissionResult> {
  const partner = await getPlatformPartner(input.partnerId);
  if (!partner) return { ok: false, error: "partner_not_found" };
  const recordedAt = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(recordedAt.getTime())) return { ok: false, error: "invalid_date" };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (recordedAt.getTime() > today.getTime()) return { ok: false, error: "future_date" };
  const updated = await writePartner(input.partnerId, {
    crawlPermissionRecordedAt: recordedAt,
    crawlPermissionRecordedById: actorId,
    crawlPermissionNote: input.note,
  });
  if (!updated) return { ok: false, error: "partner_not_found" };
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "PlatformPartner",
    entityId: input.partnerId,
    actorId,
    data: { action: "partner_crawl_permission_recorded", date: input.date, note: input.note },
  });
  // WP33: the recorded permission is what allows Asmita to monitor the
  // partner's pages, so this is also the moment its domains may appear as
  // crawl sources (disabled, awaiting the usual admin enable). Best effort:
  // an unrecordable domain is skipped, never an error for the permission.
  let crawlSources: { created: string[]; skipped: string[] } | undefined;
  try {
    crawlSources = await ensurePartnerCrawlSources(
      { id: input.partnerId, primaryDomain: updated.primaryDomain, extraDomains: updated.extraDomains },
      actorId,
    );
  } catch {
    console.error("partner_crawl_sources_failed");
  }
  return { ok: true, partner: updated, ...(crawlSources ? { crawlSources } : {}) };
}
