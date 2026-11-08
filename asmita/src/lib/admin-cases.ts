// The admin case list and case page (docs/product/admin-console-redesign.md,
// Phase 1). Every query names its columns: the encrypted link, the signed
// PDF and the fingerprint never leave the database here. Whether a link is
// signed is read with a separate `IS NOT NULL` query instead of the PDF.
//
// "Next action" and "Due" are derived in TypeScript from those light rows,
// then sorted and paged with a keyset cursor. At Asmita's volume this is one
// small read per table; if it grows slow, store the two values on Case.

import { db } from "@/lib/db";
import { listAllCases } from "@/lib/case-ops";
import { devFlagEnabled } from "@/lib/dev-flags";
import { buildLadder } from "@/lib/escalation-ladder";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED, platformDirectory } from "@/lib/platforms";
import { isUrlExpired } from "@/lib/url-retention";

export const REVIEW_SLA_HOURS = 4;
// Assumed until agreed (open question 1 in the redesign doc).
export const SEND_NOTICE_SLA_HOURS = 4;

export const CASE_STATUSES = ["OPEN", "PARTIALLY_RESOLVED", "ESCALATED", "RESOLVED", "CLOSED"] as const;

export const NEXT_ACTIONS = [
  "review_links",
  "review_fingerprints",
  "send_notice",
  "blocked_legal_review",
  "blocked_contact",
  "blocked_escalation",
  "awaiting_reply",
  "waiting_on_survivor",
  "none",
] as const;
export type NextActionKind = (typeof NEXT_ACTIONS)[number];

export const SORTS = ["due", "newest", "oldest", "updated"] as const;
export type CaseSort = (typeof SORTS)[number];

const HOUR = 3_600_000;
const EMAIL_NOTICE_TYPES: Record<string, string> = {
  IT_RULES_2021: "IT_RULES_2021",
  DMCA: "DMCA",
  IT_RULES_AND_DMCA: "IT_RULES_AND_DMCA",
};

export type LinkFact = {
  id: string;
  status: string;
  flaggedForReview: boolean;
  submittedAt: Date;
  platformId: string | null;
  platformFiledAt: Date | null;
  signed: boolean;
};

export type NoticeFact = {
  urlId: string;
  sentAt: Date;
  responseType: string | null;
  responseReceivedAt: Date | null;
  removedAt: Date | null;
  /** Why the hourly sweep could not send this notice's next ladder step. */
  ladderBlock?: string | null;
};

export type CaseFacts = {
  id: string;
  referenceNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  declarationSignedAt: Date | null;
  links: LinkFact[];
  /** Original notices only (not follow-ups) that were sent. */
  notices: NoticeFact[];
  pendingFingerprints: number;
  oldestPendingFingerprint: Date | null;
};

export type PlatformFact = {
  id: string;
  name: string;
  noticeBasis: string;
  /** Asmita can email it: active, a grievance email, verified by a human. */
  emailReady: boolean;
  grievanceEmail: string | null;
  lastContactVerifiedAt: Date | null;
};

export type Gates = {
  platforms: Map<string, PlatformFact>;
  /** Whether dispatch would find an active, legally reviewed template. */
  hasReviewedTemplate: (templateType: string, platformId: string) => boolean;
};

export type CaseWork = {
  nextAction: NextActionKind;
  /** How many links (or fingerprints) the next action covers. */
  actionCount: number;
  dueAt: Date | null;
  /** Furthest escalation ladder step reached by any link, 1 to 4. */
  ladderStep: number | null;
  allRemoved: boolean;
  platforms: string[];
};

const ACTION_RANK = new Map(NEXT_ACTIONS.map((kind, index) => [kind, index]));

