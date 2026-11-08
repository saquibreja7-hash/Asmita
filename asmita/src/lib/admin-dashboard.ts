import { inMemoryAuditLog } from "@/lib/audit";
import { calculateBetaMetrics, type BetaMetrics } from "@/lib/beta-metrics";
import { db } from "@/lib/db";
import { listAllCases, type DisplayCase } from "@/lib/case-ops";
import { createReverificationQueue } from "@/lib/go-reverification";
import { platformDirectory, findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";
import type { DeliveryEvent } from "@/lib/webhook-events";

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

export type GoChangeHistoryRow = {
  id: string;
  platformName: string;
  changedBy: string;
  field: string;
  previousValue: string;
  newValue: string;
  sourceUrl: string;
  changedAt: string;
};

export type NgoVouchingRow = {
  partnerName: string;
  caseReference: string;
  vouchedAt: string;
  auditSequence: number;
};

export type NoticeTemplateRow = {
  id: string;
  templateType: string;
  platformName: string | null;
  subject: string;
  version: number;
  isActive: boolean;
  reviewedByLegal: boolean;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

export type PlatformResponseRow = {
  platformId: string;
  platformName: string;
  noticesSent: number;
  repliesRecorded: number;
  removed: number;
  noReplyRecorded: number;
  medianReplyHours: number | null;
};

export type AuditLogFilters = { eventType?: string; actorId?: string; entityId?: string };

export type AuditLogRow = {
  sequence: number;
  eventType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  eventHash: string;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  // Pass as `before` to read the next (older) page; null on the last page.
  nextBefore: number | null;
};

export type InternalAnalytics = {
  totalCases: number;
  openCases: number;
  resolvedCases: number;
  urlRecordCount: number;
  reviewQueueItems: number;
  averageUrlsPerCase: number;
  urlStatusCounts: Array<{ status: string; count: number }>;
  platformCounts: Array<{ platformName: string; count: number }>;
  auditEventCounts: Array<{ eventType: string; count: number }>;
  betaMetrics: BetaMetrics;
  // False until Asmita records platform replies (acknowledgements, removals).
  repliesRecorded: boolean;
  firPackagesPrepared: number;
  privacyNote: string;
};

export async function listReviewQueueRows(now = new Date()): Promise<AdminUrlReviewRow[]> {
  const records = await listAllCases();
  return records.flatMap((record) =>
    record.urls
      .filter((url) => url.flaggedForReview || url.status === "PENDING_REVIEW")
      .map((url) => {
        const ageMinutes = Math.max(0, Math.floor((now.getTime() - Date.parse(record.createdAt)) / 60_000));
        return {
          caseId: record.id,
          referenceNumber: record.referenceNumber,
          urlId: url.id,
          platformName: url.platformName,
          domain: url.domain,
          status: url.status,
          reason: !findPlatformByDomain(url.domain) ? "Unknown platform: investigate public reporting routes" : url.flagReason || "Needs human review before dispatch",
          investigationOnly: !findPlatformByDomain(url.domain),
          ageMinutes,
          slaState: ageMinutes >= 240 ? "breached" : ageMinutes >= 180 ? "due_soon" : "within_sla",
        };
      }),
  );
}

export function listPlatformEditorRows() {
  const reverify = createReverificationQueue(platformDirectory);
  return platformDirectory.map((platform) => {
    const queueItem = reverify.find((item) => item.platformId === platform.id);
    return {
      ...platform,
      templateType: platform.noticeBasis,
      verificationSource: platform.lastContactVerifiedByHuman ? "human_verified_source" : "pending_human_source",
      lastVerifiedDate: platform.lastContactVerifiedAt || "Not verified",
      verifiedBy: platform.lastContactVerifiedByHuman ? "human_reviewer" : "Pending",
      staleFlag: Boolean(queueItem),
      staleReason: queueItem?.reason || "current",
      canDispatch: canDispatchToPlatform(platform),
    };
  });
}

export type PlatformEditorRow = ReturnType<typeof listPlatformEditorRows>[number];

export async function listPlatformEditorRowsFromDb(now: Date = new Date()) {
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return listPlatformEditorRows().map((row) => ({
      ...row,
      grievanceName: null,
      grievanceAddress: null,
      formUrl: row.formUrl ?? null,
      apiEndpoint: row.apiEndpoint ?? null,
      lastContactVerifiedAt: row.lastContactVerifiedAt ?? null,
      lastContactVerifiedByHuman: row.lastContactVerifiedByHuman,
    }));
  }
  const platforms = await db.platform.findMany({
    where: { isActive: true },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });
  const entries: PlatformDirectoryEntry[] = platforms.map((row) => ({
    id: row.id,
    name: row.name,
    domainPatterns: row.domainPatterns,
    tier: row.tier,
    noticeBasis: row.noticeBasis,
    grievanceEmail: row.grievanceEmail ?? HUMAN_VERIFICATION_REQUIRED,
    formUrl: row.formUrl ?? undefined,
    apiEndpoint: row.apiEndpoint ?? undefined,
    lastContactVerifiedByHuman: row.lastContactVerifiedByHuman,
    lastContactVerifiedAt: row.lastContactVerifiedAt?.toISOString(),
  }));
  const reverify = createReverificationQueue(entries, now);
  return platforms.map((row, index) => {
    const entry = entries[index];
    const queueItem = reverify.find((item) => item.platformId === row.id);
    return {
      id: row.id,
      name: row.name,
      tier: row.tier,
      noticeBasis: row.noticeBasis,
      domainPatterns: row.domainPatterns,
      grievanceEmail: row.grievanceEmail,
      grievanceName: row.grievanceName,
      grievanceAddress: row.grievanceAddress,
      formUrl: row.formUrl,
      apiEndpoint: row.apiEndpoint,
      templateType: row.noticeBasis,
      verificationSource: row.lastContactVerifiedByHuman ? "human_verified_source" : "pending_human_source",
      lastVerifiedDate: row.lastContactVerifiedAt?.toISOString() ?? "Not verified",
      lastContactVerifiedAt: row.lastContactVerifiedAt?.toISOString() ?? null,
      lastContactVerifiedByHuman: row.lastContactVerifiedByHuman,
      verifiedBy: row.lastContactVerifiedByHuman ? "human_reviewer" : "Pending",
      staleFlag: Boolean(queueItem),
      staleReason: queueItem?.reason || "current",
      canDispatch: canDispatchToPlatform(entry),
    };
  });
}

export async function listGoChangeHistoryRowsFromDb(limit = 50): Promise<GoChangeHistoryRow[]> {
  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return listGoChangeHistoryRows().slice(0, limit);
  }
  const rows = await db.platformGoHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { platform: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    platformName: row.platform.name,
    changedBy: row.verifiedBy || row.changedById || "admin",
    field: row.fieldName,
    previousValue: row.oldValue ?? "(unset)",
    newValue: row.newValue ?? "(unset)",
    sourceUrl: row.sourceUrl ?? "(no source recorded)",
    changedAt: row.createdAt.toISOString(),
  }));
}

