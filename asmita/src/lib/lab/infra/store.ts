import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import type { ExtractedFinding } from "@/lib/lab/infra/extract";
import { CATEGORY_TO_CHOKEPOINT_KIND } from "@/lib/lab/infra/signatures";
import {
  isoDate,
  labMemory,
  LAB_CHOKEPOINT_KINDS,
  LAB_INFRA_CATEGORIES,
  LAB_INFRA_CONFIDENCES,
  LAB_SERVICE_LINK_REASONS,
  LAB_SERVICE_LINK_STATUSES,
  type LabChokepointKind,
  type LabInfraCategory,
  type LabInfraConfidence,
  type LabServiceLinkReason,
  type LabServiceLinkStatus,
  type MemoryLabInfraFinding,
  type MemoryLabInfraScan,
  type MemoryLabProvider,
  type MemoryLabServiceLink,
} from "@/lib/lab/lab-store";

/*
 * WP114 (research-tools-spec.md): persistence for the infrastructure
 * registry — provider directory, scans, findings and service links — on the
 * Lab's triple backend (memory for dev/tests, Kysely on the Worker, Prisma
 * on Node), like every lab module. Findings are never deleted: when a scan
 * no longer sees one it becomes active=false, which is how "switched from X
 * to Y" is shown later (WP115). Audit entries carry ids and counts only,
 * never a service name or URL.
 */

const SCAN_COLUMNS = ["id", "serviceId", "url", "finalUrl", "httpStatus", "scannedAt", "signatureVersion", "error"] as const;
const FINDING_COLUMNS = ["id", "scanId", "serviceId", "category", "providerId", "value", "evidence", "confidence", "firstSeenAt", "lastSeenAt", "active", "promotedAt", "promotedChokepointId"] as const;
const PROVIDER_COLUMNS = ["id", "name", "kind", "website", "abusePageUrl", "abuseEmail", "policyUrl", "notes", "verifiedById", "verifiedAt", "createdAt", "updatedAt"] as const;
const LINK_COLUMNS = ["id", "serviceAId", "serviceBId", "reason", "value", "createdAt", "status", "reviewedById", "reviewedAt"] as const;

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/* ---- views ---- */

export type LabProviderView = {
  id: string;
  name: string;
  kind: LabChokepointKind;
  website: string;
  abusePageUrl: string | null;
  abuseEmail: string | null;
  policyUrl: string | null;
  notes: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type LabInfraScanView = {
  id: string;
  serviceId: string;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  scannedAt: string;
  signatureVersion: string;
  error: string | null;
};

export type LabInfraFindingView = {
  id: string;
  scanId: string;
  serviceId: string;
  category: LabInfraCategory;
  providerId: string | null;
  value: string;
  evidence: string;
  confidence: LabInfraConfidence;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
  /** WP115: set when an analyst promoted the finding into a chokepoint. */
  promotedAt: string | null;
  promotedChokepointId: string | null;
};

export type LabServiceLinkView = {
  id: string;
  serviceAId: string;
  serviceBId: string;
  reason: LabServiceLinkReason;
  value: string;
  createdAt: string;
  /** WP115: CANDIDATE until an analyst confirms or dismisses. */
  status: LabServiceLinkStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
};

type ProviderRow = Omit<MemoryLabProvider, "verifiedAt" | "createdAt" | "updatedAt"> & {
  verifiedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ScanRow = Omit<MemoryLabInfraScan, "scannedAt"> & { scannedAt: Date | string };

type FindingRow = Omit<MemoryLabInfraFinding, "firstSeenAt" | "lastSeenAt"> & {
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
};

type LinkRow = Omit<MemoryLabServiceLink, "createdAt"> & { createdAt: Date | string };

function toProviderView(row: ProviderRow): LabProviderView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    website: row.website,
    abusePageUrl: row.abusePageUrl,
    abuseEmail: row.abuseEmail,
    policyUrl: row.policyUrl,
    notes: row.notes,
    verifiedById: row.verifiedById,
    verifiedAt: isoDate(row.verifiedAt),
    createdAt: isoDate(row.createdAt) ?? new Date().toISOString(),
  };
}

function toScanView(row: ScanRow): LabInfraScanView {
  return {
    id: row.id,
    serviceId: row.serviceId,
    url: row.url,
    finalUrl: row.finalUrl,
    httpStatus: row.httpStatus,
    scannedAt: isoDate(row.scannedAt) ?? new Date().toISOString(),
    signatureVersion: row.signatureVersion,
    error: row.error,
  };
}

