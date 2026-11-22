import { randomUUID } from "node:crypto";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { containsUrlLikeText } from "@/lib/url-like-text";
import { writeAuditLog } from "@/lib/audit";
import { getReviewAdapter, type ReviewSubjectKind } from "@/lib/review-adapters";
import type { ReviewQueueRow } from "@/lib/review-jobs";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Review console routing rules (review-console-spec.md, WP143) on the three
 * backends every Asmita module has — the memory store without DATABASE_URL
 * (dev/tests), Kysely on the Worker (Hyperdrive) and Prisma otherwise.
 *
 * The single most important rule of the console holds here in capital
 * letters: A ROUTING RULE ONLY EVER CHOOSES A QUEUE AND A PRIORITY. It never
 * decides, approves, rejects, dispatches, labels, sends email or changes a
 * gate — the evaluation path below contains no call to any decision
 * function, and the tests pin that. It can never route into or out of the
 * protected minor-hold queue (the minor check runs before any rule, on the
 * caller's side, and a destination queue that is protected, archived or of
 * another kind is refused on save and skipped at evaluation).
 *
 * Conditions read a fixed, typed allowlist of fields per kind, owned by the
 * kind's adapter (review-adapters.ts): existing columns only, never survivor
 * free text, never an address. Rule names and descriptions refuse
 * address-like text like the case notes do, and the routing log carries ids,
 * booleans and outcome codes only.
 */

export type ReviewRuleStatus = "DRAFT" | "LIVE" | "DISABLED";
export const REVIEW_RULE_STATUSES: readonly ReviewRuleStatus[] = ["DRAFT", "LIVE", "DISABLED"];

export type RoutingOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "is_empty";
export const ROUTING_OPS: readonly RoutingOp[] = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "is_empty"];

export type RoutingLeaf = { field: string; op: RoutingOp; value?: string | number | readonly string[] | null };

/** { all: [...] } or { any: [...] } — one level, no nesting in v1. */
export type RoutingCondition = { all: RoutingLeaf[] } | { any: RoutingLeaf[] };

export type RoutingFieldType = "enum" | "string" | "number" | "set";

/**
 * One routable fact of one kind. `values` is the closed value list of an
 * enum field; a `set` field holds codes (labels, flag reasons) and matches
 * per code; `emptyPossible` says the value can be missing, which `is_empty`
 * matches.
 */
export type RoutingFieldDef = {
  key: string;
  label: string;
  type: RoutingFieldType;
  values?: readonly string[];
  ops: readonly RoutingOp[];
  emptyPossible: boolean;
  /** What the builder shows when the value is missing, e.g. "Unknown platform". */
  emptyLabel: string;
};

/** The facts of one subject, by field key. A set field's value is a code list. */
export type RoutingFacts = Partial<Record<string, string | number | readonly string[] | null>>;

export const CONDITION_MAX_LEAVES = 10;
export const CONDITION_IN_MAX = 20;
export const RULE_NAME_MAX = 80;
export const RULE_DESCRIPTION_MAX = 240;
export const RULE_PRIORITY_MAX = 100;