export function listGoChangeHistoryRows(): GoChangeHistoryRow[] {
  const auditRows = inMemoryAuditLog
    .filter((event) => event.eventType === "GO_DATABASE_CHANGED")
    .map((event) => ({
      id: String(event.sequence),
      platformName: String(event.data?.platformName || event.entityId || "Platform"),
      changedBy: event.actorId || "admin",
      field: String(event.data?.field || "contact"),
      previousValue: String(event.data?.previousValue || "previous"),
      newValue: String(event.data?.newValue || "updated"),
      sourceUrl: String(event.data?.sourceUrl || "recorded source URL required"),
      changedAt: event.createdAt,
    }));

  if (auditRows.length) return auditRows;
  return [
    {
      id: "seed-history-1",
      platformName: "Instagram / Meta",
      changedBy: "GO editor",
      field: "grievanceEmail",
      previousValue: HUMAN_VERIFICATION_REQUIRED,
      newValue: "Blocked until verified",
      sourceUrl: "Required before production dispatch",
      changedAt: new Date().toISOString(),
    },
  ];
}

// Local development without a database keeps everything in memory.
function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export async function listNoticeTemplateRows(): Promise<NoticeTemplateRow[]> {
  if (devNoDb()) return [];
  const rows = await db.noticeTemplate.findMany({
    orderBy: [{ templateType: "asc" }, { version: "desc" }],
    select: {
      id: true,
      templateType: true,
      subjectTemplate: true,
      version: true,
      isActive: true,
      reviewedByLegal: true,
      reviewedAt: true,
      reviewedByName: true,
      platform: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    templateType: row.templateType,
    platformName: row.platform?.name ?? null,
    subject: row.subjectTemplate,
    version: row.version,
    isActive: row.isActive,
    reviewedByLegal: row.reviewedByLegal,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedByName,
  }));
}