function toFindingView(row: FindingRow): LabInfraFindingView {
  return {
    id: row.id,
    scanId: row.scanId,
    serviceId: row.serviceId,
    category: row.category,
    providerId: row.providerId,
    value: row.value,
    evidence: row.evidence,
    confidence: row.confidence,
    firstSeenAt: isoDate(row.firstSeenAt) ?? new Date().toISOString(),
    lastSeenAt: isoDate(row.lastSeenAt) ?? new Date().toISOString(),
    active: row.active,
    promotedAt: isoDate(row.promotedAt),
    promotedChokepointId: row.promotedChokepointId ?? null,
  };
}

function toLinkView(row: LinkRow): LabServiceLinkView {
  return {
    id: row.id,
    serviceAId: row.serviceAId,
    serviceBId: row.serviceBId,
    reason: row.reason,
    value: row.value,
    createdAt: isoDate(row.createdAt) ?? new Date().toISOString(),
    status: row.status,
    reviewedById: row.reviewedById ?? null,
    reviewedAt: isoDate(row.reviewedAt),
  };
}

/* ---- providers ---- */

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, "not_a_public_http_url");

export const labProviderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(LAB_CHOKEPOINT_KINDS),
    website: httpUrl,
    abusePageUrl: httpUrl.nullable().optional(),
    abuseEmail: z.string().trim().email().max(320).nullable().optional(),
    policyUrl: httpUrl.nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const labProviderUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(LAB_CHOKEPOINT_KINDS).optional(),
    website: httpUrl.optional(),
    abusePageUrl: httpUrl.nullable().optional(),
    abuseEmail: z.string().trim().email().max(320).nullable().optional(),
    policyUrl: httpUrl.nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    verified: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "empty_update");

export type LabProviderInput = z.infer<typeof labProviderInputSchema>;
export type LabProviderUpdate = z.infer<typeof labProviderUpdateSchema>;

export async function listLabProviders(): Promise<LabProviderView[]> {
  let rows: ProviderRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().providers.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabProvider").select([...PROVIDER_COLUMNS]).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labProvider.findMany();
  }
  return rows.map(toProviderView).sort((a, b) => `${a.name}::${a.kind}`.localeCompare(`${b.name}::${b.kind}`));
}

export async function getLabProvider(id: string): Promise<LabProviderView | null> {
  const providers = await listLabProviders();
  return providers.find((provider) => provider.id === id) ?? null;
}

export async function createLabProvider(
  input: LabProviderInput,
  actorId: string,
): Promise<{ ok: true; provider: LabProviderView } | { ok: false; error: "invalid_payload" | "provider_exists" }> {
  const parsed = labProviderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const existing = (await listLabProviders()).find((p) => p.name === data.name && p.kind === data.kind);
  if (existing) return { ok: false, error: "provider_exists" };

  const now = new Date();
  // A provider is always created unverified: an analyst confirms it, and
  // only the update path can set verifiedAt.
  const values = {
    name: data.name,
    kind: data.kind,
    website: data.website,
    abusePageUrl: data.abusePageUrl ?? null,
    abuseEmail: data.abuseEmail ?? null,
    policyUrl: data.policyUrl ?? null,
    notes: data.notes ?? null,
    verifiedById: null,
    verifiedAt: null,
    updatedAt: now,
  };
  let view: LabProviderView;
  if (isDevNoDb()) {
    const row: MemoryLabProvider = { id: randomUUID(), createdAt: now, ...values };
    labMemory().providers.set(row.id, row);
    view = toProviderView(row);
  } else if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabProvider")
      .values({ id: randomUUID(), createdAt: now, ...values })
      .returning([...PROVIDER_COLUMNS])
      .executeTakeFirstOrThrow();
    view = toProviderView(inserted);
  } else {
    const { db } = await import("@/lib/db");
    const created = await db.labProvider.create({ data: { ...values } });
    view = toProviderView(created);
  }
  await writeAuditLog({
    eventType: "LAB_PROVIDER_CREATED",
    entityType: "LabProvider",
    entityId: view.id,
    actorId,
    data: { kind: view.kind },
  });
  return { ok: true, provider: view };
}

