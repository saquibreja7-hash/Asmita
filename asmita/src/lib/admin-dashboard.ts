import { inMemoryAuditLog } from "@/lib/audit";
import { calculateBetaMetrics, type BetaMetrics } from "@/lib/beta-metrics";
import { db } from "@/lib/db";
import { feedbackRecords } from "@/lib/feedback";
import { calculatePlatformResponseRates, type PlatformResponseSample } from "@/lib/response-rates";
import { listAllCases, type DisplayCase } from "@/lib/case-ops";
import { createReverificationQueue } from "@/lib/go-reverification";
import { platformDirectory, HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";
import { deliveryEvents } from "@/lib/webhook-events";

export type AdminCaseFilters = {
  status?: string;
  platform?: string;
  review?: string;
  escalation?: string;
  from?: string;
  to?: string;
};

export type AdminCaseRow = {
  caseId: string;
  referenceNumber: string;
  status: string;
  createdAt: string;
  urlCount: number;
  platforms: string[];
  reviewFlagCount: number;
  escalationState: "none" | "review" | "queued" | "resolved";
};

export type AdminUrlReviewRow = {
  caseId: string;
  referenceNumber: string;
  urlId: string;
  platformName: string;
  domain: string;
  status: string;
  reason: string;
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
  rateLimitLift: string;
  auditEventId: string;
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
  privacyNote: string;
};

export async function listAdminCaseRows(filters: AdminCaseFilters = {}): Promise<AdminCaseRow[]> {
  const records = await listAllCases();
  const fromTime = filters.from ? Date.parse(filters.from) : null;
  const toTime = filters.to ? Date.parse(filters.to) : null;

  return records
    .map((record) => {
      const platforms = Array.from(new Set(record.urls.map((url) => url.platformName)));
      const reviewFlagCount = record.urls.filter((url) => url.flaggedForReview || url.status === "PENDING_REVIEW").length;
      const hasQueued = record.urls.some((url) => url.status === "NOTICE_QUEUED");
      const hasResolved = record.urls.some((url) => url.status === "REMOVED" || url.status === "REJECTED");
      return {
        caseId: record.id,
        referenceNumber: record.referenceNumber,
        status: record.status,
        createdAt: record.createdAt,
        urlCount: record.urls.length,
        platforms,
        reviewFlagCount,
        escalationState: reviewFlagCount ? "review" : hasQueued ? "queued" : hasResolved ? "resolved" : "none",
      } satisfies AdminCaseRow;
    })
    .filter((row) => {
      const createdTime = Date.parse(row.createdAt);
      const matchesStatus = !filters.status || filters.status === "all" || row.status === filters.status;
      const matchesPlatform =
        !filters.platform ||
        filters.platform === "all" ||
        row.platforms.some((platform) => platform.toLowerCase().includes(filters.platform!.toLowerCase()));
      const matchesReview =
        !filters.review ||
        filters.review === "all" ||
        (filters.review === "flagged" ? row.reviewFlagCount > 0 : row.reviewFlagCount === 0);
      const matchesEscalation =
        !filters.escalation || filters.escalation === "all" || row.escalationState === filters.escalation;
      const matchesFrom = !fromTime || createdTime >= fromTime;
      const matchesTo = !toTime || createdTime <= toTime + 24 * 60 * 60_000;
      return matchesStatus && matchesPlatform && matchesReview && matchesEscalation && matchesFrom && matchesTo;
    });
}

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
          reason: url.flagReason || "Needs human review before dispatch",
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

export function listTemplateEditorRows() {
  return [
    {
      id: "it-rules-default",
      version: "v0.1-draft",
      language: "English",
      legalReviewStatus: "Pending legal review",
      active: false,
      rollbackVersion: "None",
      preview:
        "Formal notice draft with case reference, literal URL list, statutory basis, and no victim name unless consent is recorded.",
    },
    {
      id: "dmca-default",
      version: "v0.1-draft",
      language: "English",
      legalReviewStatus: "Pending legal review",
      active: false,
      rollbackVersion: "None",
      preview:
        "DMCA-style draft with case reference, ownership declaration, literal URL list, and platform response instructions.",
    },
    {
      id: "hindi-support-draft",
      version: "v0.1-draft",
      language: "Hindi draft",
      legalReviewStatus: "Pending legal and language review",
      active: false,
      rollbackVersion: "None",
      preview: "Hindi support copy remains draft until a qualified reviewer approves tone, clarity, and legal meaning.",
    },
  ];
}

export function listPlatformResponseDashboardRows() {
  const samples: PlatformResponseSample[] = [
    {
      platformId: "instagram",
      platformName: "Instagram / Meta",
      noticeSentAt: daysAgo(1),
      responseReceivedAt: daysAgo(1),
      removedAt: daysAgo(1),
    },
    {
      platformId: "pornhub",
      platformName: "Pornhub",
      noticeSentAt: daysAgo(2),
    },
    {
      platformId: "telegram",
      platformName: "Telegram",
      noticeSentAt: daysAgo(3),
      responseReceivedAt: daysAgo(2),
    },
  ];

  return calculatePlatformResponseRates(samples).map((row) => ({
    ...row,
    removals: samples.filter((sample) => sample.platformId === row.platformId && sample.removedAt).length,
    nonResponses: row.noticesSent - row.responded,
    medianResponseHours: row.responded ? 18 : null,
  }));
}

export function listNgoVouchingRows(): NgoVouchingRow[] {
  const rows = inMemoryAuditLog
    .filter((event) => event.eventType === "NGO_VERIFIED")
    .map((event) => ({
      partnerName: String(event.data?.partnerName || event.actorId || "NGO partner"),
      caseReference: String(event.data?.caseReference || event.entityId || "Case"),
      vouchedAt: event.createdAt,
      rateLimitLift: "Trusted NGO vouch applied",
      auditEventId: String(event.sequence),
    }));
  if (rows.length) return rows;
  return [
    {
      partnerName: "Awaiting signed NGO partner",
      caseReference: "No production vouches yet",
      vouchedAt: new Date().toISOString(),
      rateLimitLift: "Shown after valid API key vouch",
      auditEventId: "pending",
    },
  ];
}

export function listAuditLogRows(filters: { eventType?: string; actorId?: string; entityId?: string } = {}) {
  return inMemoryAuditLog
    .filter((event) => !filters.eventType || filters.eventType === "all" || event.eventType === filters.eventType)
    .filter((event) => !filters.actorId || event.actorId?.includes(filters.actorId))
    .filter((event) => !filters.entityId || event.entityId?.includes(filters.entityId))
    .slice()
    .reverse()
    .map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      actorId: event.actorId || "system",
      entityType: event.entityType || "unknown",
      entityId: event.entityId || "unknown",
      createdAt: event.createdAt,
      eventHash: event.eventHash.slice(0, 16),
    }));
}

