import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";

/*
 * The platform scorecard (docs/org/spec.md, WP58): a public, aggregate view
 * of how platforms respond to the takedown notices Meri Asmita sends.
 *
 * This module is pure computation — no database import, no side effects —
 * so the aggregation is tested with fixtures and the read-only guarantee is
 * a property of its only input path (scorecard-snapshots.ts reads complaint
 * data; nothing here or there ever writes to the complaint workflow).
 *
 * What the data supports (and what this therefore computes):
 * - notices sent: original notices (Notice.sentAt) plus hash advisory
 *   dispatches (HashDispatch.dispatchedAt), per platform per calendar
 *   quarter of sending.
 * - share actioned: of the URL notices, the share whose link is recorded
 *   removed (SubmittedUrl.status REMOVED, Notice.removedAt or a REMOVED
 *   platform answer). Hash advisories carry no outcome fields, so they count
 *   towards notices sent but never towards the actioned share.
 * - median hours to first platform response, where a response time is
 *   recorded (Notice.responseReceivedAt).
 * - median hours to removal, where Notice.removedAt is recorded. Links a
 *   survivor marked removed herself have no removal timestamp, so they count
 *   as actioned but not towards this median.
 * - share actioned within PLATFORM_DEADLINE_HOURS of dispatch.
 * - follow-ups needed: the 24-hour follow-up notices an original notice
 *   collected (Notice.followUpOf), which only happens while a platform had
 *   not answered.
 *
 * Small-number rule: a platform with fewer than SCORECARD_MIN_NOTICES
 * notices in a period reports nothing but its name and the fact that there
 * are not enough notices — the numbers are dropped at computation time, not
 * hidden at display time, so they never reach a snapshot, a CSV or a page.
 */

/** Fewer notices than this in a period and a platform shows no numbers. */
export const SCORECARD_MIN_NOTICES = 10;

/** "2026-Q4" — the period label and URL form of a calendar quarter. */
export const SCORECARD_PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;
export type ScorecardPeriod = string;

const HOUR_MS = 60 * 60_000;

export function isScorecardPeriod(period: string): period is ScorecardPeriod {
  return SCORECARD_PERIOD_PATTERN.test(period);
}

/** The calendar quarter a timestamp falls in, as "YYYY-Qn". */
export function scorecardPeriodOf(at: Date | string): ScorecardPeriod {
  const date = typeof at === "string" ? new Date(at) : at;
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

/** [start, end) of a period, as UTC dates. */
export function scorecardPeriodRange(period: ScorecardPeriod): { start: Date; end: Date } {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(6));
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 1)),
  };
}

function previousScorecardPeriod(period: ScorecardPeriod): ScorecardPeriod {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(6));
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
}

/** The most recent quarter that has fully ended (a scorecard for the
 *  quarter in progress would change under it every day). */
export function latestCompletedScorecardPeriod(now = new Date()): ScorecardPeriod {
  return previousScorecardPeriod(scorecardPeriodOf(now));
}

export function isValidScorecardPeriodForCompute(period: ScorecardPeriod, now = new Date()): boolean {
  return scorecardPeriodRange(period).end <= now;
}

/** One original notice about a link, with everything the scorecard reads. */
export type ScorecardUrlNotice = {
  platformId: string;
  /** Notice.sentAt — when the original notice went out. */
  sentAt: string;
  /** SubmittedUrl.status when the snapshot was computed. */
  urlStatus: string | null;
  /** Notice.responseType: ACKNOWLEDGED | REMOVED | REJECTED, once answered. */
  responseType: string | null;
  /** Notice.responseReceivedAt — when the platform first answered. */
  firstResponseAt: string | null;
  /** Notice.removedAt — when a removal was recorded. */
  removedAt: string | null;
  /** Follow-up notices (Notice.followUpOf) this original collected. */
  followUps: number;
};

/** One hash advisory dispatch (HashDispatch), which has no outcome record. */
export type ScorecardHashAdvisory = {
  platformId: string;
  dispatchedAt: string;
};

export type ScorecardPlatformRow = {
  platformName: string;
  insufficient: boolean;
  /** Null on every field when insufficient — numbers are dropped, not hidden. */
  noticesSent: number | null;
  hashAdvisoriesSent: number | null;
  urlNoticesSent: number | null;
  /** Fractions in [0, 1]; null when there is nothing to measure. */
  shareActioned: number | null;
  medianHoursToFirstResponse: number | null;
  medianHoursToRemoval: number | null;
  shareActionedWithinDeadline: number | null;
  followUpsNeeded: number | null;
};

