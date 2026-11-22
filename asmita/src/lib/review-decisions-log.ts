import { REVIEW_SUBJECT_KINDS, type ReviewSubjectKind } from "@/lib/review-adapters";
import { listReviewQueues } from "@/lib/review-jobs";
import { reasonLabelIndex } from "@/lib/review-reasons";
import { REVIEW_DECISION_LABELS, reviewerHandle } from "@/lib/review-views";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { csvCell } from "@/lib/csv-cell";
import type { AdminRole } from "@/lib/auth/admin-permissions";

/*
 * The decisions log (review-console-spec.md, WP145): ReviewDecision rows,
 * newest first, keyset paginated, with filters for queue, kind, decision,
 * reviewer, reason, date range and case reference, plus the CSV export of
 * the filtered set. Everything here is a read model over what WP140
 * already stores: ids, counts, handles and labels only. The reason note is
 * never selected and never rendered — it stays encrypted and internal — and
 * a reviewer appears as "You", "System" or "Reviewer xxxx", never an email.
 *
 * Backends follow the module pattern: memory without DATABASE_URL (dev and
 * tests), Kysely on the Worker (Hyperdrive), Prisma otherwise.
 */

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** The page and the CSV never read more than this many decisions. */
export const DECISION_LOG_PAGE_SIZE = 50;
export const DECISION_CSV_MAX_ROWS = 10_000;

/** The decision codes the log's filter offers (the console's own words). */
export const DECISION_FILTER_CODES: readonly string[] = [
  "approve",
  "reject",
  "dismiss",
  "label_possible_minor",
  "contacted",
  "move",
  "close_stale",
  "send_email",
  "send_web_form",
];

export type DecisionLogFilters = {
  /** A queue key, as the URL and the CSV audit carry it. */
  queueKey?: string;
  subjectKind?: ReviewSubjectKind;
  decision?: string;
  /** "" is the system decider (the sync); the select sends "system". */
  reviewerEmailHash?: string;
  reasonCode?: string;
  /** Inclusive, IST days. */
  fromIstDay?: string;
  toIstDay?: string;
  /** A case reference, resolved to the id here — never URL text. */
  caseReference?: string;
};

const IST_OFFSET = "+05:30";
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function istDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${IST_OFFSET}`);
}

function istDayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999${IST_OFFSET}`);
}

const HASH_PATTERN = /^[a-f0-9]{16,128}$/;

/**
 * Parses the URL's filter parameters into the log's filters, refusing
 * anything malformed (the page then shows nothing rather than a wrong set).
 * Values are ids, codes and dates only; no free text ever reaches a query.
 */
export function parseDecisionLogFilters(params: Record<string, string | undefined>): DecisionLogFilters {
  const filters: DecisionLogFilters = {};
  const queue = params.queue?.trim();
  if (queue) filters.queueKey = queue.slice(0, 64);
  const kind = params.kind?.trim() as ReviewSubjectKind;
  if (REVIEW_SUBJECT_KINDS.includes(kind)) filters.subjectKind = kind;
  const decision = params.decision?.trim();
  if (decision) filters.decision = decision.slice(0, 64);
  const reviewer = params.reviewer?.trim();
  if (reviewer === "system") filters.reviewerEmailHash = "";
  else if (reviewer && HASH_PATTERN.test(reviewer)) filters.reviewerEmailHash = reviewer;
  const reason = params.reason?.trim();
  if (reason && /^[a-z0-9_]{1,64}$/.test(reason)) filters.reasonCode = reason;
  if (params.from && DAY_PATTERN.test(params.from)) filters.fromIstDay = params.from;
  if (params.to && DAY_PATTERN.test(params.to)) filters.toIstDay = params.to;
  const reference = params.case?.trim().toUpperCase();
  if (reference && /^ASMITA-[A-Z0-9-]{4,32}$/.test(reference)) filters.caseReference = reference;
  return filters;
}