export type ReviewRoutingRuleRow = {
  id: string;
  name: string;
  description: string | null;
  subjectKind: ReviewSubjectKind;
  sequence: number;
  condition: RoutingCondition;
  destinationQueueId: string;
  priority: number;
  status: ReviewRuleStatus;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewRoutingRuleVersionRow = {
  id: string;
  ruleId: string;
  version: number;
  name: string;
  description: string | null;
  subjectKind: ReviewSubjectKind;
  sequence: number;
  condition: RoutingCondition;
  destinationQueueId: string;
  priority: number;
  status: ReviewRuleStatus;
  createdBy: string;
  savedAt: Date;
};

export type ReviewRoutingLogRow = {
  id: string;
  jobId: string;
  ruleId: string | null;
  ruleVersion: number | null;
  matched: boolean;
  details: Record<string, unknown> | null;
  createdAt: Date;
};

type MemoryRoutingState = {
  rules: Map<string, ReviewRoutingRuleRow>;
  versions: Map<string, ReviewRoutingRuleVersionRow>;
  logs: Map<string, ReviewRoutingLogRow>;
};

// On globalThis, like the store and the review memory: next dev can
// instantiate one module per bundle, and the routing store must be one per
// server process, or the page and the route handler would read two stores.
const routingGlobals = globalThis as typeof globalThis & { __asmitaReviewRouting?: MemoryRoutingState };

function routingMemory(): MemoryRoutingState {
  routingGlobals.__asmitaReviewRouting ??= {
    rules: new Map(),
    versions: new Map(),
    logs: new Map(),
  };
  return routingGlobals.__asmitaReviewRouting;
}

/** Test seam: clears the memory rules, versions and logs. */
export function resetReviewRoutingMemory(): void {
  routingGlobals.__asmitaReviewRouting = undefined;
}

/** Test seam: the raw memory rows, for the no-address assertions. */
export function routingRowsForTest(): { rules: ReviewRoutingRuleRow[]; logs: ReviewRoutingLogRow[] } {
  const memory = routingMemory();
  return { rules: [...memory.rules.values()], logs: [...memory.logs.values()] };
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Field allowlist (owned by the adapters) and condition validation

/** The kind's routable fields, from its adapter. Empty when the kind has none. */
export async function routingFieldsForKind(kind: ReviewSubjectKind): Promise<readonly RoutingFieldDef[]> {
  const adapter = await getReviewAdapter(kind);
  return adapter?.routingFields ?? [];
}

function fieldDef(fields: readonly RoutingFieldDef[], key: string): RoutingFieldDef | null {
  return fields.find((field) => field.key === key) ?? null;
}

function validScalar(def: RoutingFieldDef, value: unknown): boolean {
  if (def.type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (def.type === "enum") return (def.values ?? []).includes(value);
  // eq/neq on a set field name one code.
  return true;
}

/**
 * Validates a condition against the kind's allowlist. Unknown fields, wrong
 * operators for the field's type, wrong value types, out-of-list enum
 * values, nesting and oversized conditions are all refused (spec WP143.2).
 */
export function validateRoutingCondition(
  kind: ReviewSubjectKind,
  condition: unknown,
): Promise<{ ok: true; condition: RoutingCondition } | { ok: false; error: string }> {
  return validateRoutingConditionAgainst(kind, condition, undefined);
}

async function validateRoutingConditionAgainst(
  kind: ReviewSubjectKind,
  condition: unknown,
  fields: readonly RoutingFieldDef[] | undefined,
): Promise<{ ok: true; condition: RoutingCondition } | { ok: false; error: string }> {
  const allow = fields ?? (await routingFieldsForKind(kind));
  const shape = condition as { all?: unknown; any?: unknown } | null;
  if (!shape || typeof shape !== "object" || Array.isArray(shape)) return { ok: false, error: "invalid_condition" };
  const hasAll = Object.prototype.hasOwnProperty.call(shape, "all");
  const hasAny = Object.prototype.hasOwnProperty.call(shape, "any");
  if (hasAll === hasAny) return { ok: false, error: "invalid_condition" };
  const leaves = (hasAll ? shape.all : shape.any) as unknown;
  if (!Array.isArray(leaves) || leaves.length === 0 || leaves.length > CONDITION_MAX_LEAVES) {
    return { ok: false, error: "invalid_condition" };
  }
  const cleanLeaves: RoutingLeaf[] = [];
  for (const raw of leaves) {
    const leaf = raw as RoutingLeaf | null;
    if (!leaf || typeof leaf !== "object" || Array.isArray(leaf)) return { ok: false, error: "invalid_condition" };
    if (typeof leaf.field !== "string" || typeof leaf.op !== "string") return { ok: false, error: "invalid_condition" };
    const def = fieldDef(allow, leaf.field);
    if (!def) return { ok: false, error: "unknown_field" };
    if (!def.ops.includes(leaf.op as RoutingOp)) return { ok: false, error: "invalid_op" };
    if (leaf.op === "is_empty") {
      if (leaf.value !== undefined && leaf.value !== null) return { ok: false, error: "invalid_value" };
      cleanLeaves.push({ field: def.key, op: "is_empty", value: null });
      continue;
    }
    if (leaf.op === "in") {
      if (!Array.isArray(leaf.value) || leaf.value.length === 0 || leaf.value.length > CONDITION_IN_MAX) {
        return { ok: false, error: "invalid_value" };
      }
      if (!leaf.value.every((item) => validScalar(def, item))) return { ok: false, error: "invalid_value" };
      cleanLeaves.push({ field: def.key, op: "in", value: [...leaf.value] as string[] });
      continue;
    }
    if (leaf.value === undefined || leaf.value === null) return { ok: false, error: "invalid_value" };
    if (!validScalar(def, leaf.value)) return { ok: false, error: "invalid_value" };
    cleanLeaves.push({ field: def.key, op: leaf.op as RoutingOp, value: leaf.value });
  }
  return { ok: true, condition: (hasAll ? { all: cleanLeaves } : { any: cleanLeaves }) as RoutingCondition };
}

/** Reads a stored condition back; null when the row is not a condition we wrote. */
function parseStoredCondition(stored: unknown): RoutingCondition | null {
  const shape = stored as { all?: unknown; any?: unknown } | null;
  if (!shape || typeof shape !== "object" || Array.isArray(shape)) return null;
  const hasAll = Object.prototype.hasOwnProperty.call(shape, "all");
  const hasAny = Object.prototype.hasOwnProperty.call(shape, "any");
  if (hasAll === hasAny) return null;
  const leaves = (hasAll ? shape.all : shape.any) as unknown;
  if (!Array.isArray(leaves) || leaves.length === 0) return null;
  return (hasAll ? { all: leaves as RoutingLeaf[] } : { any: leaves as RoutingLeaf[] }) as RoutingCondition;
}

// ---------------------------------------------------------------------------
// Evaluation

/** One leaf against the facts. A rule with an unreadable condition never matches. */
export function evaluateLeaf(leaf: RoutingLeaf, facts: RoutingFacts, fields: readonly RoutingFieldDef[]): boolean {
  const def = fieldDef(fields, leaf.field);
  if (!def) return false;
  const value = facts[leaf.field];
  if (def.type === "set") {
    const set = Array.isArray(value) ? value : value == null ? [] : [value];
    const has = (code: string) => set.includes(code);
    switch (leaf.op) {
      case "is_empty":
        return set.length === 0;
      case "eq":
        return typeof leaf.value === "string" ? has(leaf.value) : false;
      case "neq":
        return typeof leaf.value === "string" ? !has(leaf.value) : false;
      case "in":
        return Array.isArray(leaf.value) ? leaf.value.some((code) => typeof code === "string" && has(code)) : false;
      default:
        return false;
    }
  }
  if (leaf.op === "is_empty") {
    return value === null || value === undefined || value === "";
  }
  if (def.type === "number") {
    if (typeof value !== "number" || typeof leaf.value !== "number") return false;
    switch (leaf.op) {
      case "eq":
        return value === leaf.value;
      case "neq":
        return value !== leaf.value;
      case "lt":
        return value < leaf.value;
      case "lte":
        return value <= leaf.value;
      case "gt":
        return value > leaf.value;
      case "gte":
        return value >= leaf.value;
      default:
        return false;
    }
  }
  // A missing value never satisfies a comparison, not even neq.
  if (value === null || value === undefined || value === "") return false;
  switch (leaf.op) {
    case "eq":
      return value === leaf.value;
    case "neq":
      return value !== leaf.value;
    case "in":
      return Array.isArray(leaf.value) && leaf.value.includes(value as string);
    default:
      return false;
  }
}

export function evaluateCondition(
  condition: RoutingCondition,
  facts: RoutingFacts,
  fields: readonly RoutingFieldDef[],
): boolean {
  const leaves = "all" in condition ? condition.all : condition.any;
  const results = leaves.map((leaf) => evaluateLeaf(leaf, facts, fields));
  return "all" in condition ? results.every(Boolean) : results.some(Boolean);
}

export type RuleEvaluation = {
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  matched: boolean;
  /** routed | would_have_matched | no_match | invalid_destination | not_reached */
  outcome: string;
};

export type RouteSubjectResult = {
  /** The queue a LIVE rule chose, or null for the kind's default queue. */
  destination: { queue: ReviewQueueRow; priority: number; ruleId: string; ruleVersion: number } | null;
  /** Every rule the pass consulted, in sequence order, for the routing log. */
  evaluations: RuleEvaluation[];
  /** How many LIVE or DRAFT rules the kind has (0 skips facts entirely). */
  ruleCount: number;
};

/** Whether a queue may still receive routed jobs. */
function routeableQueue(queue: ReviewQueueRow, kind: ReviewSubjectKind): boolean {
  return !queue.protected && queue.archivedAt === null && queue.subjectKind === kind;
}

async function allReviewQueues(): Promise<ReviewQueueRow[]> {
  // Lazy: review-jobs imports this module for enqueue and sync, so importing
  // it back here at module init would be a cycle (the review-reasons pattern).
  const { listReviewQueues } = await import("@/lib/review-jobs");
  return listReviewQueues();
}

/**
 * The routing pass for one subject: LIVE rules of the kind in sequence
 * order, the first valid match wins; DRAFT rules are evaluated until then
 * and logged as would-have-matched; a rule whose destination queue is no
 * longer valid is skipped. The minor check is NOT here — the caller runs it
 * first and never routes a possible minor through rules at all.
 */
export async function routeSubjectForKind(
  kind: ReviewSubjectKind,
  subjectId: string,
  now: Date,
  cache: { rules?: ReviewRoutingRuleRow[]; queues?: ReviewQueueRow[] } = {},
): Promise<RouteSubjectResult> {
  const rules = (cache.rules ?? (await listRoutingRules(kind))).filter((rule) => rule.status !== "DISABLED");
  const result: RouteSubjectResult = { destination: null, evaluations: [], ruleCount: rules.length };
  if (rules.length === 0) return result;
  const fields = await routingFieldsForKind(kind);
  if (fields.length === 0) return result;
  const adapter = await getReviewAdapter(kind);
  if (!adapter?.routingFacts) return result;
  const facts = await adapter.routingFacts(subjectId, now);
  if (!facts) return result;
  const queues = cache.queues ?? (await allReviewQueues());

  for (const rule of rules) {
    const condition = parseStoredCondition(rule.condition);
    const matched = condition !== null && evaluateCondition(condition, facts, fields);
    if (!matched) {
      result.evaluations.push({ ruleId: rule.id, ruleVersion: rule.version, ruleName: rule.name, matched: false, outcome: "no_match" });
      continue;
    }
    const queue = queues.find((item) => item.id === rule.destinationQueueId) ?? null;
    if (!queue || !routeableQueue(queue, kind)) {
      // A destination that stopped being valid can never route anything;
      // the pass continues to the next rule. Refusing on save keeps this a
      // defence, not a path.
      result.evaluations.push({ ruleId: rule.id, ruleVersion: rule.version, ruleName: rule.name, matched: true, outcome: "invalid_destination" });
      continue;
    }
    if (rule.status === "DRAFT") {
      result.evaluations.push({ ruleId: rule.id, ruleVersion: rule.version, ruleName: rule.name, matched: true, outcome: "would_have_matched" });
      continue;
    }
    result.destination = { queue, priority: rule.priority, ruleId: rule.id, ruleVersion: rule.version };
    result.evaluations.push({ ruleId: rule.id, ruleVersion: rule.version, ruleName: rule.name, matched: true, outcome: "routed" });
    return result;
  }
  return result;
}

/**
 * Writes the routing log rows for one job's evaluation pass. Deduplicated
 * per (job, rule, version): a sync that re-evaluates and changes nothing
 * writes nothing. The details carry the outcome and per-condition booleans
 * only — never a field value, never an address.
 */
export async function recordRoutingEvaluations(jobId: string, evaluations: RuleEvaluation[], now = new Date()): Promise<void> {
  if (evaluations.length === 0) return;
  const rows = evaluations.map((evaluation) => ({
    id: randomUUID(),
    jobId,
    ruleId: evaluation.ruleId,
    ruleVersion: evaluation.ruleVersion,
    matched: evaluation.matched,
    details: { outcome: evaluation.outcome },
    createdAt: now,
  }));
  if (isDevNoDb()) {
    const memory = routingMemory();
    for (const row of rows) {
      const key = logKey(row.jobId, row.ruleId, row.ruleVersion);
      if (!memory.logs.has(key)) memory.logs.set(key, row);
    }
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("ReviewRoutingLog")
      .values(rows)
      .onConflict((oc) => oc.columns(["jobId", "ruleId", "ruleVersion"]).doNothing())
      .execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.reviewRoutingLog.createMany({
    data: rows.map((row) => ({
      jobId: row.jobId,
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      matched: row.matched,
      details: row.details,
    })),
    skipDuplicates: true,
  });
}

function logKey(jobId: string, ruleId: string | null, ruleVersion: number | null) {
  return `${jobId}\u0000${ruleId ?? ""}\u0000${ruleVersion ?? ""}`;
}

/**
 * The job screen's routing explanation (spec: "Routed here by rule X
 * (version N)" or "Default queue"), plus the draft rules that would have
 * matched this job while never taking effect.
 */
export async function routingExplanationForJob(
  job: { routedByRuleId: string | null; routedByRuleVersion: number | null },
  jobId: string,
): Promise<{ line: string; draftLine: string | null } | null> {
  if (job.routedByRuleId) {
    const rule = await getRoutingRuleById(job.routedByRuleId);
    if (rule) {
      return { line: `Routed here by rule ${rule.name} (version ${rule.version})`, draftLine: await draftMatchesForJob(jobId, rule.id) };
    }
    // The rule row is gone (a restore from before WP143): the log still says.
    return { line: `Routed here by a rule that no longer exists (version ${job.routedByRuleVersion ?? "?"})`, draftLine: await draftMatchesForJob(jobId, null) };
  }
  return { line: "Default queue", draftLine: await draftMatchesForJob(jobId, null) };
}

async function draftMatchesForJob(jobId: string, excludeRuleId: string | null): Promise<string | null> {
  const logs = await listRoutingLogsForJob(jobId);
  const ruleIds = [...new Set(logs.filter((row) => row.ruleId && row.ruleId !== excludeRuleId).map((row) => row.ruleId!))];
  if (ruleIds.length === 0) return null;
  const names: string[] = [];
  for (const ruleId of ruleIds) {
    const rule = await getRoutingRuleById(ruleId);
    if (rule?.status === "DRAFT") names.push(`${rule.name} (version ${rule.version})`);
  }
  return names.length > 0 ? `Draft rule${names.length > 1 ? "s" : ""} that would have matched: ${names.join(", ")}` : null;
}

async function listRoutingLogsForJob(jobId: string): Promise<ReviewRoutingLogRow[]> {
  if (isDevNoDb()) {
    return [...routingMemory().logs.values()].filter((row) => row.jobId === jobId).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewRoutingLog").selectAll()
      .where("jobId", "=", jobId).orderBy("createdAt", "asc").execute();
    return rows as unknown as ReviewRoutingLogRow[];
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewRoutingLog.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
  return rows as unknown as ReviewRoutingLogRow[];
}

// ---------------------------------------------------------------------------
// Rule storage

function toRuleRow(row: Omit<ReviewRoutingRuleRow, "condition"> & { condition: unknown }): ReviewRoutingRuleRow {
  return { ...row, condition: parseStoredCondition(row.condition) ?? { any: [{ field: "", op: "is_empty", value: null }] } };
}

export async function listRoutingRules(kind?: ReviewSubjectKind): Promise<ReviewRoutingRuleRow[]> {
  if (isDevNoDb()) {
    return [...routingMemory().rules.values()]
      .filter((rule) => kind === undefined || rule.subjectKind === kind)
      .sort((left, right) => left.sequence - right.sequence || left.createdAt.getTime() - right.createdAt.getTime())
      .map((rule) => ({ ...rule }));
  }
  if (usesWorkerKysely()) {
    let query = getWorkerDb().selectFrom("ReviewRoutingRule").selectAll();
    if (kind) query = query.where("subjectKind", "=", kind);
    const rows = await query.orderBy("sequence", "asc").execute();
    return (rows as unknown as Array<Omit<ReviewRoutingRuleRow, "condition"> & { condition: unknown }>).map(toRuleRow);
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewRoutingRule.findMany({
    where: kind ? { subjectKind: kind } : undefined,
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
  });
  return (rows as unknown as Array<Omit<ReviewRoutingRuleRow, "condition"> & { condition: unknown }>).map(toRuleRow);
}

async function getRoutingRuleById(ruleId: string): Promise<ReviewRoutingRuleRow | null> {
  if (isDevNoDb()) {
    const rule = routingMemory().rules.get(ruleId);
    return rule ? { ...rule } : null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("ReviewRoutingRule").selectAll().where("id", "=", ruleId).executeTakeFirst();
    return row ? toRuleRow(row as never) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.reviewRoutingRule.findUnique({ where: { id: ruleId } });
  return row ? toRuleRow(row as never) : null;
}

/** The rule's versions, newest first — append-only history with who and when. */
export async function listRoutingRuleVersions(ruleId: string): Promise<ReviewRoutingRuleVersionRow[]> {
  if (isDevNoDb()) {
    return [...routingMemory().versions.values()]
      .filter((version) => version.ruleId === ruleId)
      .sort((left, right) => right.version - left.version)
      .map((version) => ({ ...version }));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewRoutingRuleVersion").selectAll()
      .where("ruleId", "=", ruleId).orderBy("version", "desc").execute();
    return rows as unknown as ReviewRoutingRuleVersionRow[];
  }
  const { db } = await import("@/lib/db");
  const rows = await db.reviewRoutingRuleVersion.findMany({ where: { ruleId }, orderBy: { version: "desc" } });
  return rows as unknown as ReviewRoutingRuleVersionRow[];
}

async function appendVersionRow(
  rule: Omit<ReviewRoutingRuleRow, "condition"> & { condition: unknown },
  savedBy: string,
  now: Date,
): Promise<void> {
  const version: Omit<ReviewRoutingRuleVersionRow, "id"> = {
    ruleId: rule.id,
    version: rule.version,
    name: rule.name,
    description: rule.description,
    subjectKind: rule.subjectKind,
    sequence: rule.sequence,
    condition: rule.condition as RoutingCondition,
    destinationQueueId: rule.destinationQueueId,
    priority: rule.priority,
    status: rule.status,
    createdBy: savedBy,
    savedAt: now,
  };
  if (isDevNoDb()) {
    routingMemory().versions.set(randomUUID(), { id: randomUUID(), ...version });
    return;
  }
  if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("ReviewRoutingRuleVersion")
      .values({ id: randomUUID(), ...version })
      .onConflict((oc) => oc.columns(["ruleId", "version"]).doNothing())
      .execute();
    return;
  }
  const { db } = await import("@/lib/db");
  await db.reviewRoutingRuleVersion.create({ data: { id: randomUUID(), ...version } });
}

async function auditRuleChange(actorId: string, action: string, rule: ReviewRoutingRuleRow): Promise<void> {
  await writeAuditLog({
    eventType: "REVIEW_RULE_CHANGED",
    entityType: "ReviewRoutingRule",
    entityId: rule.id,
    actorId,
    // Ids and counts only: never a condition value, never a queue name.
    data: { action, version: rule.version, subjectKind: rule.subjectKind, destinationQueueId: rule.destinationQueueId, status: rule.status },
  });
}

// ---------------------------------------------------------------------------
// Rule admin (review:manage)

export type RuleAdminResult = { ok: true; rule: ReviewRoutingRuleRow } | { ok: false; error: string };

function validPriority(priority: unknown): priority is number {
  return typeof priority === "number" && Number.isInteger(priority) && Math.abs(priority) <= RULE_PRIORITY_MAX;
}

function cleanText(value: unknown, max: number): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) return { ok: false, error: "invalid_name" };
  if (containsUrlLikeText(text)) return { ok: false, error: "links_not_allowed" };
  return { ok: true, text };
}

async function checkDestinationQueue(
  kind: ReviewSubjectKind,
  destinationQueueId: string,
): Promise<{ ok: true; queue: ReviewQueueRow } | { ok: false; error: string }> {
  const { getReviewQueueById } = await import("@/lib/review-jobs");
  const queue = await getReviewQueueById(destinationQueueId);
  if (!queue) return { ok: false, error: "queue_not_found" };
  if (queue.protected || queue.subjectKind === null) return { ok: false, error: "protected_queue" };
  if (queue.subjectKind !== kind) return { ok: false, error: "queue_kind_mismatch" };
  if (queue.archivedAt !== null) return { ok: false, error: "queue_archived" };
  return { ok: true, queue };
}

/**
 * Creates a rule as DRAFT v1. A rule always starts as a draft: switching it
 * LIVE is its own saved version with its own audit event.
 */
export async function createRoutingRule(input: {
  name: string;
  description?: string | null;
  subjectKind: ReviewSubjectKind;
  condition: unknown;
  destinationQueueId: string;
  priority?: number;
  role: AdminRole;
  actorEmailHash: string;
  actorId: string;
  now?: Date;
}): Promise<RuleAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const now = input.now ?? new Date();
  const name = cleanText(input.name, RULE_NAME_MAX);
  if (!name.ok) return name;
  let description: string | null = null;
  if (input.description != null && `${input.description}`.trim() !== "") {
    const text = cleanText(input.description, RULE_DESCRIPTION_MAX);
    if (!text.ok) return { ok: false, error: "invalid_description" };
    description = text.text;
  }
  const priority = input.priority ?? 0;
  if (!validPriority(priority)) return { ok: false, error: "invalid_priority" };
  const fields = await routingFieldsForKind(input.subjectKind);
  if (fields.length === 0) return { ok: false, error: "fields_unavailable" };
  const condition = await validateRoutingConditionAgainst(input.subjectKind, input.condition, fields);
  if (!condition.ok) return condition;
  const destination = await checkDestinationQueue(input.subjectKind, input.destinationQueueId);
  if (!destination.ok) return destination;

  const existing = await listRoutingRules(input.subjectKind);
  const sequence = (existing.length ? Math.max(...existing.map((rule) => rule.sequence)) : 0) + 10;
  const rule: ReviewRoutingRuleRow = {
    id: randomUUID(),
    name: name.text,
    description,
    subjectKind: input.subjectKind,
    sequence,
    condition: condition.condition,
    destinationQueueId: input.destinationQueueId,
    priority,
    status: "DRAFT",
    version: 1,
    createdBy: input.actorEmailHash,
    createdAt: now,
    updatedAt: now,
  };

  if (isDevNoDb()) {
    routingMemory().rules.set(rule.id, rule);
  } else if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("ReviewRoutingRule").values({ ...rule, createdAt: now, updatedAt: now }).execute();
  } else {
    const { db } = await import("@/lib/db");
    await db.reviewRoutingRule.create({
      data: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        subjectKind: rule.subjectKind,
        sequence: rule.sequence,
        condition: rule.condition as never,
        destinationQueueId: rule.destinationQueueId,
        priority: rule.priority,
        status: rule.status,
        version: rule.version,
        createdBy: rule.createdBy,
      },
    });
  }
  await appendVersionRow(rule, input.actorEmailHash, now);
  await auditRuleChange(input.actorId, "create", rule);
  return { ok: true, rule };
}

/**
 * Saves edits to a rule. Every save is a new append-only version; the audit
 * event carries ids only.
 */
export async function saveRoutingRule(input: {
  ruleId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
  destinationQueueId?: string;
  priority?: number;
  role: AdminRole;
  actorEmailHash: string;
  actorId: string;
  now?: Date;
}): Promise<RuleAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const now = input.now ?? new Date();
  const rule = await getRoutingRuleById(input.ruleId);
  if (!rule) return { ok: false, error: "rule_not_found" };

  let name = rule.name;
  if (input.name !== undefined) {
    const cleaned = cleanText(input.name, RULE_NAME_MAX);
    if (!cleaned.ok) return cleaned;
    name = cleaned.text;
  }
  let description = rule.description;
  if (input.description !== undefined) {
    if (input.description == null || `${input.description}`.trim() === "") {
      description = null;
    } else {
      const text = cleanText(input.description, RULE_DESCRIPTION_MAX);
      if (!text.ok) return { ok: false, error: "invalid_description" };
      description = text.text;
    }
  }
  let condition = rule.condition;
  if (input.condition !== undefined) {
    const validated = await validateRoutingConditionAgainst(rule.subjectKind, input.condition, undefined);
    if (!validated.ok) return validated;
    condition = validated.condition;
  }
  let destinationQueueId = rule.destinationQueueId;
  if (input.destinationQueueId !== undefined && input.destinationQueueId !== rule.destinationQueueId) {
    const destination = await checkDestinationQueue(rule.subjectKind, input.destinationQueueId);
    if (!destination.ok) return destination;
    destinationQueueId = input.destinationQueueId;
  }
  let priority = rule.priority;
  if (input.priority !== undefined) {
    if (!validPriority(input.priority)) return { ok: false, error: "invalid_priority" };
    priority = input.priority;
  }

  const saved: ReviewRoutingRuleRow = {
    ...rule,
    name,
    description,
    condition,
    destinationQueueId,
    priority,
    version: rule.version + 1,
    updatedAt: now,
  };
  const data = {
    name: saved.name,
    description: saved.description,
    condition: saved.condition as never,
    destinationQueueId: saved.destinationQueueId,
    priority: saved.priority,
    version: saved.version,
    updatedAt: now,
  };
  if (isDevNoDb()) {
    routingMemory().rules.set(saved.id, saved);
  } else if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("ReviewRoutingRule").set(data).where("id", "=", saved.id).execute();
  } else {
    const { db } = await import("@/lib/db");
    await db.reviewRoutingRule.update({ where: { id: saved.id }, data });
  }
  await appendVersionRow(saved, input.actorEmailHash, now);
  await auditRuleChange(input.actorId, "save", saved);
  return { ok: true, rule: saved };
}