/** The aggregate payload a snapshot stores: numbers only, no ids of any kind. */
export type ScorecardData = {
  period: ScorecardPeriod;
  /** The small-number threshold and deadline in force when computed, published
   *  with the methodology so the numbers can be read against them. */
  minNotices: number;
  deadlineHours: number;
  platforms: ScorecardPlatformRow[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(raw * 10) / 10;
}

const hoursBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / HOUR_MS;

function isActioned(notice: ScorecardUrlNotice): boolean {
  return (
    notice.urlStatus === "REMOVED" ||
    notice.removedAt != null ||
    notice.responseType === "REMOVED"
  );
}

/**
 * The whole scorecard for one period. Rows from other periods are ignored, so
 * the caller may pass everything it read. Platform names come from the
 * platform table; an unknown platform id is skipped rather than guessed.
 */
export function aggregateScorecard(input: {
  period: ScorecardPeriod;
  urlNotices: ScorecardUrlNotice[];
  hashAdvisories: ScorecardHashAdvisory[];
  platformNames: Record<string, string>;
}): ScorecardData {
  type Bucket = {
    urlNotices: ScorecardUrlNotice[];
    hashAdvisories: number;
  };
  const byPlatform = new Map<string, Bucket>();

  for (const notice of input.urlNotices) {
    if (scorecardPeriodOf(notice.sentAt) !== input.period) continue;
    let bucket = byPlatform.get(notice.platformId);
    if (!bucket) byPlatform.set(notice.platformId, (bucket = { urlNotices: [], hashAdvisories: 0 }));
    bucket.urlNotices.push(notice);
  }
  for (const advisory of input.hashAdvisories) {
    if (scorecardPeriodOf(advisory.dispatchedAt) !== input.period) continue;
    let bucket = byPlatform.get(advisory.platformId);
    if (!bucket) byPlatform.set(advisory.platformId, (bucket = { urlNotices: [], hashAdvisories: 0 }));
    bucket.hashAdvisories += 1;
  }

  const rows: ScorecardPlatformRow[] = [];
  for (const [platformId, bucket] of byPlatform) {
    const platformName = input.platformNames[platformId];
    if (!platformName) continue;
    const noticesSent = bucket.urlNotices.length + bucket.hashAdvisories;
    if (noticesSent < SCORECARD_MIN_NOTICES) {
      rows.push({
        platformName,
        insufficient: true,
        noticesSent: null,
        hashAdvisoriesSent: null,
        urlNoticesSent: null,
        shareActioned: null,
        medianHoursToFirstResponse: null,
        medianHoursToRemoval: null,
        shareActionedWithinDeadline: null,
        followUpsNeeded: null,
      });
      continue;
    }
    const responseHours: number[] = [];
    const removalHours: number[] = [];
    let actionedCount = 0;
    let withinDeadline = 0;
    for (const notice of bucket.urlNotices) {
      if (notice.firstResponseAt && !Number.isNaN(Date.parse(notice.firstResponseAt))) {
        responseHours.push(hoursBetween(notice.sentAt, notice.firstResponseAt));
      }
      if (notice.removedAt && !Number.isNaN(Date.parse(notice.removedAt))) {
        removalHours.push(hoursBetween(notice.sentAt, notice.removedAt));
      }
      if (!isActioned(notice)) continue;
      actionedCount += 1;
      const actionTime = notice.removedAt ?? notice.firstResponseAt;
      if (actionTime && !Number.isNaN(Date.parse(actionTime)) && hoursBetween(notice.sentAt, actionTime) <= PLATFORM_DEADLINE_HOURS) {
        withinDeadline += 1;
      }
    }
    const denominator = bucket.urlNotices.length;
    rows.push({
      platformName,
      insufficient: false,
      noticesSent,
      hashAdvisoriesSent: bucket.hashAdvisories,
      urlNoticesSent: denominator,
      shareActioned: denominator > 0 ? Math.round((actionedCount / denominator) * 1000) / 1000 : null,
      medianHoursToFirstResponse: median(responseHours),
      medianHoursToRemoval: median(removalHours),
      shareActionedWithinDeadline:
        denominator > 0 ? Math.round((withinDeadline / denominator) * 1000) / 1000 : null,
      followUpsNeeded: bucket.urlNotices.reduce((sum, notice) => sum + notice.followUps, 0),
    });
  }

  rows.sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    if (!a.insufficient && !b.insufficient) {
      const byNotices = (b.noticesSent ?? 0) - (a.noticesSent ?? 0);
      if (byNotices !== 0) return byNotices;
    }
    return a.platformName.localeCompare(b.platformName);
  });

  return { period: input.period, minNotices: SCORECARD_MIN_NOTICES, deadlineHours: PLATFORM_DEADLINE_HOURS, platforms: rows };
}

/** The share columns as percentage points ("62.5"), the rest as plain numbers. */
export function scorecardCsv(data: ScorecardData, insufficientLabel = "Not enough notices to report"): string {
  const percent = (value: number | null) => (value == null ? "" : (value * 100).toFixed(1));
  const number = (value: number | null) => (value == null ? "" : String(value));
  const lines = [
    "Platform,Notices sent,Hash advisories sent,Link notices sent,Share actioned (%),Median hours to first response,Median hours to removal,Share actioned within deadline (%),Follow-ups needed",
  ];
  for (const row of data.platforms) {
    if (row.insufficient) {
      lines.push(csvCell(row.platformName) + "," + Array<string>(8).fill(csvCell(insufficientLabel)).join(","));
      continue;
    }
    lines.push(
      [
        csvCell(row.platformName),
        number(row.noticesSent),
        number(row.hashAdvisoriesSent),
        number(row.urlNoticesSent),
        percent(row.shareActioned),
        number(row.medianHoursToFirstResponse),
        number(row.medianHoursToRemoval),
        percent(row.shareActionedWithinDeadline),
        number(row.followUpsNeeded),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