/** The keyset cursor: decidedAt millis and the decision id, "millis:id". */
export function encodeDecisionCursor(decidedAt: Date, decisionId: string): string {
  return `${decidedAt.getTime()}:${decisionId}`;
}

export function decodeDecisionCursor(raw: string | undefined): { time: Date; id: string } | null {
  if (!raw) return null;
  const match = /^(\d+):([A-Za-z0-9-]{1,64})$/.exec(raw);
  if (!match) return null;
  return { time: new Date(Number(match[1])), id: match[2]! };
}

// ---------------------------------------------------------------------------
// The row every backend reads: the safe columns only — never the note.

type DecisionRow = {
  id: string;
  jobId: string;
  queueId: string;
  subjectKind: ReviewSubjectKind;
  subjectId: string;
  caseId: string | null;
  reviewerEmailHash: string;
  decision: string;
  reasonCode: string | null;
  claimedAt: Date | null;
  decidedAt: Date;
};

export type DecisionLogRow = {
  decisionId: string;
  jobId: string;
  queueKey: string;
  queueName: string;
  subjectKind: ReviewSubjectKind;
  decision: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  /** "You", "System" or "Reviewer xxxx" — never an email. */
  reviewer: string;
  caseId: string | null;
  caseReference: string | null;
  decidedAt: string;
  /** Claim-to-decision seconds, when the deciding claim is known. */
  handleSeconds: number | null;
  /** "Routed here by rule X (version N)" or "Default queue"; null for the protected queue. */
  routing: string | null;
};

/**
 * Who is reading the log. Decisions on protected queues (minor-hold, and
 * any-kind queues) are shown only to a SUPER_ADMIN, the same rule as the
 * queue itself; without a role they are hidden.
 */
export type DecisionLogViewer = { emailHash: string; role?: AdminRole };

function isProtectedQueue(queue: { protected: boolean; subjectKind: ReviewSubjectKind | null }): boolean {
  return queue.protected || queue.subjectKind === null;
}

type ResolvedFilters = {
  queueId?: string;
  /** Protected queues the viewer may not see. */
  hiddenQueueIds?: string[];
  caseId?: string;
  from?: Date;
  to?: Date;
} & Omit<DecisionLogFilters, "queueKey" | "caseReference" | "fromIstDay" | "toIstDay">;

async function resolveFilters(filters: DecisionLogFilters, viewer: DecisionLogViewer): Promise<ResolvedFilters> {
  const resolved: ResolvedFilters = { ...filters };
  if (viewer.role !== "SUPER_ADMIN") {
    const hidden = (await listReviewQueues()).filter(isProtectedQueue).map((queue) => queue.id);
    if (hidden.length > 0) resolved.hiddenQueueIds = hidden;
  }
  delete (resolved as Record<string, unknown>).queueKey;
  delete (resolved as Record<string, unknown>).caseReference;
  delete (resolved as Record<string, unknown>).fromIstDay;
  delete (resolved as Record<string, unknown>).toIstDay;
  if (filters.queueKey) {
    const queues = await listReviewQueues();
    const queue = queues.find((entry) => entry.key === filters.queueKey);
    // An unknown key matches nothing, rather than widening the filter.
    resolved.queueId = queue?.id ?? "unknown-queue";
  }
  if (filters.fromIstDay) resolved.from = istDayStart(filters.fromIstDay);
  if (filters.toIstDay) resolved.to = istDayEnd(filters.toIstDay);
  if (filters.caseReference) resolved.caseId = await caseIdForReference(filters.caseReference) ?? "unknown-case";
  return resolved;
}

async function caseIdForReference(reference: string): Promise<string | null> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    for (const record of cases.values()) {
      if (record.referenceNumber === reference) return record.id;
    }
    return null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("Case").select("id")
      .where("referenceNumber", "=", reference).executeTakeFirst();
    return row?.id ?? null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.case.findUnique({ where: { referenceNumber: reference }, select: { id: true } });
  return row?.id ?? null;
}