export async function updateLabProvider(
  id: string,
  patch: LabProviderUpdate,
  actorId: string,
): Promise<{ ok: true; provider: LabProviderView } | { ok: false; error: "invalid_payload" | "provider_not_found" }> {
  const parsed = labProviderUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const data = parsed.data;
  const previous = await getLabProvider(id);
  if (!previous) return { ok: false, error: "provider_not_found" };
  const now = new Date();
  const values = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.kind !== undefined ? { kind: data.kind } : {}),
    ...(data.website !== undefined ? { website: data.website } : {}),
    ...(data.abusePageUrl !== undefined ? { abusePageUrl: data.abusePageUrl } : {}),
    ...(data.abuseEmail !== undefined ? { abuseEmail: data.abuseEmail } : {}),
    ...(data.policyUrl !== undefined ? { policyUrl: data.policyUrl } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.verified !== undefined
      ? data.verified
        ? { verifiedById: actorId, verifiedAt: now }
        : { verifiedById: null, verifiedAt: null }
      : {}),
    updatedAt: now,
  };
  let view: LabProviderView | null = null;
  if (isDevNoDb()) {
    const row = labMemory().providers.get(id);
    if (row) {
      Object.assign(row, values);
      view = toProviderView(row);
    }
  } else if (usesWorkerKysely()) {
    const updated = await getWorkerDb().updateTable("LabProvider")
      .set(values)
      .where("id", "=", id)
      .returning([...PROVIDER_COLUMNS])
      .executeTakeFirst();
    if (updated) view = toProviderView(updated);
  } else {
    const { db } = await import("@/lib/db");
    try {
      view = toProviderView(await db.labProvider.update({ where: { id }, data: values }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "provider_not_found" };
      throw err;
    }
  }
  if (!view) return { ok: false, error: "provider_not_found" };
  await writeAuditLog({
    eventType: "LAB_PROVIDER_UPDATED",
    entityType: "LabProvider",
    entityId: id,
    actorId,
    data: {
      fields: Object.keys(data),
      verified: data.verified ?? null,
      previouslyVerified: previous.verifiedAt !== null,
    },
  });
  return { ok: true, provider: view };
}

/* ---- scans and findings ---- */

/** The provider row a finding's signature provider refers to, if seeded. */
async function providerIdFor(finding: ExtractedFinding, providers: LabProviderView[]): Promise<string | null> {
  if (!finding.provider) return null;
  const kind = CATEGORY_TO_CHOKEPOINT_KIND[finding.category];
  if (!kind) return null;
  const match = providers.find((provider) => provider.name === finding.provider && provider.kind === kind);
  return match?.id ?? null;
}

/** One scan of one service URL; the scan row keeps no HTML, only results. */
export async function recordInfraScan(
  input: { serviceId: string; url: string; finalUrl: string | null; httpStatus: number | null; error: string | null },
  signatureVersion: string,
  now: Date,
): Promise<LabInfraScanView> {
  const values = {
    serviceId: input.serviceId,
    url: input.url,
    finalUrl: input.finalUrl,
    httpStatus: input.httpStatus,
    signatureVersion,
    error: input.error,
    scannedAt: now,
  };
  if (isDevNoDb()) {
    const row: MemoryLabInfraScan = { id: randomUUID(), ...values };
    labMemory().infraScans.set(row.id, row);
    return toScanView(row);
  }
  if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabInfraScan")
      .values({ id: randomUUID(), ...values })
      .returning([...SCAN_COLUMNS])
      .executeTakeFirstOrThrow();
    return toScanView(inserted);
  }
  const { db } = await import("@/lib/db");
  const created = await db.labInfraScan.create({ data: { ...values } });
  return toScanView(created);
}

export async function listInfraScansForService(serviceId: string): Promise<LabInfraScanView[]> {
  let rows: ScanRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().infraScans.values()].filter((row) => row.serviceId === serviceId);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabInfraScan").select([...SCAN_COLUMNS]).where("serviceId", "=", serviceId).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labInfraScan.findMany({ where: { serviceId } });
  }
  return rows.map(toScanView).sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
}

export async function listInfraFindingsForService(serviceId: string): Promise<LabInfraFindingView[]> {
  let rows: FindingRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().infraFindings.values()].filter((row) => row.serviceId === serviceId);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabInfraFinding").select([...FINDING_COLUMNS]).where("serviceId", "=", serviceId).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labInfraFinding.findMany({ where: { serviceId } });
  }
  return rows.map(toFindingView).sort((a, b) => `${a.category}:${a.value}`.localeCompare(`${b.category}:${b.value}`));
}