/** What the operator should do next on a case, and by when. Pure. */
export function deriveCaseWork(facts: CaseFacts, gates: Gates, now: Date): CaseWork {
  const platformOf = (link: LinkFact) => (link.platformId ? gates.platforms.get(link.platformId) : undefined);
  const platforms = Array.from(
    new Set(facts.links.map((link) => platformOf(link)?.name ?? "Unknown platform")),
  );
  // Per kind: how many items, and the earliest deadline among them.
  const buckets = new Map<NextActionKind, { count: number; due: number | null }>();
  const add = (kind: NextActionKind, at: Date | null, count = 1) => {
    const bucket = buckets.get(kind) ?? { count: 0, due: null };
    bucket.count += count;
    if (at) bucket.due = bucket.due === null ? at.getTime() : Math.min(bucket.due, at.getTime());
    buckets.set(kind, bucket);
  };

  const noticeByUrl = new Map(facts.notices.map((notice) => [notice.urlId, notice]));
  let ladderStep: number | null = null;
  let started = 0;
  let removed = 0;

  for (const link of facts.links) {
    if (link.status === "REJECTED") continue;
    if (link.status === "PENDING_REVIEW" || (link.flaggedForReview && link.status !== "REMOVED")) {
      add("review_links", new Date(link.submittedAt.getTime() + REVIEW_SLA_HOURS * HOUR));
      continue;
    }

    const notice = noticeByUrl.get(link.id);
    const startedAt = notice?.sentAt ?? link.platformFiledAt;
    if (startedAt) {
      started += 1;
      if (link.status === "REMOVED" || notice?.removedAt) {
        removed += 1;
        continue;
      }
      const ladder = buildLadder({
        startedAt,
        status: link.status,
        responseType: notice?.responseType,
        responseAt: notice?.responseReceivedAt,
        now,
      });
      const current = ladder ? ladder.steps.findIndex((step) => step.state === "current") + 1 : 0;
      if (current > 0) ladderStep = Math.max(ladderStep ?? 0, current);
      if (notice?.ladderBlock) add("blocked_escalation", null);
      if (!notice?.responseReceivedAt) {
        add("awaiting_reply", ladder?.steps.find((step) => step.key === "deadline")?.at ?? null);
      }
      continue;
    }

    if (link.status !== "NOTICE_QUEUED") continue;
    const platform = platformOf(link);
    const templateType = platform ? EMAIL_NOTICE_TYPES[platform.noticeBasis] : undefined;
    if (platform && !templateType) {
      // The platform takes reports only through its own form: the survivor files it.
      add("waiting_on_survivor", null);
    } else if (!link.signed) {
      add("waiting_on_survivor", null);
    } else if (!platform || !platform.emailReady) {
      add("blocked_contact", null);
    } else if (!gates.hasReviewedTemplate(templateType!, platform.id)) {
      add("blocked_legal_review", null);
    } else {
      // No per-link signing time is stored; the case's first signature is the
      // earliest a notice could have been ready.
      const readySince = facts.declarationSignedAt ?? facts.createdAt;
      add("send_notice", new Date(readySince.getTime() + SEND_NOTICE_SLA_HOURS * HOUR));
    }
  }

  if (facts.pendingFingerprints > 0) {
    const oldest = facts.oldestPendingFingerprint ?? facts.createdAt;
    add("review_fingerprints", new Date(oldest.getTime() + REVIEW_SLA_HOURS * HOUR), facts.pendingFingerprints);
  }

  const nextAction = NEXT_ACTIONS.find((kind) => buckets.has(kind)) ?? "none";
  const bucket = buckets.get(nextAction);
  return {
    nextAction,
    actionCount: bucket?.count ?? 0,
    dueAt: bucket?.due != null ? new Date(bucket.due) : null,
    ladderStep,
    allRemoved: started > 0 && removed === started,
    platforms,
  };
}

export type AdminCaseListFilters = {
  statuses?: string[];
  platformId?: string;
  nextAction?: string;
  from?: string;
  to?: string;
  /** A case reference, whole or its last part (e.g. "SQWGCD"). */
  q?: string;
};

export type AdminCaseListRow = CaseWork & {
  caseId: string;
  referenceNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  linkCount: number;
};

export type AdminCaseListPage = {
  rows: AdminCaseListRow[];
  total: number;
  /** 1-based position of the first row in the filtered, sorted list. */
  start: number;
  nextCursor: string | null;
};

type SortTuple = Array<number | string>;

function sortTuple(row: AdminCaseListRow, sort: CaseSort): SortTuple {
  const created = Date.parse(row.createdAt);
  if (sort === "newest") return [-created, row.caseId];
  if (sort === "oldest") return [created, row.caseId];
  if (sort === "updated") return [-Date.parse(row.updatedAt), row.caseId];
  return [
    row.dueAt ? row.dueAt.getTime() : Number.MAX_SAFE_INTEGER,
    ACTION_RANK.get(row.nextAction) ?? 99,
    created,
    row.caseId,
  ];
}

function compareTuples(left: SortTuple, right: SortTuple) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  }
  return 0;
}

export function encodeCursor(tuple: SortTuple) {
  return Buffer.from(JSON.stringify(tuple)).toString("base64url");
}

function decodeCursor(cursor: string | undefined): SortTuple | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(value) && value.every((item) => typeof item === "number" || typeof item === "string")
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * One page of cases. Filtering and sorting cover every matching case; the
 * cursor is the sort key of the last row shown, so acting on rows (which can
 * move them out of a filter) never makes the next page skip a case.
 */