type OriginalNoticeFact = {
  caseId: string;
  platformId: string;
  platformName: string;
  sentAt: Date;
  messageId: string | null;
  responseReceivedAt: Date | null;
  removedAt: Date | null;
  urlRemoved: boolean;
};

// Original notices only: follow-ups belong to the notice they follow. Link
// facts (case, status, platform) come from the case list the console already
// reads, so this never touches link records or their content.
async function loadSentOriginalNotices(cases: DisplayCase[], since?: Date): Promise<OriginalNoticeFact[]> {
  if (devNoDb()) return [];
  const links = new Map(
    cases.flatMap((record) => record.urls.map((url) => [url.id, { caseId: record.id, url }] as const)),
  );
  const rows = await db.notice.findMany({
    where: { followUpOf: null, sentAt: since ? { gte: since } : { not: null } },
    select: { urlId: true, sentAt: true, messageId: true, responseReceivedAt: true, removedAt: true },
  });
  return rows.flatMap((row) => {
    const link = links.get(row.urlId);
    if (!link) return [];
    return [{
      caseId: link.caseId,
      platformId: link.url.platformId ?? "unknown",
      platformName: link.url.platformName || "Unknown platform",
      sentAt: row.sentAt as Date,
      messageId: row.messageId,
      responseReceivedAt: row.responseReceivedAt,
      removedAt: row.removedAt,
      urlRemoved: link.url.status === "REMOVED",
    }];
  });
}

/** Notices sent in the last 7 days, by platform. */
export async function listPlatformResponseRows(now = new Date()): Promise<PlatformResponseRow[]> {
  const notices = await loadSentOriginalNotices(
    await listAllCases(),
    new Date(now.getTime() - 7 * 24 * 60 * 60_000),
  );
  const byPlatform = new Map<string, OriginalNoticeFact[]>();
  for (const notice of notices) {
    byPlatform.set(notice.platformId, [...(byPlatform.get(notice.platformId) ?? []), notice]);
  }
  return Array.from(byPlatform.entries())
    .map(([platformId, platformNotices]) => {
      const replied = platformNotices.filter((notice) => notice.responseReceivedAt);
      return {
        platformId,
        platformName: platformNotices[0].platformName,
        noticesSent: platformNotices.length,
        repliesRecorded: replied.length,
        removed: platformNotices.filter((notice) => notice.removedAt || notice.urlRemoved).length,
        noReplyRecorded: platformNotices.length - replied.length,
        medianReplyHours: median(
          replied.map((notice) => (notice.responseReceivedAt!.getTime() - notice.sentAt.getTime()) / 3_600_000),
        ),
      };
    })
    .sort((left, right) => right.noticesSent - left.noticesSent || left.platformName.localeCompare(right.platformName));
}

