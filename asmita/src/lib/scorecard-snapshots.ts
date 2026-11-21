import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  aggregateScorecard,
  isScorecardPeriod,
  latestCompletedScorecardPeriod,
  isValidScorecardPeriodForCompute,
  type ScorecardData,
  type ScorecardHashAdvisory,
  type ScorecardPeriod,
  type ScorecardUrlNotice,
} from "@/lib/scorecard";

/*
 * Scorecard snapshots (docs/org/spec.md, WP58): one DRAFT row per calendar
 * quarter, computed from complaint data (read-only), reviewed by an admin
 * with content:manage and then published. This is the only module in the
 * scorecard that stores anything, and it stores aggregates only — the
 * complaint workflow is never written (src/lib/scorecard.ts stays pure, and
 * collectScorecardRows below only ever calls findMany).
 */

export const SCORECARD_SNAPSHOT_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type ScorecardSnapshotStatus = (typeof SCORECARD_SNAPSHOT_STATUSES)[number];

export const scorecardPeriodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-Q[1-4]$/, "period_format");

const MAX_MEMORY_SNAPSHOTS = 200;

export type ScorecardSnapshot = {
  id: string;
  period: ScorecardPeriod;
  computedAt: string;
  data: ScorecardData;
  status: ScorecardSnapshotStatus;
  publishedAt: string | null;
  /** The admin's session id, as the audit log records it. */
  publishedBy: string | null;
  notesEn: string | null;
  notesHi: string | null;
  createdAt: string;
  updatedAt: string;
};

export const scorecardNoteSchema = z
  .object({
    notesEn: z.string().trim().max(4000).optional(),
    notesHi: z.string().trim().max(4000).optional(),
  })
  .strict();

export const scorecardPublishSchema = z.object({ publish: z.literal(true) }).strict();

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Local development and tests without a database keep snapshots here, capped. */
export const scorecardSnapshots: ScorecardSnapshot[] = [];

function remember(snapshot: ScorecardSnapshot) {
  const existing = scorecardSnapshots.findIndex((entry) => entry.id === snapshot.id);
  if (existing >= 0) scorecardSnapshots[existing] = snapshot;
  else scorecardSnapshots.push(snapshot);
  if (scorecardSnapshots.length > MAX_MEMORY_SNAPSHOTS) {
    scorecardSnapshots.splice(0, scorecardSnapshots.length - MAX_MEMORY_SNAPSHOTS);
  }
}