export async function listAdminCases(
  filters: AdminCaseListFilters = {},
  options: { sort?: CaseSort; cursor?: string; limit?: number; now?: Date } = {},
): Promise<AdminCaseListPage> {
  const now = options.now ?? new Date();
  const sort = options.sort ?? "due";
  const limit = options.limit ?? 50;
  const { facts, gates } = await loadCaseFacts(filters);

  const rows = facts
    .filter((fact) => !filters.platformId || fact.links.some((link) => link.platformId === filters.platformId))
    .map(
      (fact): AdminCaseListRow => ({
        ...deriveCaseWork(fact, gates, now),
        caseId: fact.id,
        referenceNumber: fact.referenceNumber,
        status: fact.status,
        createdAt: fact.createdAt.toISOString(),
        updatedAt: fact.updatedAt.toISOString(),
        linkCount: fact.links.length,
      }),
    )
    .filter(
      (row) =>
        !filters.nextAction ||
        filters.nextAction === "all" ||
        row.nextAction === filters.nextAction ||
        // "blocked" covers every gate that stops a step.
        (filters.nextAction === "blocked" && row.nextAction.startsWith("blocked_")),
    )
    .map((row) => ({ row, key: sortTuple(row, sort) }))
    .sort((left, right) => compareTuples(left.key, right.key));

  const after = decodeCursor(options.cursor);
  const startIndex = after ? rows.findIndex((entry) => compareTuples(entry.key, after) > 0) : 0;
  const from = startIndex === -1 ? rows.length : startIndex;
  const page = rows.slice(from, from + limit);
  const hasMore = from + limit < rows.length;
  return {
    rows: page.map((entry) => entry.row),
    total: rows.length,
    start: from + 1,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1].key) : null,
  };
}

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function normaliseReference(q: string | undefined) {
  const value = q?.trim().toUpperCase();
  return value ? value.replace(/[^A-Z0-9-]/g, "") : undefined;
}

function caseWhere(filters: AdminCaseListFilters) {
  const statuses = (filters.statuses ?? []).filter((status) =>
    (CASE_STATUSES as readonly string[]).includes(status),
  );
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(Date.parse(filters.to) + 24 * HOUR) : null;
  const reference = normaliseReference(filters.q);
  return {
    ...(statuses.length ? { status: { in: statuses as never[] } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
            ...(to && !Number.isNaN(to.getTime()) ? { lt: to } : {}),
          },
        }
      : {}),
    ...(reference ? { referenceNumber: { endsWith: reference } } : {}),
  };
}

async function loadGates(): Promise<Gates> {
  const skipLegal = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  if (devNoDb()) {
    const platforms = new Map(
      platformDirectory.map((entry) => [
        entry.id,
        {
          id: entry.id,
          name: entry.name,
          noticeBasis: entry.noticeBasis,
          emailReady: entry.lastContactVerifiedByHuman && entry.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED,
          grievanceEmail: entry.grievanceEmail === HUMAN_VERIFICATION_REQUIRED ? null : entry.grievanceEmail,
          lastContactVerifiedAt: entry.lastContactVerifiedAt ? new Date(entry.lastContactVerifiedAt) : null,
        },
      ]),
    );
    return { platforms, hasReviewedTemplate: () => skipLegal };
  }
  const [platforms, templates] = await Promise.all([
    db.platform.findMany({
      select: {
        id: true,
        name: true,
        noticeBasis: true,
        grievanceEmail: true,
        lastContactVerifiedByHuman: true,
        lastContactVerifiedAt: true,
        isActive: true,
      },
    }),
    db.noticeTemplate.findMany({
      where: { isActive: true, ...(skipLegal ? {} : { reviewedByLegal: true }) },
      select: { templateType: true, platformId: true },
    }),
  ]);
  return {
    platforms: new Map(
      platforms.map((platform) => [
        platform.id,
        {
          id: platform.id,
          name: platform.name,
          noticeBasis: platform.noticeBasis,
          emailReady: Boolean(
            platform.isActive &&
              platform.grievanceEmail &&
              platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED &&
              platform.lastContactVerifiedByHuman,
          ),
          grievanceEmail: platform.grievanceEmail,
          lastContactVerifiedAt: platform.lastContactVerifiedAt,
        },
      ]),
    ),
    hasReviewedTemplate: (templateType, platformId) =>
      templates.some(
        (template) =>
          template.templateType === templateType &&
          (template.platformId === null || template.platformId === platformId),
      ),
  };
}