function matchesFilters(row: DecisionRow, filters: ResolvedFilters): boolean {
  if (filters.queueId !== undefined && row.queueId !== filters.queueId) return false;
  if (filters.hiddenQueueIds?.includes(row.queueId)) return false;
  if (filters.subjectKind !== undefined && row.subjectKind !== filters.subjectKind) return false;
  if (filters.decision !== undefined && row.decision !== filters.decision) return false;
  if (filters.reviewerEmailHash !== undefined && row.reviewerEmailHash !== filters.reviewerEmailHash) return false;
  if (filters.reasonCode !== undefined && row.reasonCode !== filters.reasonCode) return false;
  if (filters.caseId !== undefined && row.caseId !== filters.caseId) return false;
  const decidedAt = new Date(row.decidedAt).getTime();
  if (filters.from !== undefined && decidedAt < filters.from.getTime()) return false;
  if (filters.to !== undefined && decidedAt > filters.to.getTime()) return false;
  return true;
}

function beforeCursor(row: DecisionRow, cursor: { time: Date; id: string } | null): boolean {
  if (!cursor) return true;
  const decidedAt = new Date(row.decidedAt).getTime();
  if (decidedAt !== cursor.time.getTime()) return decidedAt < cursor.time.getTime();
  return row.id < cursor.id;
}

const DECISION_COLUMNS = [
  "id", "jobId", "queueId", "subjectKind", "subjectId", "caseId",
  "reviewerEmailHash", "decision", "reasonCode", "claimedAt", "decidedAt",
] as const;

/**
 * The filtered decisions, newest first, keyset paginated on
 * (decidedAt, id). Returns the page's rows and the next cursor, or null
 * when this is the last page.
 */
