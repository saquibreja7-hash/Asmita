import { randomUUID } from "node:crypto";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { SYSTEM_REVIEW_REASONS, REASON_OTHER_CODE } from "@/lib/review-reason-seeds";
import { getReviewAdapter } from "@/lib/review-adapters";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { writeAuditLog } from "@/lib/audit";

/*
 * The review console's internal reasons (review-console-spec.md, WP142) on
 * the three backends every Asmita module has — the memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker (Hyperdrive) and Prisma
 * otherwise. Reasons are config, never survivor data: a code and a plain
 * factual label per (queue, decision).
 *
 * A reason is never deleted, only deactivated, so a decision that used it
 * always keeps its label (decisions store the stable code). "Other" is the
 * spec's "Other (explain)": its explanation lives in the reason note, which
 * decideJob requires for that code.
 */

/** The seeded reason code whose label is "Other (explain)". */
export const REASON_NOTE_CODE = REASON_OTHER_CODE;

/** A reason code is a stable, lowercase machine code (never display text). */
export const REASON_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

export const REASON_LABEL_MAX = 100;

/** Whether a reason code requires a note with it ("Other (explain)"). */
export { reasonRequiresNote } from "@/lib/review-reason-seeds";

export type ReviewReasonRow = {
  id: string;
  queueKey: string;
  decision: string;
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
};

type MemoryReasonRow = ReviewReasonRow;

// On globalThis for the same reason as the case notes: next dev can
// instantiate one module per bundle, and the reason store must be one per
// server process, or the picker and decideJob would read different rows.
const reasonGlobals = globalThis as typeof globalThis & { __asmitaReviewReasons?: Map<string, MemoryReasonRow> };

function reasonMemory(): Map<string, MemoryReasonRow> {
  reasonGlobals.__asmitaReviewReasons ??= new Map();
  return reasonGlobals.__asmitaReviewReasons;
}

let reasonsEnsured = false;

/** Test seam: clears the memory reasons and the ensure-once flag. */
export function resetReviewReasonMemory(): void {
  reasonGlobals.__asmitaReviewReasons = undefined;
  reasonsEnsured = false;
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function reasonKey(queueKey: string, decision: string, code: string) {
  return `${queueKey}\u0000${decision}\u0000${code}`;
}

function toRow(row: ReviewReasonRow): ReviewReasonRow {
  return { ...row };
}

function sortReasons(rows: ReviewReasonRow[]) {
  return rows.sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime());
}

/**
 * Creates the seeded reasons if they are missing. Idempotent and
 * create-only: a SUPER_ADMIN's later renames, reorders and deactivations
 * are never clobbered by a re-run.
 */
export async function ensureSystemReviewReasons(): Promise<void> {
  if (reasonsEnsured) return;
  if (isDevNoDb()) {
    const now = new Date();
    for (const seed of SYSTEM_REVIEW_REASONS) {
      if (![...reasonMemory().values()].some((row) => row.queueKey === seed.queueKey && row.decision === seed.decision && row.code === seed.code)) {
        const row: MemoryReasonRow = { id: randomUUID(), ...seed, active: true, createdAt: now };
        reasonMemory().set(row.id, row);
      }
    }
  } else if (usesWorkerKysely()) {
    await getWorkerDb()
      .insertInto("ReviewReason")
      .values(
        SYSTEM_REVIEW_REASONS.map((seed) => ({
          id: randomUUID(),
          queueKey: seed.queueKey,
          decision: seed.decision,
          code: seed.code,
          label: seed.label,
          active: true,
          sortOrder: seed.sortOrder,
          createdAt: new Date(),
        })),
      )
      .onConflict((oc) => oc.columns(["queueKey", "decision", "code"]).doNothing())
      .execute();
  } else {
    const { db } = await import("@/lib/db");
    for (const seed of SYSTEM_REVIEW_REASONS) {
      await db.reviewReason.upsert({
        where: { queueKey_decision_code: { queueKey: seed.queueKey, decision: seed.decision, code: seed.code } },
        create: { ...seed, active: true },
        update: {},
      });
    }
  }
  reasonsEnsured = true;
}

/**
 * The queue's reasons, in pick order. With decision, only that decision's;
 * with activeOnly, only the ones the picker may offer (inactive reasons stay
 * readable so old decisions keep their label).
 */