async function loadCaseFacts(filters: AdminCaseListFilters): Promise<{ facts: CaseFacts[]; gates: Gates }> {
  const gates = await loadGates();
  if (devNoDb()) return { facts: await loadMemoryCaseFacts(filters), gates };

  const where = caseWhere(filters);
  const [cases, links, signed, notices, fingerprints] = await Promise.all([
    db.case.findMany({
      where,
      select: {
        id: true,
        referenceNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        declarationSignedAt: true,
      },
    }),
    db.submittedUrl.findMany({
      where: { case: where },
      select: {
        id: true,
        caseId: true,
        status: true,
        flaggedForReview: true,
        submittedAt: true,
        platformId: true,
        platformFiledAt: true,
      },
    }),
    db.submittedUrl.findMany({
      where: { case: where, signedNoticePdf: { not: null } },
      select: { id: true },
    }),
    db.notice.findMany({
      where: { followUpOf: null, sentAt: { not: null }, submittedUrl: { case: where } },
      orderBy: { sentAt: "asc" },
      select: {
        id: true,
        urlId: true,
        sentAt: true,
        escalationLevel: true,
        responseType: true,
        responseReceivedAt: true,
        removedAt: true,
      },
    }),
    db.hashSubmission.groupBy({
      by: ["caseId"],
      where: { status: "PENDING_REVIEW", case: where },
      _count: { _all: true },
      _min: { submittedAt: true },
    }),
  ]);

  const signedIds = new Set(signed.map((row) => row.id));
  const blocks = await loadLadderBlocks(notices);
  const linksByCase = new Map<string, LinkFact[]>();
  const caseOfLink = new Map<string, string>();
  for (const link of links) {
    caseOfLink.set(link.id, link.caseId);
    linksByCase.set(link.caseId, [
      ...(linksByCase.get(link.caseId) ?? []),
      {
        id: link.id,
        status: link.status,
        flaggedForReview: link.flaggedForReview,
        submittedAt: link.submittedAt,
        platformId: link.platformId,
        platformFiledAt: link.platformFiledAt,
        signed: signedIds.has(link.id),
      },
    ]);
  }
  const noticesByCase = new Map<string, NoticeFact[]>();
  const seenUrls = new Set<string>();
  for (const notice of notices) {
    // The first original per link starts its ladder.
    if (seenUrls.has(notice.urlId)) continue;
    seenUrls.add(notice.urlId);
    const caseId = caseOfLink.get(notice.urlId);
    if (!caseId) continue;
    noticesByCase.set(caseId, [
      ...(noticesByCase.get(caseId) ?? []),
      {
        urlId: notice.urlId,
        sentAt: notice.sentAt as Date,
        responseType: notice.responseType,
        responseReceivedAt: notice.responseReceivedAt,
        removedAt: notice.removedAt,
        ladderBlock: blocks.get(notice.id) ?? null,
      },
    ]);
  }
  const fingerprintsByCase = new Map(fingerprints.map((group) => [group.caseId, group]));

  return {
    gates,
    facts: cases.map((record) => ({
      ...record,
      links: linksByCase.get(record.id) ?? [],
      notices: noticesByCase.get(record.id) ?? [],
      pendingFingerprints: fingerprintsByCase.get(record.id)?._count._all ?? 0,
      oldestPendingFingerprint: fingerprintsByCase.get(record.id)?._min.submittedAt ?? null,
    })),
  };
}

// Local development without a database: the in-memory store has fewer facts
// (no per-link submission time or notice rows), so approximate from the case.
async function loadMemoryCaseFacts(filters: AdminCaseListFilters): Promise<CaseFacts[]> {
  const statuses = filters.statuses?.length ? new Set(filters.statuses) : null;
  const reference = normaliseReference(filters.q);
  const from = filters.from ? Date.parse(filters.from) : null;
  const to = filters.to ? Date.parse(filters.to) + 24 * HOUR : null;
  return (await listAllCases())
    .filter((record) => !statuses || statuses.has(record.status))
    .filter((record) => !reference || record.referenceNumber.endsWith(reference))
    .filter((record) => !from || Date.parse(record.createdAt) >= from)
    .filter((record) => !to || Date.parse(record.createdAt) < to)
    .map((record) => {
      const createdAt = new Date(record.createdAt);
      return {
        id: record.id,
        referenceNumber: record.referenceNumber,
        status: record.status,
        createdAt,
        updatedAt: createdAt,
        declarationSignedAt: null,
        links: record.urls.map((url) => ({
          id: url.id,
          status: url.status,
          flaggedForReview: Boolean(url.flaggedForReview),
          submittedAt: createdAt,
          platformId: url.platformId,
          platformFiledAt: url.platformFiledAt ? new Date(url.platformFiledAt) : null,
          signed: Boolean(url.hasSignedNotice),
        })),
        notices: record.urls
          .filter((url) => url.noticeSentAt)
          .map((url) => ({
            urlId: url.id,
            sentAt: new Date(url.noticeSentAt!),
            responseType: url.responseType ?? null,
            responseReceivedAt: url.responseAt ? new Date(url.responseAt) : null,
            removedAt: null,
          })),
        pendingFingerprints: 0,
        oldestPendingFingerprint: null,
      };
    });
}