export async function listDecisionLogPage(
  viewer: DecisionLogViewer,
  filters: DecisionLogFilters,
  options: { before?: string; limit?: number } = {},
): Promise<{ rows: DecisionLogRow[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? DECISION_LOG_PAGE_SIZE, 1), DECISION_CSV_MAX_ROWS);
  const cursor = decodeDecisionCursor(options.before);
  const resolved = await resolveFilters(filters, viewer);
  const fetched = limit + 1;

  let page: DecisionRow[];
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    page = [...reviewMemory().decisions.values()]
      .filter((row) => matchesFilters(row as unknown as DecisionRow, resolved))
      .filter((row) => beforeCursor(row as unknown as DecisionRow, cursor))
      .sort(
        (left, right) =>
          new Date(right.decidedAt).getTime() - new Date(left.decidedAt).getTime() ||
          (left.id < right.id ? 1 : -1),
      )
      .slice(0, fetched)
      .map((row) => ({ ...(row as unknown as DecisionRow) }));
  } else if (usesWorkerKysely()) {
    let query = getWorkerDb().selectFrom("ReviewDecision").select(DECISION_COLUMNS);
    if (resolved.queueId !== undefined) query = query.where("queueId", "=", resolved.queueId);
    if (resolved.hiddenQueueIds !== undefined) query = query.where("queueId", "not in", resolved.hiddenQueueIds);
    if (resolved.subjectKind !== undefined) query = query.where("subjectKind", "=", resolved.subjectKind);
    if (resolved.decision !== undefined) query = query.where("decision", "=", resolved.decision);
    if (resolved.reviewerEmailHash !== undefined) query = query.where("reviewerEmailHash", "=", resolved.reviewerEmailHash);
    if (resolved.reasonCode !== undefined) query = query.where("reasonCode", "=", resolved.reasonCode);
    if (resolved.caseId !== undefined) query = query.where("caseId", "=", resolved.caseId);
    if (resolved.from !== undefined) query = query.where("decidedAt", ">=", resolved.from);
    if (resolved.to !== undefined) query = query.where("decidedAt", "<=", resolved.to);
    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb("decidedAt", "<", cursor.time),
          eb.and([eb("decidedAt", "=", cursor.time), eb("id", "<", cursor.id)]),
        ]),
      );
    }
    page = (await query.orderBy("decidedAt", "desc").orderBy("id", "desc").limit(fetched).execute()) as unknown as DecisionRow[];
  } else {
    const { db } = await import("@/lib/db");
    page = (await db.reviewDecision.findMany({
      where: {
        ...(resolved.queueId !== undefined
          ? { queueId: resolved.queueId }
          : resolved.hiddenQueueIds !== undefined
            ? { queueId: { notIn: resolved.hiddenQueueIds } }
            : {}),
        ...(resolved.subjectKind !== undefined ? { subjectKind: resolved.subjectKind } : {}),
        ...(resolved.decision !== undefined ? { decision: resolved.decision } : {}),
        ...(resolved.reviewerEmailHash !== undefined ? { reviewerEmailHash: resolved.reviewerEmailHash } : {}),
        ...(resolved.reasonCode !== undefined ? { reasonCode: resolved.reasonCode } : {}),
        ...(resolved.caseId !== undefined ? { caseId: resolved.caseId } : {}),
        ...(resolved.from !== undefined || resolved.to !== undefined
          ? {
              decidedAt: {
                ...(resolved.from !== undefined ? { gte: resolved.from } : {}),
                ...(resolved.to !== undefined ? { lte: resolved.to } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { decidedAt: { lt: cursor.time } },
                { AND: [{ decidedAt: cursor.time }, { id: { lt: cursor.id } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: fetched,
      select: {
        id: true, jobId: true, queueId: true, subjectKind: true, subjectId: true, caseId: true,
        reviewerEmailHash: true, decision: true, reasonCode: true, claimedAt: true, decidedAt: true,
      },
    })) as unknown as DecisionRow[];
  }

  const hasMore = page.length > limit;
  const rows = page.slice(0, limit);
  const last = rows.at(-1);
  return {
    rows: await enrichDecisionRows(rows, viewer),
    nextBefore: hasMore && last ? encodeDecisionCursor(new Date(last.decidedAt), last.id) : null,
  };
}

/**
 * Decorates the safe decision columns with everything the log shows:
 * queue names, case references, reason labels, reviewer handles and the
 * routing explanation. One batched lookup per kind of enrichment, so a page
 * costs a bounded number of queries whatever the filters match.
 */
async function enrichDecisionRows(rows: DecisionRow[], viewer: { emailHash: string }): Promise<DecisionLogRow[]> {
  if (rows.length === 0) return [];
  const queues = await listReviewQueues();
  const queuesById = new Map(queues.map((queue) => [queue.id, queue]));
  const labels = await reasonLabelIndex();

  // Case references and the jobs' routing provenance, batched.
  const caseIds = [...new Set(rows.flatMap((row) => (row.caseId ? [row.caseId] : [])))];
  const references = new Map<string, string>();
  for (const caseId of caseIds) {
    const { caseReferenceFor } = await import("@/lib/review-views");
    const reference = await caseReferenceFor(caseId);
    if (reference) references.set(caseId, reference);
  }

  const jobIds = rows.map((row) => row.jobId);
  const jobsById = new Map<string, { routedByRuleId: string | null; routedByRuleVersion: number | null }>();
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    for (const jobId of jobIds) {
      const job = reviewMemory().jobs.get(jobId);
      if (job) jobsById.set(jobId, { routedByRuleId: job.routedByRuleId, routedByRuleVersion: job.routedByRuleVersion });
    }
  } else if (usesWorkerKysely()) {
    const jobRows = await getWorkerDb().selectFrom("ReviewJob")
      .select(["id", "routedByRuleId", "routedByRuleVersion"])
      .where("id", "in", jobIds).execute();
    for (const job of jobRows) jobsById.set(job.id, { routedByRuleId: job.routedByRuleId, routedByRuleVersion: job.routedByRuleVersion });
  } else {
    const { db } = await import("@/lib/db");
    const jobRows = await db.reviewJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, routedByRuleId: true, routedByRuleVersion: true },
    });
    for (const job of jobRows) jobsById.set(job.id, { routedByRuleId: job.routedByRuleId, routedByRuleVersion: job.routedByRuleVersion });
  }

  // Rule names once per page, never per row.
  const ruleIds = new Set([...jobsById.values()].flatMap((job) => (job.routedByRuleId ? [job.routedByRuleId] : [])));
  const ruleNames = new Map<string, string>();
  if (ruleIds.size > 0) {
    const { listRoutingRules } = await import("@/lib/review-routing");
    for (const rule of await listRoutingRules()) {
      if (ruleIds.has(rule.id)) ruleNames.set(rule.id, rule.name);
    }
  }

  return rows.map((row) => {
    const queue = queuesById.get(row.queueId);
    const decidedAt = new Date(row.decidedAt);
    const job = jobsById.get(row.jobId) ?? { routedByRuleId: null, routedByRuleVersion: null };
    return {
      decisionId: row.id,
      jobId: row.jobId,
      queueKey: queue?.key ?? "",
      queueName: queue?.name ?? row.queueId,
      subjectKind: row.subjectKind,
      decision: row.decision,
      reasonCode: row.reasonCode,
      reasonLabel: row.reasonCode
        ? labels.get(`${queue?.key ?? ""}\u0000${row.decision}\u0000${row.reasonCode}`) ?? row.reasonCode
        : null,
      reviewer: reviewerHandle(row.reviewerEmailHash, viewer.emailHash),
      caseId: row.caseId,
      caseReference: row.caseId ? references.get(row.caseId) ?? null : null,
      decidedAt: decidedAt.toISOString(),
      handleSeconds:
        row.claimedAt !== null && decidedAt.getTime() >= new Date(row.claimedAt).getTime()
          ? Math.round((decidedAt.getTime() - new Date(row.claimedAt).getTime()) / 1000)
          : null,
      // The protected queue explains itself already (WP143's job screen rule),
      // so its decisions carry no routing line either.
      routing: queue?.protected || queue?.subjectKind === null
        ? null
        : job.routedByRuleId
          ? ruleNames.has(job.routedByRuleId)
            ? `Routed here by rule ${ruleNames.get(job.routedByRuleId)} (version ${job.routedByRuleVersion ?? "?"})`
            : `Routed here by a rule that no longer exists (version ${job.routedByRuleVersion ?? "?"})`
          : "Default queue",
    };
  });
}

// ---------------------------------------------------------------------------
// CSV export

/** "2026-11-22 15:30:05 IST" — a stable, unambiguous timestamp for the CSV. */
export function istTimestamp(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} IST`;
}

/**
 * RFC 4180: every field quoted, inner quotes doubled. Queue names and reason
 * labels are admin-editable, so the shared csvCell guard neutralises a value
 * that starts with a formula trigger before it reaches a spreadsheet.
 */
function csvField(value: string): string {
  const cell = csvCell(value);
  return cell.startsWith('"') ? cell : `"${cell}"`;
}

export const DECISION_CSV_COLUMNS: readonly string[] = [
  "Decided at (IST)",
  "Queue",
  "Kind",
  "Decision",
  "Reason",
  "Reviewer",
  "Case reference",
  "Claim-to-decision seconds",
] as const;

const KIND_LABELS: Record<ReviewSubjectKind, string> = {
  FLAGGED_LINK: "Flagged link",
  FINGERPRINT: "Fingerprint",
  FINDING: "Crawler finding",
  PARTNER_APPLICATION: "Partner application",
  LAB_REPORT: "Lab report",
};

/**
 * The filtered set as CSV: decided at (IST), queue, kind, decision, reason
 * label, reviewer handle, case reference, claim-to-decision seconds. No
 * URLs, no notes, no PII — the columns are fixed and the note is never read.
 * Capped at DECISION_CSV_MAX_ROWS newest rows; the caller reports a cap.
 */
export async function exportDecisionLogCsv(
  viewer: DecisionLogViewer,
  filters: DecisionLogFilters,
): Promise<{ csv: string; count: number; capped: boolean }> {
  const { rows } = await listDecisionLogPage(viewer, filters, { limit: DECISION_CSV_MAX_ROWS });
  const lines = [DECISION_CSV_COLUMNS.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(
      [
        istTimestamp(row.decidedAt),
        row.queueName,
        KIND_LABELS[row.subjectKind] ?? row.subjectKind,
        // The CSV carries the same decision word the log's table shows,
        // never the raw code (a row that says "Rejected" on the page says
        // "Rejected" in the export).
        REVIEW_DECISION_LABELS[row.decision] ?? row.decision.replaceAll("_", " "),
        row.reasonLabel ?? "",
        row.reviewer,
        row.caseReference ?? "",
        row.handleSeconds === null ? "" : String(row.handleSeconds),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return { csv: `${lines.join("\r\n")}\r\n`, count: rows.length, capped: rows.length === DECISION_CSV_MAX_ROWS };
}

// ---------------------------------------------------------------------------
// Filter options

export type DecisionLogFilterOptions = {
  queues: Array<{ key: string; name: string; subjectKind: ReviewSubjectKind | null; archived: boolean }>;
  kinds: readonly ReviewSubjectKind[];
  decisions: readonly string[];
  /** Hashes with display labels; "system" stands for the empty hash. */
  reviewers: Array<{ value: string; label: string }>;
  reasons: Array<{ value: string; label: string }>;
};

/** The selects the filter form offers. Ids and labels only. */
export async function decisionLogFilterOptions(viewer: DecisionLogViewer): Promise<DecisionLogFilterOptions> {
  const queues = (await listReviewQueues()).filter(
    (queue) => viewer.role === "SUPER_ADMIN" || !isProtectedQueue(queue),
  );
  const labels = await reasonLabelIndex();
  const reasons = new Map<string, string>();
  for (const [key, label] of labels) {
    const [queueKey, , code] = key.split("\u0000");
    const value = code ?? "";
    // The same code can exist for several queues; the label shown names its
    // queue so the options stay distinguishable.
    const text = `${label} (${queueKey})`;
    if (!reasons.has(value)) reasons.set(value, text);
  }

  let hashes: string[] = [];
  if (isDevNoDb()) {
    const { reviewMemory } = await import("@/lib/review-jobs");
    hashes = [...new Set([...reviewMemory().decisions.values()].map((row) => row.reviewerEmailHash))];
  } else if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("ReviewDecision").select("reviewerEmailHash").execute();
    hashes = [...new Set(rows.map((row) => row.reviewerEmailHash))];
  } else {
    const { db } = await import("@/lib/db");
    const rows = await db.reviewDecision.findMany({
      distinct: ["reviewerEmailHash"],
      select: { reviewerEmailHash: true },
      take: 500,
    });
    hashes = [...new Set(rows.map((row) => row.reviewerEmailHash))];
  }
  const reviewers = hashes.slice(0, 500).map((hash) => ({
    value: hash === "" ? "system" : hash,
    label: hash === "" ? "System" : hash === viewer.emailHash ? "You" : `Reviewer ${hash.slice(0, 4)}`,
  }));
  reviewers.sort((left, right) => left.label.localeCompare(right.label));

  return {
    queues: queues.map((queue) => ({
      key: queue.key,
      name: queue.name,
      subjectKind: queue.subjectKind,
      archived: queue.archivedAt !== null,
    })),
    kinds: REVIEW_SUBJECT_KINDS,
    decisions: DECISION_FILTER_CODES,
    reviewers,
    reasons: [...reasons.entries()].map(([value, label]) => ({ value, label })),
  };
}