/**
 * Switches a rule's status. Going LIVE re-checks the destination queue, so
 * a rule can never go live pointing at a queue that is protected, archived
 * or of another kind.
 */
export async function setRoutingRuleStatus(input: {
  ruleId: string;
  status: ReviewRuleStatus;
  role: AdminRole;
  actorEmailHash: string;
  actorId: string;
  now?: Date;
}): Promise<RuleAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  if (!REVIEW_RULE_STATUSES.includes(input.status)) return { ok: false, error: "invalid_status" };
  const now = input.now ?? new Date();
  const rule = await getRoutingRuleById(input.ruleId);
  if (!rule) return { ok: false, error: "rule_not_found" };
  if (input.status === "LIVE") {
    const destination = await checkDestinationQueue(rule.subjectKind, rule.destinationQueueId);
    if (!destination.ok) return destination;
  }
  const saved: ReviewRoutingRuleRow = { ...rule, status: input.status, version: rule.version + 1, updatedAt: now };
  const data = { status: saved.status, version: saved.version, updatedAt: now };
  if (isDevNoDb()) {
    routingMemory().rules.set(saved.id, saved);
  } else if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("ReviewRoutingRule").set(data).where("id", "=", saved.id).execute();
  } else {
    const { db } = await import("@/lib/db");
    await db.reviewRoutingRule.update({ where: { id: saved.id }, data });
  }
  await appendVersionRow(saved, input.actorEmailHash, now);
  await auditRuleChange(input.actorId, `status_${saved.status.toLowerCase()}`, saved);
  return { ok: true, rule: saved };
}