// ---------------------------------------------------------------------------
// Case page

export type AdminCaseLink = {
  id: string;
  domain: string;
  status: string;
  flaggedForReview: boolean;
  flagReason: string | null;
  /** An original notice went out (the link's status may still say approved). */
  noticeSent: boolean;
  submittedAt: string;
  /** False once the link passed the retention period and was deleted. */
  retained: boolean;
  platformId: string | null;
  platformName: string;
  noticeBasis: string | null;
  emailReady: boolean;
  contactVerifiedAt: string | null;
  signed: boolean;
  signedFingerprintIds: string[];
  platformFiledAt: string | null;
  notices: Array<{
    id: string;
    sentAt: string | null;
    escalationLevel: number;
    followUp: boolean;
    responseType: string | null;
  }>;
  /** What Send notice would use; null when the link cannot be sent. */
  dispatch: null | {
    recipient: string;
    templateType: string;
    templateVersion: number;
    reviewedAt: string | null;
    reviewedByName: string | null;
  };
  ladderStep: number | null;
  /** The original notice a platform reply is recorded against. */
  reply: null | {
    noticeId: string;
    sentAt: string;
    responseType: string | null;
    responseReceivedAt: string | null;
    removed: boolean;
  };
  /** Why the hourly sweep could not send the next ladder step, if it could not. */
  ladderBlock: string | null;
};

export type AdminCaseFingerprint = {
  id: string;
  status: string;
  quality: number;
  digestPrefix: string;
  submittedAt: string;
  flagReason: string | null;
  requestedPlatformName: string | null;
  inSignedNotice: boolean;
};

export type AdminCaseDetail = {
  caseId: string;
  referenceNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  declarationSignedAt: string | null;
  ngoVerified: boolean;
  work: CaseWork;
  links: AdminCaseLink[];
  fingerprints: AdminCaseFingerprint[];
  timeline: Array<{ sequence: number; eventType: string; actorId: string; createdAt: string }>;
};

/**
 * A case reference from a URL segment: decoded once, upper-cased, and only in
 * the ASMITA-... shape. Anything else (including a malformed %-escape) is no
 * case, so the page and API answer 404 rather than failing.
 */
export function parseReference(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const reference = value.trim().toUpperCase();
  return /^ASMITA-[A-Z0-9-]{4,32}$/.test(reference) ? reference : null;
}

