import { listLabChokepoints } from "@/lib/lab/lab-chokepoints";
import { listLabReports } from "@/lib/lab/lab-reports";
import { listLabServices } from "@/lib/lab/lab-services";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind } from "@/lib/lab/lab-store";

/*
 * E2 aggregates (docs/lab/charter.md): the console dashboard and the public
 * /lab numbers. Computed from the three list views, so the maths is the
 * same on every backend. Aggregate numbers only — nothing here names or
 * links a service, and none of it reaches the public page in any other form.
 */

const DAY_MS = 24 * 60 * 60 * 1_000;
const DOWN_WITHIN_DAYS = 30;

export type LabDashboardStats = {
  servicesTotal: number;
  servicesByStatus: { ACTIVE: number; DOWN: number; UNKNOWN: number };
  chokepointsTotal: number;
  reports: { drafts: number; awaitingOutcome: number; sent: number; actioned: number; refused: number; noReply: number };
  /** Median days from a service's first report to its going down, per provider kind. */
  medianDaysByKind: Record<LabChokepointKind, number | null>;
  /** Per kind: services whose first sent report went to that kind, and how many of them went down after it (WP92). */
  byKind: Record<LabChokepointKind, { reported: number; down: number }>;
  medianDaysOverall: number | null;
  /** The E2 metric: share of reported services that went down within 30 days of the first report. */
  downWithin30Days: { reported: number; downWithin: number };
};

/** One provider-kind row of the public tracker (WP92): counts and one median, nothing else. */
export type LabPublicKindNumbers = {
  /** Services whose first sent report went to a company of this kind. */
  reported: number;
  /** Of those, the services that went down after that report. */
  down: number;
  /** Median days from that first report to down; null until one of them did. */
  medianDays: number | null;
};

/** What the public /lab/tracker page shows: counts, medians and status splits, never a name or a link. */
export type LabPublicNumbers = {
  servicesTracked: number;
  servicesTakenDown: number;
  /** Median days from first report to down across all reported services; null before there is data. */
  medianDaysToDown: number | null;
  /** The tracked services by what the liveness check last saw; aggregate only. */
  servicesByStatus: { ACTIVE: number; DOWN: number; UNKNOWN: number };
  /** The E2 metric: services with a sent report, and how many went down within 30 days of the first one. */
  downWithin30Days: { reported: number; downWithin: number };
  /** Per provider kind — the kind of company the first report went to — aggregate only. */
  byKind: Record<LabChokepointKind, LabPublicKindNumbers>;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/** One service's first sent report, or null before any was sent. */
function firstReportFor(reports: { serviceId: string; status: string; sentAt: string | null; chokepointKind: LabChokepointKind }[], serviceId: string) {
  const sent = reports
    .filter((report) => report.serviceId === serviceId && report.status === "SENT" && report.sentAt)
    .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
  return sent[0] ?? null;
}

export async function labDashboardStats(): Promise<LabDashboardStats> {
  const [services, chokepoints, reports] = await Promise.all([
    listLabServices(),
    listLabChokepoints(),
    listLabReports(),
  ]);

  const servicesByStatus = { ACTIVE: 0, DOWN: 0, UNKNOWN: 0 };
  for (const service of services) servicesByStatus[service.status] += 1;

  const counts = { drafts: 0, awaitingOutcome: 0, sent: 0, actioned: 0, refused: 0, noReply: 0 };
  for (const report of reports) {
    if (report.status === "DRAFT") counts.drafts += 1;
    else {
      counts.sent += 1;
      if (report.outcome === "ACTIONED") counts.actioned += 1;
      else if (report.outcome === "REFUSED") counts.refused += 1;
      else if (report.outcome === "NO_REPLY") counts.noReply += 1;
      else counts.awaitingOutcome += 1;
    }
  }

  const durationsByKind = new Map<LabChokepointKind, number[]>();
  for (const kind of LAB_CHOKEPOINT_KINDS) durationsByKind.set(kind, []);
  const byKind = {} as Record<LabChokepointKind, { reported: number; down: number }>;
  for (const kind of LAB_CHOKEPOINT_KINDS) byKind[kind] = { reported: 0, down: 0 };
  const durationsOverall: number[] = [];
  let reported = 0;
  let downWithin = 0;

  for (const service of services) {
    const first = firstReportFor(reports, service.id);
    if (!first || !first.sentAt) continue;
    reported += 1;
    byKind[first.chokepointKind].reported += 1;
    const firstAt = new Date(first.sentAt);
    if (service.status === "DOWN" && service.downSince) {
      const downAt = new Date(service.downSince);
      if (downAt >= firstAt) {
        const days = daysBetween(firstAt, downAt);
        durationsByKind.get(first.chokepointKind)?.push(days);
        durationsOverall.push(days);
        byKind[first.chokepointKind].down += 1;
        if (days <= DOWN_WITHIN_DAYS) downWithin += 1;
      }
    }
  }

  const medianDaysByKind = {} as Record<LabChokepointKind, number | null>;
  for (const kind of LAB_CHOKEPOINT_KINDS) {
    medianDaysByKind[kind] = median(durationsByKind.get(kind) ?? []);
  }

  return {
    servicesTotal: services.length,
    servicesByStatus,
    chokepointsTotal: chokepoints.length,
    reports: counts,
    medianDaysByKind,
    byKind,
    medianDaysOverall: median(durationsOverall),
    downWithin30Days: { reported, downWithin },
  };
}

/** The public tracker aggregates (WP92): counts and medians only, nothing that could name a service. */
export async function labPublicNumbers(): Promise<LabPublicNumbers> {
  const stats = await labDashboardStats();
  const byKind = {} as Record<LabChokepointKind, LabPublicKindNumbers>;
  for (const kind of LAB_CHOKEPOINT_KINDS) {
    byKind[kind] = {
      reported: stats.byKind[kind].reported,
      down: stats.byKind[kind].down,
      medianDays: stats.medianDaysByKind[kind],
    };
  }
  return {
    servicesTracked: stats.servicesTotal,
    servicesTakenDown: stats.servicesByStatus.DOWN,
    medianDaysToDown: stats.medianDaysOverall,
    servicesByStatus: stats.servicesByStatus,
    downWithin30Days: stats.downWithin30Days,
    byKind,
  };
}