function rowToSnapshot(row: Record<string, unknown>): ScorecardSnapshot {
  return {
    id: row.id as string,
    period: row.period as ScorecardPeriod,
    computedAt: new Date(row.computedAt as string).toISOString(),
    data: row.data as ScorecardData,
    status: row.status as ScorecardSnapshotStatus,
    publishedAt: row.publishedAt ? new Date(row.publishedAt as string).toISOString() : null,
    publishedBy: (row.publishedBy as string | null) ?? null,
    notesEn: (row.notesEn as string | null) ?? null,
    notesHi: (row.notesHi as string | null) ?? null,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

// ─── Reading complaint data (read-only) ─────────────────────────────────────

export type ScorecardComplaintRows = {
  urlNotices: ScorecardUrlNotice[];
  hashAdvisories: ScorecardHashAdvisory[];
  platformNames: Record<string, string>;
};

/**
 * Everything the aggregation reads, from the complaint tables. Only ever
 * findMany: the scorecard must not be able to change a single row of the
 * complaint workflow, and a test pins that with a client whose mutations
 * all throw.
 *
 * Memory mode (dev/test without a database) reads nothing: the memory store
 * records no dispatches at all (links never leave NOTICE_QUEUED and no
 * Notice or HashDispatch rows exist), so honestly there is nothing to
 * score. Dev pages show the empty states until a database is attached.
 */
export async function collectScorecardRows(): Promise<ScorecardComplaintRows> {
  if (devNoDb()) {
    return { urlNotices: [], hashAdvisories: [], platformNames: {} };
  }
  const { db } = await import("@/lib/db");
  // One notice row per original notice, with its link's platform and status;
  // follow-ups are counted per original. All reads, no filters: the pure
  // aggregation keeps only the period it is asked for.
  const notices = await db.notice.findMany({
    select: {
      id: true,
      urlId: true,
      sentAt: true,
      responseReceivedAt: true,
      responseType: true,
      removedAt: true,
      followUpOf: true,
      submittedUrl: { select: { platformId: true, status: true } },
    },
  });
  const hashDispatches = await db.hashDispatch.findMany({
    select: { platformId: true, dispatchedAt: true },
  });
  const platforms = await db.platform.findMany({ select: { id: true, name: true } });

  const platformNames: Record<string, string> = {};
  for (const platform of platforms) platformNames[platform.id] = platform.name;

  const followUpsByOriginal = new Map<string, number>();
  const originals = new Map<string, Omit<ScorecardUrlNotice, "followUps">>();
  for (const notice of notices) {
    if (!notice.sentAt) continue;
    if (notice.followUpOf) {
      followUpsByOriginal.set(notice.followUpOf, (followUpsByOriginal.get(notice.followUpOf) ?? 0) + 1);
      continue;
    }
    const platformId = notice.submittedUrl?.platformId;
    if (!platformId) continue;
    originals.set(notice.id, {
      platformId,
      sentAt: notice.sentAt.toISOString(),
      urlStatus: notice.submittedUrl?.status ?? null,
      responseType: notice.responseType ?? null,
      firstResponseAt: notice.responseReceivedAt ? notice.responseReceivedAt.toISOString() : null,
      removedAt: notice.removedAt ? notice.removedAt.toISOString() : null,
    });
  }
  const urlNotices: ScorecardUrlNotice[] = [...originals.entries()].map(([id, notice]) => ({
    ...notice,
    followUps: followUpsByOriginal.get(id) ?? 0,
  }));

  return {
    urlNotices,
    hashAdvisories: hashDispatches.map((row) => ({
      platformId: row.platformId,
      dispatchedAt: row.dispatchedAt.toISOString(),
    })),
    platformNames,
  };
}

// ─── Compute, note, publish ─────────────────────────────────────────────────

export type ComputeResult =
  | { ok: true; snapshot: ScorecardSnapshot; created: boolean }
  | { ok: false; error: "period_invalid" | "period_in_future" | "period_published" };

/**
 * Compute (or refresh) the DRAFT snapshot for a period, on admin demand.
 * A published snapshot for the period is the record and is never recomputed.
 */
export async function recomputeScorecardSnapshot(
  period: string,
  actorId: string,
): Promise<ComputeResult> {
  if (!isScorecardPeriod(period)) return { ok: false, error: "period_invalid" };
  if (!isValidScorecardPeriodForCompute(period)) return { ok: false, error: "period_in_future" };
  const rows = await collectScorecardRows();
  const data = aggregateScorecard({ period, ...rows });
  const now = new Date().toISOString();
  let snapshot: ScorecardSnapshot;
  let created: boolean;
  const existing = await findSnapshotByPeriod(period);
  if (existing?.status === "PUBLISHED") return { ok: false, error: "period_published" };
  if (existing) {
    snapshot = { ...existing, data, computedAt: now, updatedAt: now };
    created = false;
  } else {
    snapshot = {
      id: randomUUID(),
      period,
      computedAt: now,
      data,
      status: "DRAFT",
      publishedAt: null,
      publishedBy: null,
      notesEn: null,
      notesHi: null,
      createdAt: now,
      updatedAt: now,
    };
    created = true;
  }
  await storeSnapshot(snapshot);
  await writeAuditLog({
    eventType: "ORG_SCORECARD_COMPUTED",
    entityType: "ScorecardSnapshot",
    entityId: snapshot.id,
    actorId,
    data: { period, created, platforms: data.platforms.length },
  });
  return { ok: true, snapshot, created };
}

/**
 * The maintenance cron's variant: create the latest completed quarter's
 * snapshot only when it does not exist yet. Never recomputes (an admin may
 * have annotated a draft) and never touches a published record.
 */
export async function ensureLatestScorecardSnapshot(
  now = new Date(),
): Promise<{ period: ScorecardPeriod; created: boolean }> {
  const period = latestCompletedScorecardPeriod(now);
  if (await findSnapshotByPeriod(period)) return { period, created: false };
  const rows = await collectScorecardRows();
  const data = aggregateScorecard({ period, ...rows });
  const iso = now.toISOString();
  const snapshot: ScorecardSnapshot = {
    id: randomUUID(),
    period,
    computedAt: iso,
    data,
    status: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    notesEn: null,
    notesHi: null,
    createdAt: iso,
    updatedAt: iso,
  };
  await storeSnapshot(snapshot);
  await writeAuditLog({
    eventType: "ORG_SCORECARD_COMPUTED",
    entityType: "ScorecardSnapshot",
    entityId: snapshot.id,
    actorId: "cron:maintenance",
    data: { period, created: true, platforms: data.platforms.length, source: "cron" },
  });
  return { period, created: true };
}

export async function saveScorecardNote(
  id: string,
  input: z.infer<typeof scorecardNoteSchema>,
  actorId: string,
): Promise<{ ok: true; snapshot: ScorecardSnapshot } | { ok: false; error: "snapshot_not_found" | "snapshot_published" }> {
  const current = await findSnapshotById(id);
  if (!current) return { ok: false, error: "snapshot_not_found" };
  if (current.status === "PUBLISHED") return { ok: false, error: "snapshot_published" };
  const updated: ScorecardSnapshot = {
    ...current,
    notesEn: input.notesEn ?? current.notesEn,
    notesHi: input.notesHi ?? current.notesHi,
    updatedAt: new Date().toISOString(),
  };
  await storeSnapshot(updated);
  await writeAuditLog({
    eventType: "ORG_SCORECARD_NOTE_SAVED",
    entityType: "ScorecardSnapshot",
    entityId: id,
    actorId,
    data: { period: current.period, hasEn: updated.notesEn != null, hasHi: updated.notesHi != null },
  });
  return { ok: true, snapshot: updated };
}

export async function publishScorecardSnapshot(
  id: string,
  actorId: string,
): Promise<
  { ok: true; snapshot: ScorecardSnapshot } | { ok: false; error: "snapshot_not_found" | "snapshot_published" }
> {
  const current = await findSnapshotById(id);
  if (!current) return { ok: false, error: "snapshot_not_found" };
  if (current.status === "PUBLISHED") return { ok: false, error: "snapshot_published" };
  const now = new Date().toISOString();
  const published: ScorecardSnapshot = { ...current, status: "PUBLISHED", publishedAt: now, publishedBy: actorId, updatedAt: now };
  await storeSnapshot(published);
  await writeAuditLog({
    eventType: "ORG_SCORECARD_PUBLISHED",
    entityType: "ScorecardSnapshot",
    entityId: id,
    actorId,
    data: { period: current.period, platforms: current.data.platforms.length },
  });
  return { ok: true, snapshot: published };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

async function storeSnapshot(snapshot: ScorecardSnapshot) {
  if (devNoDb()) {
    remember(snapshot);
    return;
  }
  const { db } = await import("@/lib/db");
  const fields = {
    period: snapshot.period,
    computedAt: new Date(snapshot.computedAt),
    data: snapshot.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
    status: snapshot.status,
    publishedAt: snapshot.publishedAt ? new Date(snapshot.publishedAt) : null,
    publishedBy: snapshot.publishedBy,
    notesEn: snapshot.notesEn,
    notesHi: snapshot.notesHi,
  };
  await db.scorecardSnapshot.upsert({
    where: { period: snapshot.period },
    create: { id: snapshot.id, ...fields, createdAt: new Date(snapshot.createdAt), updatedAt: new Date(snapshot.updatedAt) },
    update: { ...fields, updatedAt: new Date(snapshot.updatedAt) },
  });
}

async function findSnapshotByPeriod(period: ScorecardPeriod): Promise<ScorecardSnapshot | null> {
  if (devNoDb()) return scorecardSnapshots.find((entry) => entry.period === period) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.scorecardSnapshot.findUnique({ where: { period } });
  return row ? rowToSnapshot(row) : null;
}

async function findSnapshotById(id: string): Promise<ScorecardSnapshot | null> {
  if (devNoDb()) return scorecardSnapshots.find((entry) => entry.id === id) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.scorecardSnapshot.findUnique({ where: { id } });
  return row ? rowToSnapshot(row) : null;
}

/** The admin list: every snapshot, newest period first. */
export async function listScorecardSnapshots(): Promise<ScorecardSnapshot[]> {
  if (devNoDb()) {
    return [...scorecardSnapshots].sort((a, b) => b.period.localeCompare(a.period));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.scorecardSnapshot.findMany({ orderBy: { period: "desc" } });
  return rows.map(rowToSnapshot);
}

export async function getScorecardSnapshotById(id: string): Promise<ScorecardSnapshot | null> {
  return findSnapshotById(id);
}

/** A published snapshot by period, or null — drafts are never public. */
export async function getPublishedScorecard(period: ScorecardPeriod): Promise<ScorecardSnapshot | null> {
  const snapshot = await findSnapshotByPeriod(period);
  return snapshot?.status === "PUBLISHED" ? snapshot : null;
}

export async function listPublishedScorecardPeriods(): Promise<ScorecardPeriod[]> {
  if (devNoDb()) {
    return scorecardSnapshots
      .filter((entry) => entry.status === "PUBLISHED")
      .map((entry) => entry.period)
      .sort((a, b) => b.localeCompare(a));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.scorecardSnapshot.findMany({
    where: { status: "PUBLISHED" },
    select: { period: true },
    orderBy: { period: "desc" },
  });
  return rows.map((row) => row.period);
}

export async function latestPublishedScorecard(): Promise<ScorecardSnapshot | null> {
  if (devNoDb()) {
    const published = scorecardSnapshots
      .filter((entry) => entry.status === "PUBLISHED")
      .sort((a, b) => b.period.localeCompare(a.period));
    return published[0] ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.scorecardSnapshot.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { period: "desc" },
  });
  return row ? rowToSnapshot(row) : null;
}

/** Whether the public scorecard exists at all — gates the nav link and the
 * sitemap entry, which stay absent until the first publish. */
export async function hasPublishedScorecard(): Promise<boolean> {
  if (devNoDb()) {
    return scorecardSnapshots.some((entry) => entry.status === "PUBLISHED");
  }
  try {
    const { db } = await import("@/lib/db");
    const row = await db.scorecardSnapshot.findFirst({ where: { status: "PUBLISHED" }, select: { id: true } });
    return row != null;
  } catch {
    // This check runs in AppShell on every public page render, so it must be
    // total: an unreachable or not-yet-provisioned database (the e2e harness
    // starts the dev server before global-setup provisions it) must not take
    // pages down. No database, no proof of a publish — the nav link and the
    // sitemap entry stay hidden, exactly like before the first publish. Same
    // rule as SupporterLogos' partner lookup.
    return false;
  }
}