/** Every active finding with this value, whatever service it belongs to. */
export async function findActiveFindingsByValue(value: string, category: LabInfraCategory): Promise<LabInfraFindingView[]> {
  let rows: FindingRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().infraFindings.values()].filter((row) => row.active && row.value === value && row.category === category);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabInfraFinding")
      .select([...FINDING_COLUMNS])
      .where("value", "=", value)
      .where("category", "=", category)
      .where("active", "=", true)
      .execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labInfraFinding.findMany({ where: { value, category, active: true } });
  }
  return rows.map(toFindingView);
}

/** One finding by id, whatever service it belongs to (WP115 promote flow). */
export async function getLabInfraFinding(id: string): Promise<LabInfraFindingView | null> {
  let rows: FindingRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().infraFindings.values()].filter((row) => row.id === id);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabInfraFinding").select([...FINDING_COLUMNS]).where("id", "=", id).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labInfraFinding.findMany({ where: { id } });
  }
  return rows.length > 0 ? toFindingView(rows[0]!) : null;
}

/**
 * Which services depend on a provider, and how: a chokepoint recorded against
 * its name and kind, or an active finding linked to its directory row. The
 * provider directory and the bulk report both use this one rule, so a bulk
 * report only ever tells a provider what the registry actually recorded.
 */
export function providerDependents(
  provider: Pick<LabProviderView, "id" | "name" | "kind">,
  chokepoints: { serviceId: string; provider: string; kind: LabChokepointKind }[],
  activeFindings: Pick<LabInfraFindingView, "serviceId" | "providerId" | "active">[],
): Map<string, { viaChokepoint: boolean; viaFinding: boolean }> {
  const dependents = new Map<string, { viaChokepoint: boolean; viaFinding: boolean }>();
  const add = (serviceId: string, viaChokepoint: boolean, viaFinding: boolean) => {
    const existing = dependents.get(serviceId) ?? { viaChokepoint: false, viaFinding: false };
    existing.viaChokepoint ||= viaChokepoint;
    existing.viaFinding ||= viaFinding;
    dependents.set(serviceId, existing);
  };
  for (const chokepoint of chokepoints) {
    if (chokepoint.provider === provider.name && chokepoint.kind === provider.kind) add(chokepoint.serviceId, true, false);
  }
  for (const finding of activeFindings) {
    if (finding.active && finding.providerId === provider.id) add(finding.serviceId, false, true);
  }
  return dependents;
}

/** Every active finding, across all services — the registry table's evidence base. */
export async function listActiveInfraFindings(): Promise<LabInfraFindingView[]> {
  let rows: FindingRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().infraFindings.values()].filter((row) => row.active);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabInfraFinding").select([...FINDING_COLUMNS]).where("active", "=", true).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labInfraFinding.findMany({ where: { active: true } });
  }
  return rows.map(toFindingView);
}

/**
 * Claims a finding for promotion: sets promotedAt only while it is still
 * null, and says whether this call won. Two clicks (or two analysts) racing
 * on one finding cannot both create a chokepoint.
 */
export async function claimFindingPromotion(id: string, now: Date): Promise<boolean> {
  if (isDevNoDb()) {
    const row = labMemory().infraFindings.get(id);
    if (!row || row.promotedAt) return false;
    row.promotedAt = now;
    return true;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().updateTable("LabInfraFinding")
      .set({ promotedAt: now })
      .where("id", "=", id)
      .where("promotedAt", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) === 1;
  }
  const { db } = await import("@/lib/db");
  const result = await db.labInfraFinding.updateMany({ where: { id, promotedAt: null }, data: { promotedAt: now } });
  return result.count === 1;
}