/**
 * Moves a rule one step in its kind's sequence. Both swapped rows get a new
 * version, because both changed.
 */
export async function moveRoutingRule(input: {
  ruleId: string;
  direction: "up" | "down";
  role: AdminRole;
  actorEmailHash: string;
  actorId: string;
  now?: Date;
}): Promise<RuleAdminResult> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const now = input.now ?? new Date();
  const rule = await getRoutingRuleById(input.ruleId);
  if (!rule) return { ok: false, error: "rule_not_found" };
  const group = await listRoutingRules(rule.subjectKind);
  const index = group.findIndex((item) => item.id === rule.id);
  const target = input.direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= group.length) return { ok: true, rule };
  const neighbour = group[target]!;

  const moved: ReviewRoutingRuleRow = { ...rule, sequence: neighbour.sequence, version: rule.version + 1, updatedAt: now };
  const shifted: ReviewRoutingRuleRow = { ...neighbour, sequence: rule.sequence, version: neighbour.version + 1, updatedAt: now };
  if (isDevNoDb()) {
    routingMemory().rules.set(moved.id, moved);
    routingMemory().rules.set(shifted.id, shifted);
  } else if (usesWorkerKysely()) {
    await getWorkerDb().transaction().execute(async (trx) => {
      await trx.updateTable("ReviewRoutingRule").set({ sequence: moved.sequence, version: moved.version, updatedAt: now }).where("id", "=", moved.id).execute();
      await trx.updateTable("ReviewRoutingRule").set({ sequence: shifted.sequence, version: shifted.version, updatedAt: now }).where("id", "=", shifted.id).execute();
    });
  } else {
    const { db } = await import("@/lib/db");
    await db.$transaction(async (tx) => {
      await tx.reviewRoutingRule.update({ where: { id: moved.id }, data: { sequence: moved.sequence, version: moved.version, updatedAt: now } });
      await tx.reviewRoutingRule.update({ where: { id: shifted.id }, data: { sequence: shifted.sequence, version: shifted.version, updatedAt: now } });
    });
  }
  await appendVersionRow(moved, input.actorEmailHash, now);
  await appendVersionRow(shifted, input.actorEmailHash, now);
  await auditRuleChange(input.actorId, `move_${input.direction}`, moved);
  await auditRuleChange(input.actorId, "move_shifted", shifted);
  return { ok: true, rule: moved };
}

