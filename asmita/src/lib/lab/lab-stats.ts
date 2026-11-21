import { listLabChokepoints } from "@/lib/lab/lab-chokepoints";
import { listLabReports, type LabReportView } from "@/lib/lab/lab-reports";
import { listLabServices } from "@/lib/lab/lab-services";
import { listActiveInfraFindings, listInfraFindingsForService, type LabInfraFindingView } from "@/lib/lab/infra/store";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind, type LabInfraCategory } from "@/lib/lab/lab-store";

/*
 * E2 aggregates (docs/lab/charter.md): the console dashboard and the public
 * /lab numbers. Computed from the three list views, so the maths is the
 * same on every backend. Aggregate numbers only — nothing here names or
 * links a service, and none of it reaches the public page in any other form.
 *
 * WP115 (research-tools-spec.md) adds the registry's public aggregates:
 * counts of services per dependency category and the share that changed
 * provider after a report. Every public count is k-anonymity masked: fewer
 * than five reads as null and the page shows "fewer than 5".
 */

const DAY_MS = 24 * 60 * 60 * 1_000;
const DOWN_WITHIN_DAYS = 30;

/** The k in "k ≥ 5 for any public count, else show fewer than 5" (the spec). */
export const LAB_PUBLIC_MIN_COUNT = 5;

/** A public count below k is never published, not even in the page data: null means "fewer than 5". */
function maskedCount(count: number): number | null {
  return count >= LAB_PUBLIC_MIN_COUNT ? count : null;
}

/**
 * The dependency categories the public tracker counts (the spec names these
 * four): a card payment processor, a crypto gateway, a CDN, a Telegram bot
 * or channel.
 */
export const LAB_PUBLIC_DEPENDENCY_CATEGORIES = [
  { key: "payment", category: "PAYMENT" },
  { key: "crypto", category: "CRYPTO_ADDRESS" },
  { key: "cdn", category: "CDN" },
  { key: "telegram", category: "TELEGRAM_LINK" },
] as const;
export type LabPublicDependencyKey = (typeof LAB_PUBLIC_DEPENDENCY_CATEGORIES)[number]["key"];

/**
 * "Changed provider" means one of the companies a report can go to changed:
 * host, CDN, registrar, payments, app store, ad network or the login
 * platform. ANALYTICS_ID is deliberately excluded — an analytics tag is a
 * measurement tool, not a provider relationship — and so are the purely
 * descriptive categories (nameservers, mail, TLS, links).
 */
const SWITCH_CATEGORIES: LabInfraCategory[] = [
  "HOSTING_ASN", "CDN", "REGISTRAR", "PAYMENT", "APP_STORE_LINK", "ADS", "AUTH_SSO",
];

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
  /**
   * WP115: services per dependency category, from the infrastructure scans.
   * null means "fewer than 5" (k ≥ 5 for any public count) — the raw count
   * below k never leaves this module.
   */
  byCategory: Record<LabPublicDependencyKey, number | null>;
  /**
   * Whether any scan ever recorded one of the counted dependencies. It lets
   * the page say "nothing recorded yet" instead of four misleading
   * "fewer than 5" rows on a registry with no findings; it is one bit over
   * the whole registry, attributable to no service.
   */
  dependencyEvidenceSeen: boolean;
  /**
   * WP115: the share that changed provider after a report. `reported` is
   * every service with a sent report (already public above);
   * `changed` counts services that switched a reportable provider after
   * their first report, masked to null below k.
   */
  changedProviderAfterReport: { reported: number; changed: number | null };
};

/**
 * Whether a service switched a reportable provider after `firstSentAt`: a
 * finding that spans the report date in a switch category stopped being
 * seen, and a different value in the same category first appeared later.
 */
function switchedProviderAfter(findings: LabInfraFindingView[], firstSentAt: string): boolean {
  const reportedAt = new Date(firstSentAt).getTime();
  for (const category of SWITCH_CATEGORIES) {
    const inCategory = findings.filter((finding) => finding.category === category);
    if (inCategory.length < 2) continue;
    const liveAtReport = inCategory.filter(
      (finding) => new Date(finding.firstSeenAt).getTime() <= reportedAt && new Date(finding.lastSeenAt).getTime() >= reportedAt,
    );
    if (liveAtReport.length === 0) continue;
    const later = inCategory.filter((finding) => new Date(finding.firstSeenAt).getTime() > reportedAt);
    if (later.some((next) => liveAtReport.some((previous) => previous.value !== next.value))) return true;
  }
  return false;
}

/** The public tracker aggregates (WP92 + WP115): counts and medians only, nothing that could name a service. */
export async function labPublicNumbers(): Promise<LabPublicNumbers> {
  const [stats, services, reports, activeFindings] = await Promise.all([
    labDashboardStats(),
    listLabServices(),
    listLabReports(),
    listActiveInfraFindings(),
  ]);
  const byKind = {} as Record<LabChokepointKind, LabPublicKindNumbers>;
  for (const kind of LAB_CHOKEPOINT_KINDS) {
    byKind[kind] = {
      reported: stats.byKind[kind].reported,
      down: stats.byKind[kind].down,
      medianDays: stats.medianDaysByKind[kind],
    };
  }

  // WP115: services per dependency category, from active findings only —
  // a service counts once whatever it uses several of.
  const servicesByCategory = new Map<LabInfraCategory, Set<string>>();
  for (const finding of activeFindings) {
    const set = servicesByCategory.get(finding.category) ?? new Set<string>();
    set.add(finding.serviceId);
    servicesByCategory.set(finding.category, set);
  }
  const byCategory = {} as Record<LabPublicDependencyKey, number | null>;
  for (const { key, category } of LAB_PUBLIC_DEPENDENCY_CATEGORIES) {
    byCategory[key] = maskedCount(servicesByCategory.get(category)?.size ?? 0);
  }
  const dependencyEvidenceSeen = LAB_PUBLIC_DEPENDENCY_CATEGORIES.some(
    ({ category }) => (servicesByCategory.get(category)?.size ?? 0) > 0,
  );

  // WP115: the share that changed a reportable provider after the first
  // report. Only reported services are examined, so the page can say "of
  // the services we have reported".
  let changed = 0;
  let reported = 0;
  for (const service of services) {
    const first = firstReportFor(reports, service.id);
    if (!first || !first.sentAt) continue;
    reported += 1;
    const findings = await listInfraFindingsForService(service.id);
    if (switchedProviderAfter(findings, first.sentAt)) changed += 1;
  }

  return {
    servicesTracked: stats.servicesTotal,
    servicesTakenDown: stats.servicesByStatus.DOWN,
    medianDaysToDown: stats.medianDaysOverall,
    servicesByStatus: stats.servicesByStatus,
    downWithin30Days: stats.downWithin30Days,
    byKind,
    byCategory,
    dependencyEvidenceSeen,
    changedProviderAfterReport: { reported, changed: maskedCount(changed) },
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/** One service's first sent report, or null before any was sent. A bulk report counts for every service it lists. */
function firstReportFor(reports: LabReportView[], serviceId: string) {
  const sent = reports
    .filter((report) => {
      if (report.status !== "SENT" || !report.sentAt) return false;
      return report.serviceId === serviceId || report.bulkServiceIds.includes(serviceId);
    })
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