export async function getInternalAnalytics(): Promise<InternalAnalytics> {
  const records = await listAllCases();
  const urls = records.flatMap((record) => record.urls);
  const betaMetrics = calculateBetaMetrics({
    cases: records.map((record) => ({ caseId: record.id, registeredAt: record.createdAt })),
    notices: records.flatMap((record) =>
      record.urls.map((url) => {
        const noticeSentAt = url.status === "NOTICE_QUEUED" || url.status === "REMOVED" ? record.createdAt : undefined;
        return {
          caseId: record.id,
          noticeSentAt,
          deliveredAt: noticeSentAt,
          acknowledgedAt: url.status === "REMOVED" ? addHours(record.createdAt, 12) : undefined,
          removedAt: url.status === "REMOVED" ? addHours(record.createdAt, 24) : undefined,
          legalPackageRequestedAt: url.status === "REJECTED" ? addHours(record.createdAt, 168) : undefined,
        };
      }),
    ),
    feedback: feedbackRecords.map((record) => ({ rating: record.rating })),
    deliveryEvents,
    scheduler: {
      expectedRuns: Math.max(1, urls.length),
      completedRuns: urls.length,
      duplicateRuns: 0,
      lagMinutes: 0,
    },
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
    auditEventCounts: countBy(inMemoryAuditLog.map((event) => event.eventType)).map(([eventType, count]) => ({
      eventType,
      count,
    })),
    betaMetrics,
    privacyNote: "Aggregated operational analytics only; no submitted URL strings or victim PII are exposed.",
  };
}

function canDispatchToPlatform(platform: PlatformDirectoryEntry) {
  if (!platform.lastContactVerifiedByHuman) return false;
  if (!platform.lastContactVerifiedAt) return false;
  if (platform.grievanceEmail === HUMAN_VERIFICATION_REQUIRED && !platform.formUrl && !platform.apiEndpoint) return false;
  return true;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}

function addHours(timestamp: string, hours: number) {
  return new Date(Date.parse(timestamp) + hours * 60 * 60_000).toISOString();
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}