// ---------------------------------------------------------------------------
// The Test panel (a dry run: nothing is routed, nothing is logged)

export type RuleTestConditionResult = { text: string; matched: boolean };

export type RuleTestResult = {
  ruleId: string;
  name: string;
  status: ReviewRuleStatus;
  sequence: number;
  conditions: RuleTestConditionResult[];
  matched: boolean;
  /** routed | would_have_matched | no_match | invalid_destination | not_reached */
  outcome: string;
  destinationQueueName: string | null;
};

const OP_TEXT: Record<RoutingOp, string> = {
  eq: "is",
  neq: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is greater than",
  gte: "is at least",
  in: "is one of",
  is_empty: "is empty",
};

/** "Platform tier is TIER_1" — the builder and the Test panel share one wording. */
export function routingLeafText(leaf: RoutingLeaf, fields: readonly RoutingFieldDef[]): string {
  const def = fieldDef(fields, leaf.field);
  const label = def?.label ?? leaf.field;
  if (leaf.op === "is_empty") return `${label} is empty`;
  const valueText = Array.isArray(leaf.value) ? leaf.value.join(", ") : `${leaf.value ?? ""}`;
  return `${label} ${OP_TEXT[leaf.op]} ${valueText}`;
}

function validateHandEnteredFacts(
  facts: unknown,
  fields: readonly RoutingFieldDef[],
): { ok: true; facts: RoutingFacts } | { ok: false; error: string } {
  const input = facts as Record<string, unknown> | null;
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_facts" };
  const clean: RoutingFacts = {};
  for (const [key, value] of Object.entries(input)) {
    const def = fieldDef(fields, key);
    if (!def) return { ok: false, error: "unknown_field" };
    if (value === null || value === "") {
      clean[key] = def.type === "set" ? [] : null;
      continue;
    }
    if (def.type === "set") {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return { ok: false, error: "invalid_value" };
      clean[key] = value as string[];
      continue;
    }
    if (def.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, error: "invalid_value" };
      clean[key] = value;
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: "invalid_value" };
    if (def.type === "enum" && !(def.values ?? []).includes(value)) return { ok: false, error: "invalid_value" };
    clean[key] = value;
  }
  return { ok: true, facts: clean };
}

