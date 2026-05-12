import { inMemoryAuditLog } from "@/lib/audit";
import { calculatePlatformResponseRates, type PlatformResponseSample } from "@/lib/response-rates";
import { cases, ensureDemoCase } from "@/lib/store";
import { createReverificationQueue } from "@/lib/go-reverification";
import { platformDirectory, HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";

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

export function listAdminCaseRows(filters: AdminCaseFilters = {}): AdminCaseRow[] {
  ensureDemoCase();
  const fromTime = filters.from ? Date.parse(filters.from) : null;
  const toTime = filters.to ? Date.parse(filters.to) : null;

  return Array.from(cases.values())
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

export function listReviewQueueRows(now = new Date()): AdminUrlReviewRow[] {
  ensureDemoCase();
  return Array.from(cases.values()).flatMap((record) =>
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

function canDispatchToPlatform(platform: PlatformDirectoryEntry) {
  if (!platform.lastContactVerifiedByHuman) return false;
  if (!platform.lastContactVerifiedAt) return false;
  if (platform.grievanceEmail === HUMAN_VERIFICATION_REQUIRED && !platform.formUrl && !platform.apiEndpoint) return false;
  return true;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}