export async function getAdminCaseDetail(reference: string, now = new Date()): Promise<AdminCaseDetail | null> {
  const referenceNumber = parseReference(reference);
  if (!referenceNumber || devNoDb()) return null;

  const record = await db.case.findUnique({
    where: { referenceNumber },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      declarationSignedAt: true,
      ngoVerified: true,
      hashAdvisorySignedHashIds: true,
    },
  });
  if (!record) return null;

  const [gates, links, signed, notices, hashes] = await Promise.all([
    loadGates(),
    db.submittedUrl.findMany({
      where: { caseId: record.id },
      orderBy: { submittedAt: "asc" },
      select: {
        id: true,
        domain: true,
        status: true,
        flaggedForReview: true,
        flagReason: true,
        submittedAt: true,
        platformId: true,
        platformFiledAt: true,
        signedHashSubmissionIds: true,
      },
    }),
    db.submittedUrl.findMany({
      where: { caseId: record.id, signedNoticePdf: { not: null } },
      select: { id: true },
    }),
    db.notice.findMany({
      where: { submittedUrl: { caseId: record.id } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        urlId: true,
        sentAt: true,
        escalationLevel: true,
        followUpOf: true,
        responseType: true,
        responseReceivedAt: true,
        removedAt: true,
      },
    }),
    db.hashSubmission.findMany({
      where: { caseId: record.id },
      orderBy: { submittedAt: "asc" },
      select: {
        id: true,
        status: true,
        quality: true,
        hashDigest: true,
        submittedAt: true,
        flagReason: true,
        requestedPlatform: { select: { name: true } },
      },
    }),
  ]);

  const signedIds = new Set(signed.map((row) => row.id));
  const signedFingerprints = new Set([
    ...links.flatMap((link) => (signedIds.has(link.id) ? link.signedHashSubmissionIds : [])),
    ...record.hashAdvisorySignedHashIds,
  ]);
  const linkFacts: LinkFact[] = links.map((link) => ({
    id: link.id,
    status: link.status,
    flaggedForReview: link.flaggedForReview,
    submittedAt: link.submittedAt,
    platformId: link.platformId,
    platformFiledAt: link.platformFiledAt,
    signed: signedIds.has(link.id),
  }));
  const originals = notices.filter((notice) => !notice.followUpOf && notice.sentAt);
  const blocks = await loadLadderBlocks(originals);
  const pending = hashes.filter((hash) => hash.status === "PENDING_REVIEW");
  const facts: CaseFacts = {
    id: record.id,
    referenceNumber: record.referenceNumber,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    declarationSignedAt: record.declarationSignedAt,
    links: linkFacts,
    notices: originals
      .filter((notice, index) => originals.findIndex((other) => other.urlId === notice.urlId) === index)
      .map((notice) => ({
        urlId: notice.urlId,
        sentAt: notice.sentAt as Date,
        responseType: notice.responseType,
        responseReceivedAt: notice.responseReceivedAt,
        removedAt: notice.removedAt,
        ladderBlock: blocks.get(notice.id) ?? null,
      })),
    pendingFingerprints: pending.length,
    oldestPendingFingerprint: pending[0]?.submittedAt ?? null,
  };
  const work = deriveCaseWork(facts, gates, now);

  // A sent link keeps the NOTICE_QUEUED status (dispatch records a Notice
  // row but does not move the link on), so a sent notice is what counts.
  const sentUrlIds = new Set(originals.map((notice) => notice.urlId));
  const dispatchable = linkFacts.filter((link) => {
    const platform = link.platformId ? gates.platforms.get(link.platformId) : undefined;
    return (
      link.status === "NOTICE_QUEUED" &&
      !sentUrlIds.has(link.id) &&
      link.signed &&
      platform?.emailReady &&
      EMAIL_NOTICE_TYPES[platform.noticeBasis]
    );
  });
  const templates = await loadDispatchTemplates(
    dispatchable.map((link) => gates.platforms.get(link.platformId!)!),
  );

  const entityIds = [
    record.id,
    ...links.map((link) => link.id),
    ...notices.map((notice) => notice.id),
    ...hashes.map((hash) => hash.id),
  ];
  const timeline = await db.auditLog.findMany({
    where: { entityId: { in: entityIds } },
    orderBy: { sequence: "desc" },
    take: 100,
    select: { sequence: true, eventType: true, actorId: true, createdAt: true },
  });

  return {
    caseId: record.id,
    referenceNumber: record.referenceNumber,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    declarationSignedAt: record.declarationSignedAt?.toISOString() ?? null,
    ngoVerified: record.ngoVerified,
    work,
    links: links.map((link) => {
      const platform = link.platformId ? gates.platforms.get(link.platformId) : undefined;
      const linkNotices = notices.filter((notice) => notice.urlId === link.id);
      const fact = facts.notices.find((notice) => notice.urlId === link.id);
      const startedAt = fact?.sentAt ?? link.platformFiledAt;
      const ladder = startedAt
        ? buildLadder({ startedAt, status: link.status, responseType: fact?.responseType, responseAt: fact?.responseReceivedAt, now })
        : null;
      const current = ladder ? ladder.steps.findIndex((step) => step.state === "current") + 1 : 0;
      const template = platform ? templates.get(platform.id) : undefined;
      const canSend = dispatchable.some((candidate) => candidate.id === link.id);
      return {
        id: link.id,
        domain: link.domain,
        status: link.status,
        flaggedForReview: link.flaggedForReview,
        flagReason: link.flagReason,
        noticeSent: sentUrlIds.has(link.id),
        submittedAt: link.submittedAt.toISOString(),
        retained: !isUrlExpired(link.submittedAt, now),
        platformId: link.platformId,
        platformName: platform?.name ?? "Unknown platform",
        noticeBasis: platform?.noticeBasis ?? null,
        emailReady: platform?.emailReady ?? false,
        contactVerifiedAt: platform?.lastContactVerifiedAt?.toISOString() ?? null,
        signed: signedIds.has(link.id),
        signedFingerprintIds: signedIds.has(link.id) ? link.signedHashSubmissionIds : [],
        platformFiledAt: link.platformFiledAt?.toISOString() ?? null,
        notices: linkNotices.map((notice) => ({
          id: notice.id,
          sentAt: notice.sentAt?.toISOString() ?? null,
          escalationLevel: notice.escalationLevel,
          followUp: Boolean(notice.followUpOf),
          responseType: notice.responseType,
        })),
        dispatch:
          canSend && template && platform?.grievanceEmail
            ? {
                recipient: platform.grievanceEmail,
                templateType: template.templateType,
                templateVersion: template.version,
                reviewedAt: template.reviewedAt?.toISOString() ?? null,
                reviewedByName: template.reviewedByName,
              }
            : null,
        ladderStep: current > 0 ? current : null,
        reply: (() => {
          const original = originals.find((notice) => notice.urlId === link.id);
          return original
            ? {
                noticeId: original.id,
                sentAt: (original.sentAt as Date).toISOString(),
                responseType: original.responseType,
                responseReceivedAt: original.responseReceivedAt?.toISOString() ?? null,
                removed: Boolean(original.removedAt) || link.status === "REMOVED",
              }
            : null;
        })(),
        ladderBlock: fact?.ladderBlock ?? null,
      };
    }),
    fingerprints: hashes.map((hash) => ({
      id: hash.id,
      status: hash.status,
      quality: hash.quality,
      digestPrefix: hash.hashDigest.slice(0, 12),
      submittedAt: hash.submittedAt.toISOString(),
      flagReason: hash.flagReason,
      requestedPlatformName: hash.requestedPlatform?.name ?? null,
      inSignedNotice: signedFingerprints.has(hash.id),
    })),
    timeline: timeline.map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      actorId: event.actorId || "system",
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

// The template /api/notices/dispatch would pick for each platform: active,
// legally reviewed (unless the dev bypass is on), platform-specific first.
async function loadDispatchTemplates(platforms: PlatformFact[]) {
  const skipLegal = devFlagEnabled("DEV_SKIP_LEGAL_REVIEW");
  const result = new Map<
    string,
    { templateType: string; version: number; reviewedAt: Date | null; reviewedByName: string | null }
  >();
  for (const platform of new Map(platforms.map((entry) => [entry.id, entry])).values()) {
    const templateType = EMAIL_NOTICE_TYPES[platform.noticeBasis];
    if (!templateType) continue;
    const template = await db.noticeTemplate.findFirst({
      where: {
        templateType: templateType as never,
        isActive: true,
        ...(skipLegal ? {} : { reviewedByLegal: true }),
        OR: [{ platformId: platform.id }, { platformId: null }],
      },
      orderBy: [{ platformId: "desc" }, { version: "desc" }],
      select: { templateType: true, version: true, reviewedAt: true, reviewedByName: true },
    });
    if (template) result.set(platform.id, template);
  }
  return result;
}

/** Platforms for the case list's filter, by name. */
export async function listPlatformOptions(): Promise<Array<{ id: string; name: string }>> {
  const gates = await loadGates();
  return Array.from(gates.platforms.values())
    .map((platform) => ({ id: platform.id, name: platform.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The ladder steps the hourly sweep refused, per original notice. The sweep
 * records each refusal as a NOTICE_FAILED audit entry with the level it
 * tried; a refusal is current while that level is still above the level the
 * notice reached. Removed notices have nothing left to block.
 */
async function loadLadderBlocks(
  notices: Array<{ id: string; escalationLevel: number; removedAt: Date | null }>,
): Promise<Map<string, string>> {
  const open = notices.filter((notice) => !notice.removedAt && notice.escalationLevel < 3);
  if (devNoDb() || !open.length) return new Map();
  const failures = await db.auditLog.findMany({
    where: { eventType: "NOTICE_FAILED", entityType: "Notice", entityId: { in: open.map((notice) => notice.id) } },
    orderBy: { sequence: "desc" },
    select: { entityId: true, data: true },
  });
  const levels = new Map(open.map((notice) => [notice.id, notice.escalationLevel]));
  const blocks = new Map<string, string>();
  for (const failure of failures) {
    if (!failure.entityId || blocks.has(failure.entityId)) continue;
    const data = (failure.data ?? {}) as { reason?: unknown; escalationLevel?: unknown };
    const level = typeof data.escalationLevel === "number" ? data.escalationLevel : null;
    const reached = levels.get(failure.entityId) ?? 0;
    // Newest entry per notice decides; an older failure for a level since sent is history.
    blocks.set(failure.entityId, level !== null && level > reached ? String(data.reason ?? "unknown") : "");
  }
  for (const [id, reason] of blocks) if (!reason) blocks.delete(id);
  return blocks;
}

export type QueueSummary = {
  kind: NextActionKind;
  count: number;
  /** Cases whose due time has passed. */
  overdue: number;
  oldestDueAt: Date | null;
};

const ACTIVE_STATUSES = ["OPEN", "PARTIALLY_RESOLVED", "ESCALATED"];

/** Open cases counted by next action, plus the ten most urgent. */
export async function summariseQueues(now = new Date()): Promise<{
  queues: QueueSummary[];
  dueNext: AdminCaseListRow[];
  actionable: number;
}> {
  const all = await listAdminCases({ statuses: ACTIVE_STATUSES }, { limit: Number.MAX_SAFE_INTEGER, now });
  const queues = NEXT_ACTIONS.map((kind) => {
    const rows = all.rows.filter((row) => row.nextAction === kind);
    const dues = rows.map((row) => row.dueAt?.getTime()).filter((value): value is number => value !== undefined);
    return {
      kind,
      count: rows.length,
      overdue: dues.filter((due) => due < now.getTime()).length,
      oldestDueAt: dues.length ? new Date(Math.min(...dues)) : null,
    };
  });
  const operatorWork = all.rows.filter((row) => OPERATOR_ACTIONS.has(row.nextAction));
  return { queues, dueNext: operatorWork.slice(0, 10), actionable: operatorWork.length };
}

/** Next actions that wait on an operator, not on the survivor or a platform. */
export const OPERATOR_ACTIONS = new Set<NextActionKind>([
  "review_links",
  "review_fingerprints",
  "send_notice",
  "blocked_legal_review",
  "blocked_contact",
  "blocked_escalation",
]);

let actionableCache: { at: number; count: number } | null = null;

/** Open cases waiting on an operator, cached for 30 seconds for the nav. */
export async function countActionableCases(now = new Date()): Promise<number> {
  if (actionableCache && now.getTime() - actionableCache.at < 30_000) return actionableCache.count;
  const { actionable } = await summariseQueues(now);
  actionableCache = { at: now.getTime(), count: actionable };
  return actionable;
}

export type AdminUrlReviewRow = {
  caseId: string;
  referenceNumber: string;
  urlId: string;
  platformName: string;
  domain: string;
  status: string;
  reason: string;
  investigationOnly: boolean;
  ageMinutes: number;
  slaState: "within_sla" | "due_soon" | "breached";
};

/**
 * Links waiting for a human decision, oldest case first. Named columns only:
 * the flagged queue never loads the encrypted link or the signed PDF.
 */
export async function listFlaggedLinks(now = new Date()): Promise<AdminUrlReviewRow[]> {
  const toRow = (input: {
    caseId: string;
    referenceNumber: string;
    caseCreatedAt: Date;
    urlId: string;
    platformName: string;
    domain: string;
    status: string;
    flagReason: string | null;
  }): AdminUrlReviewRow => {
    const ageMinutes = Math.max(0, Math.floor((now.getTime() - input.caseCreatedAt.getTime()) / 60_000));
    const known = Boolean(findPlatformByDomain(input.domain));
    return {
      caseId: input.caseId,
      referenceNumber: input.referenceNumber,
      urlId: input.urlId,
      platformName: input.platformName,
      domain: input.domain,
      status: input.status,
      reason: !known
        ? "Unknown platform: investigate public reporting routes"
        : input.flagReason || "Needs human review before dispatch",
      investigationOnly: !known,
      ageMinutes,
      slaState: ageMinutes >= 240 ? "breached" : ageMinutes >= 180 ? "due_soon" : "within_sla",
    };
  };

  if (devNoDb()) {
    return (await listAllCases()).flatMap((record) =>
      record.urls
        .filter((url) => url.flaggedForReview || url.status === "PENDING_REVIEW")
        .map((url) =>
          toRow({
            caseId: record.id,
            referenceNumber: record.referenceNumber,
            caseCreatedAt: new Date(record.createdAt),
            urlId: url.id,
            platformName: url.platformName,
            domain: url.domain,
            status: url.status,
            flagReason: url.flagReason ?? null,
          }),
        ),
    );
  }
  const links = await db.submittedUrl.findMany({
    where: { OR: [{ status: "PENDING_REVIEW" }, { flaggedForReview: true }] },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true,
      domain: true,
      status: true,
      flagReason: true,
      platform: { select: { name: true } },
      case: { select: { id: true, referenceNumber: true, createdAt: true } },
    },
  });
  return links.map((link) =>
    toRow({
      caseId: link.case.id,
      referenceNumber: link.case.referenceNumber,
      caseCreatedAt: link.case.createdAt,
      urlId: link.id,
      platformName: link.platform?.name ?? findPlatformByDomain(link.domain)?.name ?? "Unknown platform",
      domain: link.domain,
      status: link.status,
      flagReason: link.flagReason,
    }),
  );
}