/**
 * The Test panel: every rule of the kind against an open job's subject or
 * hand-entered values, per condition, with the queue that would be chosen.
 * A dry run — no job moves, nothing is written, nothing is logged.
 */
export async function testRoutingRules(input: {
  kind: ReviewSubjectKind;
  jobId?: string;
  facts?: unknown;
  role: AdminRole;
  now?: Date;
}): Promise<
  | { ok: true; results: RuleTestResult[]; chosenQueue: { id: string; name: string; key: string; viaRuleId: string | null } }
  | { ok: false; error: string }
> {
  if (!hasAdminPermission(input.role, "review:manage")) return { ok: false, error: "permission_denied" };
  const now = input.now ?? new Date();
  const fields = await routingFieldsForKind(input.kind);
  if (fields.length === 0) return { ok: false, error: "fields_unavailable" };

  let facts: RoutingFacts;
  if (input.jobId) {
    const { getReviewJob } = await import("@/lib/review-jobs");
    const job = await getReviewJob(input.jobId);
    if (!job) return { ok: false, error: "job_not_found" };
    if (job.subjectKind !== input.kind) return { ok: false, error: "job_kind_mismatch" };
    if (job.status !== "PENDING") return { ok: false, error: "job_closed" };
    const adapter = await getReviewAdapter(input.kind);
    if (!adapter?.routingFacts) return { ok: false, error: "fields_unavailable" };
    const loaded = await adapter.routingFacts(job.subjectId, now);
    if (!loaded) return { ok: false, error: "subject_unavailable" };
    facts = loaded;
  } else {
    const validated = validateHandEnteredFacts(input.facts, fields);
    if (!validated.ok) return validated;
    facts = validated.facts;
  }

  const rules = (await listRoutingRules(input.kind)).filter((rule) => rule.status !== "DISABLED");
  const queues = await allReviewQueues();
  const results: RuleTestResult[] = [];
  let chosen: { queue: ReviewQueueRow; ruleId: string } | null = null;

  for (const rule of rules) {
    const condition = parseStoredCondition(rule.condition);
    const conditions: RuleTestConditionResult[] = condition
      ? ("all" in condition ? condition.all : condition.any).map((leaf) => ({
          text: routingLeafText(leaf, fields),
          matched: evaluateLeaf(leaf, facts, fields),
        }))
      : [{ text: "Unreadable stored condition", matched: false }];
    const matched = conditions.length > 0 && conditions.every((entry) => entry.matched);
    let outcome: RuleTestResult["outcome"] = matched ? "no_match" : "no_match";
    let destinationQueueName: string | null = null;
    if (matched) {
      const queue = queues.find((item) => item.id === rule.destinationQueueId) ?? null;
      if (!queue || !routeableQueue(queue, input.kind)) {
        outcome = "invalid_destination";
      } else if (rule.status === "DRAFT") {
        outcome = "would_have_matched";
        destinationQueueName = queue.name;
      } else if (chosen) {
        outcome = "not_reached";
        destinationQueueName = queue.name;
      } else {
        outcome = "routed";
        destinationQueueName = queue.name;
        chosen = { queue, ruleId: rule.id };
      }
    }
    results.push({
      ruleId: rule.id,
      name: rule.name,
      status: rule.status,
      sequence: rule.sequence,
      conditions,
      matched,
      outcome,
      destinationQueueName,
    });
  }

  if (chosen) {
    return {
      ok: true,
      results,
      chosenQueue: { id: chosen.queue.id, name: chosen.queue.name, key: chosen.queue.key, viaRuleId: chosen.ruleId },
    };
  }
  const { defaultQueueForKind } = await import("@/lib/review-jobs");
  const fallback = await defaultQueueForKind(input.kind);
  if (!fallback) return { ok: false, error: "review_queue_missing" };
  return { ok: true, results, chosenQueue: { id: fallback.id, name: fallback.name, key: fallback.key, viaRuleId: null } };
}

// ---------------------------------------------------------------------------
// Pruning

export const ROUTING_LOG_RETENTION_DAYS = 90;

/**
 * Deletes routing-log rows older than the retention window. The sync
 * evaluates every open job on every run, so the log is bounded by its
 * retention, not by anything else; the evaluation rows carry ids and
 * booleans only, so nothing of record is lost.
 */
export async function pruneRoutingLogs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ROUTING_LOG_RETENTION_DAYS * 24 * 60 * 60_000);
  if (isDevNoDb()) {
    const memory = routingMemory();
    let pruned = 0;
    for (const [key, row] of memory.logs) {
      if (row.createdAt.getTime() < cutoff.getTime()) {
        memory.logs.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().deleteFrom("ReviewRoutingLog").where("createdAt", "<", cutoff).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
  const { db } = await import("@/lib/db");
  const result = await db.reviewRoutingLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