export async function listNgoVouchingRows(limit = 50): Promise<NgoVouchingRow[]> {
  if (devNoDb()) {
    return inMemoryAuditLog
      .filter((event) => event.eventType === "NGO_VERIFIED")
      .slice(-limit)
      .reverse()
      .map((event) => ({
        partnerName: String(event.data?.partnerName ?? "Unknown partner"),
        caseReference: event.entityId ?? "Unknown case",
        vouchedAt: event.createdAt,
        auditSequence: event.sequence,
      }));
  }
  const events = await db.auditLog.findMany({
    where: { eventType: "NGO_VERIFIED" },
    orderBy: { sequence: "desc" },
    take: limit,
    select: { sequence: true, entityId: true, data: true, createdAt: true },
  });
  const caseIds = events.map((event) => event.entityId).filter((id): id is string => Boolean(id));
  const cases = caseIds.length
    ? await db.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, referenceNumber: true } })
    : [];
  const references = new Map(cases.map((record) => [record.id, record.referenceNumber]));
  return events.map((event) => {
    const data = (event.data ?? {}) as Record<string, unknown>;
    return {
      partnerName: String(data.partnerName ?? "Unknown partner"),
      caseReference: (event.entityId && references.get(event.entityId)) || "Unknown case",
      vouchedAt: event.createdAt.toISOString(),
      auditSequence: event.sequence,
    };
  });
}

/**
 * Newest first, 50 per page. Filters match exactly: event type, actor id,
 * entity id (the case, link or notice id).
 */
export async function listAuditLogPage(
  filters: AuditLogFilters = {},
  options: { before?: number; limit?: number } = {},
): Promise<AuditLogPage> {
  const limit = options.limit ?? 50;
  const eventType = filters.eventType?.trim().toUpperCase() || undefined;
  const actorId = filters.actorId?.trim() || undefined;
  const entityId = filters.entityId?.trim() || undefined;
  if (eventType && !/^[A-Z_]+$/.test(eventType)) return { rows: [], nextBefore: null };

  let rows: AuditLogRow[];
  if (devNoDb()) {
    rows = inMemoryAuditLog
      .filter((event) => !eventType || event.eventType === eventType)
      .filter((event) => !actorId || event.actorId === actorId)
      .filter((event) => !entityId || event.entityId === entityId)
      .filter((event) => options.before === undefined || event.sequence < options.before)
      .slice()
      .reverse()
      .slice(0, limit + 1)
      .map((event) => toAuditRow({ ...event, createdAt: new Date(event.createdAt) }));
  } else {
    const records = await db.auditLog.findMany({
      where: {
        ...(eventType ? { eventType: eventType as never } : {}),
        ...(actorId ? { actorId } : {}),
        ...(entityId ? { entityId } : {}),
        ...(options.before !== undefined ? { sequence: { lt: options.before } } : {}),
      },
      orderBy: { sequence: "desc" },
      take: limit + 1,
      select: {
        sequence: true,
        eventType: true,
        actorId: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        eventHash: true,
      },
    });
    rows = records.map(toAuditRow);
  }
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { rows: page, nextBefore: hasMore ? page[page.length - 1].sequence : null };
}

function toAuditRow(event: {
  sequence: number;
  eventType: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: Date;
  eventHash: string;
}): AuditLogRow {
  return {
    sequence: event.sequence,
    eventType: event.eventType,
    actorId: event.actorId || "system",
    entityType: event.entityType || "unknown",
    entityId: event.entityId || "unknown",
    createdAt: event.createdAt.toISOString(),
    eventHash: event.eventHash.slice(0, 16),
  };
}

async function countAuditEvents(): Promise<Array<{ eventType: string; count: number }>> {
  if (devNoDb()) {
    return countBy(inMemoryAuditLog.map((event) => event.eventType)).map(([eventType, count]) => ({ eventType, count }));
  }
  const groups = await db.auditLog.groupBy({ by: ["eventType"], _count: { _all: true } });
  return groups
    .map((group) => ({ eventType: group.eventType, count: group._count._all }))
    .sort((left, right) => right.count - left.count || left.eventType.localeCompare(right.eventType));
}