/** Undoes a claim that never became a chokepoint (the chokepoint create failed). */
export async function releaseFindingPromotion(id: string): Promise<void> {
  if (isDevNoDb()) {
    const row = labMemory().infraFindings.get(id);
    if (row && !row.promotedChokepointId) row.promotedAt = null;
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("LabInfraFinding").set({ promotedAt: null })
      .where("id", "=", id).where("promotedChokepointId", "is", null).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.labInfraFinding.updateMany({ where: { id, promotedChokepointId: null }, data: { promotedAt: null } });
}

/**
 * WP115 (research-tools-spec.md): marks a finding promoted, pointing at the
 * chokepoint it became. A promoted finding never promotes again.
 */
export async function setFindingPromoted(id: string, chokepointId: string, now: Date): Promise<void> {
  const values = { promotedAt: now, promotedChokepointId: chokepointId };
  if (isDevNoDb()) {
    const row = labMemory().infraFindings.get(id);
    if (row) Object.assign(row, values);
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("LabInfraFinding").set(values).where("id", "=", id).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.labInfraFinding.update({ where: { id }, data: values });
}

/**
 * The most recent scan of each service, as the registry table's "last scan"
 * column. One aggregate query per backend; the map omits never-scanned services.
 */
export async function latestInfraScanAtByService(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (isDevNoDb()) {
    for (const scan of labMemory().infraScans.values()) {
      const current = result.get(scan.serviceId);
      if (!current || current < scan.scannedAt.toISOString()) {
        result.set(scan.serviceId, scan.scannedAt.toISOString());
      }
    }
    return result;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("LabInfraScan")
      .select((eb) => ["serviceId", eb.fn.max("scannedAt").as("maxScannedAt")])
      .groupBy("serviceId")
      .execute();
    for (const row of rows) {
      const at = (row as { maxScannedAt: Date | string }).maxScannedAt;
      if (at) result.set(row.serviceId, isoDate(at) ?? new Date().toISOString());
    }
    return result;
  }
  const { db } = await import("@/lib/db");
  const rows = await db.labInfraScan.groupBy({ by: ["serviceId"], _max: { scannedAt: true } });
  for (const row of rows) {
    if (row._max.scannedAt) result.set(row.serviceId, isoDate(row._max.scannedAt)!);
  }
  return result;
}

/**
 * Writes one scan's findings with change tracking: findings in categories
 * this run checked that the scan no longer sees become active=false (never
 * deleted); seen findings get their lastSeenAt moved and stay active. The
 * providerId links a signature provider to a seeded directory row.
 */
export async function recordScanFindings(
  serviceId: string,
  scanId: string,
  findings: ExtractedFinding[],
  checkedCategories: Set<string>,
  now: Date,
): Promise<{ deactivated: number; upserted: number }> {
  const providers = await listLabProviders();
  const existing = await listInfraFindingsForService(serviceId);
  const newKeys = new Set(findings.map((finding) => `${finding.category}:${finding.value}`));

  let deactivated = 0;
  for (const row of existing) {
    if (!row.active) continue;
    if (!checkedCategories.has(row.category)) continue;
    if (newKeys.has(`${row.category}:${row.value}`)) continue;
    await setFindingActive(row.id, false, now);
    deactivated += 1;
  }

  let upserted = 0;
  for (const finding of findings) {
    if (finding.value.length > 500) continue;
    const providerId = await providerIdFor(finding, providers);
    const previous = existing.find((row) => row.category === finding.category && row.value === finding.value);
    const values = {
      scanId,
      serviceId,
      category: finding.category,
      providerId,
      value: finding.value,
      evidence: finding.evidence.slice(0, 500),
      confidence: finding.confidence,
      lastSeenAt: now,
      active: true,
      ...(previous ? {} : { firstSeenAt: now }),
    };
    if (isDevNoDb()) {
      const memory = labMemory();
      if (previous) {
        const row = memory.infraFindings.get(previous.id);
        if (row) Object.assign(row, values);
      } else {
        const row: MemoryLabInfraFinding = {
          id: randomUUID(), firstSeenAt: now, ...values,
          promotedAt: null, promotedChokepointId: null,
        };
        memory.infraFindings.set(row.id, row);
      }
    } else if (usesWorkerKysely()) {
      await getWorkerDb().insertInto("LabInfraFinding")
        .values({ id: randomUUID(), firstSeenAt: previous ? undefined : now, ...values })
        .onConflict((oc) => oc.columns(["serviceId", "category", "value"]).doUpdateSet({
          scanId: values.scanId,
          providerId: values.providerId,
          evidence: values.evidence,
          confidence: values.confidence,
          lastSeenAt: values.lastSeenAt,
          active: true,
        }))
        .execute();
    } else {
      const { db } = await import("@/lib/db");
      await db.labInfraFinding.upsert({
        where: { serviceId_category_value: { serviceId, category: finding.category, value: finding.value } },
        create: { id: randomUUID(), firstSeenAt: now, ...values },
        update: {
          scanId: values.scanId,
          providerId: values.providerId,
          evidence: values.evidence,
          confidence: values.confidence,
          lastSeenAt: values.lastSeenAt,
          active: true,
        },
      });
    }
    upserted += 1;
  }
  return { deactivated, upserted };
}

async function setFindingActive(id: string, active: boolean, now: Date): Promise<void> {
  if (isDevNoDb()) {
    const row = labMemory().infraFindings.get(id);
    if (row) {
      row.active = active;
      row.lastSeenAt = now;
    }
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("LabInfraFinding").set({ active, lastSeenAt: now }).where("id", "=", id).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.labInfraFinding.update({ where: { id }, data: { active, lastSeenAt: now } });
}

/* ---- service links ---- */

export async function createServiceLink(
  serviceAId: string,
  serviceBId: string,
  reason: LabServiceLinkReason,
  value: string,
  now: Date,
): Promise<boolean> {
  const [a, b] = [serviceAId, serviceBId].sort();
  if (a === b) return false;
  if (isDevNoDb()) {
    const memory = labMemory();
    const duplicate = [...memory.serviceLinks.values()].some(
      (link) => link.serviceAId === a && link.serviceBId === b && link.reason === reason && link.value === value,
    );
    if (duplicate) return false;
    const row: MemoryLabServiceLink = {
      id: randomUUID(), serviceAId: a, serviceBId: b, reason, value, createdAt: now,
      status: "CANDIDATE", reviewedById: null, reviewedAt: null,
    };
    memory.serviceLinks.set(row.id, row);
    return true;
  }
  if (usesWorkerKysely()) {
    const created = await getWorkerDb().insertInto("LabServiceLink")
      .values({ id: randomUUID(), serviceAId: a, serviceBId: b, reason, value, createdAt: now })
      .onConflict((oc) => oc.columns(["serviceAId", "serviceBId", "reason", "value"]).doNothing())
      .returning(["id"])
      .execute();
    return created.length > 0;
  }
  const { db } = await import("@/lib/db");
  const created = await db.labServiceLink.createMany({
    data: [{ id: randomUUID(), serviceAId: a, serviceBId: b, reason, value, createdAt: now }],
    skipDuplicates: true,
  });
  return created.count > 0;
}

/**
 * WP115 (research-tools-spec.md): an analyst confirms or dismisses a cluster
 * candidate. Confirmed links are what the registry's cluster badge counts;
 * dismissed ones stay on record (nothing in the Lab is deleted) but never
 * surface as a badge again. Audited with ids only.
 */
export async function reviewServiceLink(
  id: string,
  status: "CONFIRMED" | "DISMISSED",
  actorId: string,
): Promise<{ ok: true; link: LabServiceLinkView } | { ok: false; error: "link_not_found" }> {
  const now = new Date();
  const values = { status, reviewedById: actorId, reviewedAt: now };
  let row: LinkRow | null = null;
  if (isDevNoDb()) {
    const memory = labMemory();
    const existing = memory.serviceLinks.get(id) ?? null;
    if (existing) {
      Object.assign(existing, values);
      row = existing;
    }
  } else if (usesWorkerKysely()) {
    row = (await getWorkerDb().updateTable("LabServiceLink")
      .set(values)
      .where("id", "=", id)
      .returning([...LINK_COLUMNS])
      .executeTakeFirst()) ?? null;
  } else {
    const { db } = await import("@/lib/db");
    try {
      row = await db.labServiceLink.update({ where: { id }, data: values });
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "link_not_found" };
      throw err;
    }
  }
  if (!row) return { ok: false, error: "link_not_found" };
  await writeAuditLog({
    eventType: "LAB_SERVICE_LINK_REVIEWED",
    entityType: "LabServiceLink",
    entityId: id,
    actorId,
    data: { status, reason: row.reason },
  });
  return { ok: true, link: toLinkView(row) };
}

export async function listServiceLinks(): Promise<LabServiceLinkView[]> {
  let rows: LinkRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().serviceLinks.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabServiceLink").select([...LINK_COLUMNS]).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labServiceLink.findMany();
  }
  return rows.map(toLinkView).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listServiceLinksForService(serviceId: string): Promise<LabServiceLinkView[]> {
  const links = await listServiceLinks();
  return links.filter((link) => link.serviceAId === serviceId || link.serviceBId === serviceId);
}

export const labInfraCategoryEnum = z.enum(LAB_INFRA_CATEGORIES);
export const labInfraConfidenceEnum = z.enum(LAB_INFRA_CONFIDENCES);
export const labServiceLinkReasonEnum = z.enum(LAB_SERVICE_LINK_REASONS);
export const labServiceLinkStatusEnum = z.enum(LAB_SERVICE_LINK_STATUSES);