export async function listReviewReasons(
  queueKey: string,
  decision?: string,
  options: { activeOnly?: boolean } = {},
): Promise<ReviewReasonRow[]> {
  await ensureSystemReviewReasons();
  if (isDevNoDb()) {
    const rows = [...reasonMemory().values()]
      .filter((row) => row.queueKey === queueKey)
      .filter((row) => decision === undefined || row.decision === decision)
      .filter((row) => !options.activeOnly || row.active);
    return sortReasons(rows).map(toRow);
  }
  let rows: ReviewReasonRow[];
  if (usesWorkerKysely()) {
    let query = getWorkerDb().selectFrom("ReviewReason").selectAll().where("queueKey", "=", queueKey);
    if (decision !== undefined) query = query.where("decision", "=", decision);
    if (options.activeOnly) query = query.where("active", "=", true);
    rows = (await query.orderBy("sortOrder", "asc").orderBy("createdAt", "asc").execute()) as unknown as ReviewReasonRow[];
  } else {
    const { db } = await import("@/lib/db");
    rows = (await db.reviewReason.findMany({
      where: {
        queueKey,
        ...(decision !== undefined ? { decision } : {}),
        ...(options.activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })) as unknown as ReviewReasonRow[];
  }
  return rows.map(toRow);
}

/** One reason by its stable code, active or not — decideJob checks active. */
export async function getReviewReasonByCode(
  queueKey: string,
  decision: string,
  code: string,
): Promise<ReviewReasonRow | null> {
  await ensureSystemReviewReasons();
  if (isDevNoDb()) {
    const row = [...reasonMemory().values()].find((item) => item.queueKey === queueKey && item.decision === decision && item.code === code);
    return row ? toRow(row) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewReason").selectAll()
      .where("queueKey", "=", queueKey).where("decision", "=", decision).where("code", "=", code)
      .executeTakeFirst();
    return row ? toRow(row as unknown as ReviewReasonRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewReason.findUnique({
    where: { queueKey_decision_code: { queueKey, decision, code } },
  });
  return row ? toRow(row as unknown as ReviewReasonRow) : null;
}

async function getReviewReasonById(reasonId: string): Promise<ReviewReasonRow | null> {
  await ensureSystemReviewReasons();
  if (isDevNoDb()) {
    const row = reasonMemory().get(reasonId);
    return row ? toRow(row) : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewReason").selectAll().where("id", "=", reasonId).executeTakeFirst();
    return row ? toRow(row as unknown as ReviewReasonRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewReason.findUnique({ where: { id: reasonId } });
  return row ? toRow(row as unknown as ReviewReasonRow) : null;
}

export type ReasonAdminResult = { ok: true; reason: ReviewReasonRow } | { ok: false; error: string };

/**
 * Adds a reason to a queue's decision. review:manage only (WP144 moved this
 * gate from the SUPER_ADMIN role to the permission; the permission is
 * SUPER_ADMIN's alone today); the decision must be one the queue's adapter
 * actually offers, so a reason can never exist for a decision nobody can
 * take.
 */
export async function addReviewReason(input: {
  queueKey: string;
  decision: string;
  code: string;
  label: string;
  role: AdminRole;
  actorId: string;
}): Promise<ReasonAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  // Loaded lazily: review-jobs imports this module for decideJob's reason
  // validation, and a dynamic import keeps that cycle out of module init.
  const { getReviewQueueByKey } = await import("@/lib/review-jobs");
  const queue = await getReviewQueueByKey(input.queueKey);
  if (!queue) return { ok: false, error: "queue_not_found" };
  if (queue.protected) return { ok: false, error: "protected_queue" };
  const adapter = queue.subjectKind === null ? null : await getReviewAdapter(queue.subjectKind);
  if (!adapter || !adapter.decisions.some((item) => item.code === input.decision)) {
    return { ok: false, error: "invalid_decision" };
  }
  const code = input.code.trim();
  if (!REASON_CODE_PATTERN.test(code)) return { ok: false, error: "invalid_code" };
  const label = input.label.trim();
  if (!label || label.length > REASON_LABEL_MAX) return { ok: false, error: "invalid_label" };
  if (await getReviewReasonByCode(input.queueKey, input.decision, code)) return { ok: false, error: "reason_exists" };
  const existing = await listReviewReasons(input.queueKey, input.decision);
  const sortOrder = (existing.length ? Math.max(...existing.map((row) => row.sortOrder)) : 0) + 10;

  let created: ReviewReasonRow;
  if (isDevNoDb()) {
    created = { id: randomUUID(), queueKey: input.queueKey, decision: input.decision, code, label, active: true, sortOrder, createdAt: new Date() };
    reasonMemory().set(created.id, created);
  } else if (usesWorkerKysely()) {
    const row = await getWorkerDb().insertInto("ReviewReason")
      .values({ id: randomUUID(), queueKey: input.queueKey, decision: input.decision, code, label, active: true, sortOrder, createdAt: new Date() })
      .onConflict((oc) => oc.columns(["queueKey", "decision", "code"]).doNothing())
      .returningAll().executeTakeFirst();
    if (!row) return { ok: false, error: "reason_exists" };
    created = toRow(row as unknown as ReviewReasonRow);
  } else {
    const { db } = await import("@/lib/db");
    try {
      const row = await db.reviewReason.create({
        data: { queueKey: input.queueKey, decision: input.decision, code, label, active: true, sortOrder },
      });
      created = toRow(row as unknown as ReviewReasonRow);
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return { ok: false, error: "reason_exists" };
      throw err;
    }
  }
  await auditReasonChange(input.actorId, "add", created);
  return { ok: true, reason: created };
}

/** Renames a reason. The code never changes, so decisions keep pointing at it. */
export async function renameReviewReason(input: {
  reasonId: string;
  label: string;
  role: AdminRole;
  actorId: string;
}): Promise<ReasonAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const reason = await getReviewReasonById(input.reasonId);
  if (!reason) return { ok: false, error: "reason_not_found" };
  const label = input.label.trim();
  if (!label || label.length > REASON_LABEL_MAX) return { ok: false, error: "invalid_label" };
  await updateReasonRow(reason.id, { label });
  await auditReasonChange(input.actorId, "rename", { ...reason, label });
  return { ok: true, reason: { ...reason, label } };
}

/** Deactivates or reactivates a reason. Deletion does not exist. */
export async function setReviewReasonActive(input: {
  reasonId: string;
  active: boolean;
  role: AdminRole;
  actorId: string;
}): Promise<ReasonAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const reason = await getReviewReasonById(input.reasonId);
  if (!reason) return { ok: false, error: "reason_not_found" };
  await updateReasonRow(reason.id, { active: input.active });
  await auditReasonChange(input.actorId, input.active ? "activate" : "deactivate", { ...reason, active: input.active });
  return { ok: true, reason: { ...reason, active: input.active } };
}

/** Moves a reason one step up or down in its (queue, decision) pick order. */
export async function moveReviewReason(input: {
  reasonId: string;
  direction: "up" | "down";
  role: AdminRole;
  actorId: string;
}): Promise<ReasonAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const reason = await getReviewReasonById(input.reasonId);
  if (!reason) return { ok: false, error: "reason_not_found" };
  const group = await listReviewReasons(reason.queueKey, reason.decision);
  const index = group.findIndex((row) => row.id === reason.id);
  const target = input.direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= group.length) return { ok: true, reason };
  const neighbour = group[target]!;

  if (isDevNoDb()) {
    const left = reasonMemory().get(reason.id)!;
    const right = reasonMemory().get(neighbour.id)!;
    const swap = left.sortOrder;
    left.sortOrder = right.sortOrder;
    right.sortOrder = swap;
  } else if (usesWorkerKysely()) {
    await getWorkerDb().transaction().execute(async (trx) => {
      await trx.updateTable("ReviewReason").set({ sortOrder: neighbour.sortOrder }).where("id", "=", reason.id).execute();
      await trx.updateTable("ReviewReason").set({ sortOrder: reason.sortOrder }).where("id", "=", neighbour.id).execute();
    });
  } else {
    const { db } = await import("@/lib/db");
    await db.$transaction(async (tx) => {
      await tx.reviewReason.update({ where: { id: reason.id }, data: { sortOrder: neighbour.sortOrder } });
      await tx.reviewReason.update({ where: { id: neighbour.id }, data: { sortOrder: reason.sortOrder } });
    });
  }
  const moved = { ...reason, sortOrder: neighbour.sortOrder };
  await auditReasonChange(input.actorId, `move_${input.direction}`, moved);
  return { ok: true, reason: moved };
}

async function updateReasonRow(reasonId: string, data: { label?: string; active?: boolean }): Promise<void> {
  if (isDevNoDb()) {
    const row = reasonMemory().get(reasonId);
    if (row) Object.assign(row, data);
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("ReviewReason").set(data).where("id", "=", reasonId).execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.reviewReason.update({ where: { id: reasonId }, data });
}

/**
 * Reason changes are console config, not case decisions; they audit as
 * ADMIN_ACTION with ids and the action only, never a note.
 */
async function auditReasonChange(actorId: string, action: string, reason: ReviewReasonRow): Promise<void> {
  await writeAuditLog({
    eventType: "ADMIN_ACTION",
    entityType: "ReviewReason",
    entityId: reason.id,
    actorId,
    data: { action, queueKey: reason.queueKey, decision: reason.decision, code: reason.code },
  });
}

/**
 * The label lookup for decision views: every reason's label by
 * queue/decision/code, inactive included, so an old decision always shows
 * the label it was taken with (or its code if the row is somehow missing).
 */
export async function reasonLabelIndex(): Promise<Map<string, string>> {
  await ensureSystemReviewReasons();
  const index = new Map<string, string>();
  if (isDevNoDb()) {
    for (const row of reasonMemory().values()) index.set(reasonKey(row.queueKey, row.decision, row.code), row.label);
    return index;
  }
  let rows: ReviewReasonRow[];
  if (usesWorkerKysely()) {
    rows = (await getWorkerDb().selectFrom("ReviewReason")
      .select(["queueKey", "decision", "code", "label"]).execute()) as unknown as ReviewReasonRow[];
  } else {
    const { db } = await import("@/lib/db");
    rows = (await db.reviewReason.findMany({
      select: { queueKey: true, decision: true, code: true, label: true },
    })) as unknown as ReviewReasonRow[];
  }
  for (const row of rows) index.set(reasonKey(row.queueKey, row.decision, row.code), row.label);
  return index;
}