async function loadDeliveredMessageIds(messageIds: string[]): Promise<Set<string>> {
  if (devNoDb() || !messageIds.length) return new Set();
  const proofs = await db.emailDeliveryProof.findMany({
    where: { messageId: { in: messageIds }, eventType: "delivered" },
    select: { messageId: true },
  });
  return new Set(proofs.map((proof) => proof.messageId));
}

async function loadRecentDeliveryEvents(now: Date): Promise<DeliveryEvent[]> {
  if (devNoDb()) return [];
  const proofs = await db.emailDeliveryProof.findMany({
    where: {
      receivedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) },
      eventType: { in: ["delivered", "bounced", "complained"] },
    },
    select: { messageId: true, eventType: true, platformId: true, receivedAt: true },
  });
  return proofs.map((proof) => ({
    type: proof.eventType as DeliveryEvent["type"],
    messageId: proof.messageId,
    platformId: proof.platformId ?? undefined,
    createdAt: proof.receivedAt.toISOString(),
  }));
}

async function countFirPackagesPrepared(): Promise<number> {
  if (devNoDb()) return 0;
  return db.case.count({ where: { firPackageGeneratedAt: { not: null } } });
}

export async function getInternalAnalytics(now = new Date()): Promise<InternalAnalytics> {
  const [records, auditEventCounts, deliveryEvents, firPackagesPrepared] = await Promise.all([
    listAllCases(),
    countAuditEvents(),
    loadRecentDeliveryEvents(now),
    countFirPackagesPrepared(),
  ]);
  const notices = await loadSentOriginalNotices(records);
  const delivered = await loadDeliveredMessageIds(
    notices.map((notice) => notice.messageId).filter((id): id is string => Boolean(id)),
  );
  const urls = records.flatMap((record) => record.urls);
  const betaMetrics = calculateBetaMetrics({
    cases: records.map((record) => ({ caseId: record.id, registeredAt: record.createdAt })),
    // Only measured times: sent, delivered (Resend webhook), reply and removal
    // as recorded on the notice. Nothing is estimated.
    notices: notices.map((notice) => ({
      caseId: notice.caseId,
      noticeSentAt: notice.sentAt.toISOString(),
      deliveredAt: notice.messageId && delivered.has(notice.messageId) ? notice.sentAt.toISOString() : undefined,
      acknowledgedAt: notice.responseReceivedAt?.toISOString(),
      removedAt: notice.removedAt?.toISOString(),
    })),
    // Feedback is not stored in the database and nothing measures the
    // scheduler, so the page does not show either; these inputs are empty.
    feedback: [],
    deliveryEvents,
    scheduler: { expectedRuns: 0, completedRuns: 0, duplicateRuns: 0, lagMinutes: 0 },
  });
  return {
    totalCases: records.length,
    openCases: records.filter((record) => record.status === "OPEN").length,
    resolvedCases: records.filter((record) => record.status === "RESOLVED").length,
    urlRecordCount: urls.length,
    reviewQueueItems: urls.filter((url) => url.flaggedForReview || url.status === "PENDING_REVIEW").length,
    averageUrlsPerCase: records.length ? Number((urls.length / records.length).toFixed(2)) : 0,
    urlStatusCounts: countBy(urls.map((url) => url.status)).map(([status, count]) => ({ status, count })),
    platformCounts: countBy(urls.map((url) => url.platformName)).map(([platformName, count]) => ({ platformName, count })),
    auditEventCounts,
    betaMetrics,
    repliesRecorded: notices.some((notice) => notice.responseReceivedAt || notice.removedAt),
    firPackagesPrepared,
    privacyNote: "Aggregated operational analytics only; no submitted URL strings or victim PII are exposed.",
  };
}

function canDispatchToPlatform(platform: PlatformDirectoryEntry) {
  if (!platform.lastContactVerifiedByHuman) return false;
  if (!platform.lastContactVerifiedAt) return false;
  if (platform.grievanceEmail === HUMAN_VERIFICATION_REQUIRED && !platform.formUrl && !platform.apiEndpoint) return false;
  return true;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return Number(value.toFixed(1));
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}
