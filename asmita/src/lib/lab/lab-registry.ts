import { listLabChokepoints, type LabChokepointView } from "@/lib/lab/lab-chokepoints";
import { listLabReports, type LabReportView } from "@/lib/lab/lab-reports";
import { listLabServices, type LabServiceView } from "@/lib/lab/lab-services";
import {
  latestInfraScanAtByService,
  listActiveInfraFindings,
  listInfraFindingsForService,
  listInfraScansForService,
  listLabProviders,
  listServiceLinks,
  type LabInfraFindingView,
  type LabInfraScanView,
  type LabProviderView,
  type LabServiceLinkView,
} from "@/lib/lab/infra/store";
import { promotableKindFor, PROMOTABLE_CATEGORIES } from "@/lib/lab/infra/promote";
import {
  LAB_INFRA_CATEGORIES,
  type LabChokepointKind,
  type LabInfraCategory,
  type LabServiceKind,
  type LabServiceStatus,
} from "@/lib/lab/lab-store";

/*
 * WP115 (research-tools-spec.md): the data the registry console pages are
 * rendered from. Everything is assembled from the existing list functions,
 * so the memory, Kysely and Prisma backends show the same registry. This is
 * admin-only data — service names, URLs and providers are allowed here, and
 * none of it ever feeds a public page (lab-stats.ts owns those numbers).
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/* ---- the registry table ---- */

export type LabRegistryFilters = {
  status?: LabServiceStatus;
  category?: LabInfraCategory;
  provider?: string;
};

export type LabRegistryRow = {
  service: LabServiceView;
  lastScanAt: string | null;
  /** The service's chokepoints, counted per kind. */
  chokepointsByKind: Partial<Record<LabChokepointKind, number>>;
  chokepointTotal: number;
  /** Confirmed cluster links, and candidates awaiting review. */
  confirmedLinks: number;
  candidateLinks: number;
  /** The categories the service has at least one active finding in. */
  activeCategories: LabInfraCategory[];
  /** Provider names the service depends on (chokepoints and active findings). */
  providers: string[];
};

export type LabRegistryData = {
  rows: LabRegistryRow[];
  /** Filter options: every provider name seen on a chokepoint or finding. */
  providerNames: string[];
  /** Filter options: categories with at least one active finding anywhere. */
  categories: LabInfraCategory[];
};

export async function labRegistryData(filters: LabRegistryFilters = {}): Promise<LabRegistryData> {
  const [services, chokepoints, providers, links, activeFindings, lastScans] = await Promise.all([
    listLabServices(),
    listLabChokepoints(),
    listLabProviders(),
    listServiceLinks(),
    listActiveInfraFindings(),
    latestInfraScanAtByService(),
  ]);

  const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const findingsByService = new Map<string, LabInfraFindingView[]>();
  for (const finding of activeFindings) {
    const list = findingsByService.get(finding.serviceId) ?? [];
    list.push(finding);
    findingsByService.set(finding.serviceId, list);
  }
  const chokepointsByService = new Map<string, LabChokepointView[]>();
  for (const chokepoint of chokepoints) {
    const list = chokepointsByService.get(chokepoint.serviceId) ?? [];
    list.push(chokepoint);
    chokepointsByService.set(chokepoint.serviceId, list);
  }

  const rows: LabRegistryRow[] = [];
  const providerNames = new Set<string>();
  const categoriesSeen = new Set<LabInfraCategory>();

  for (const service of services) {
    const serviceChokepoints = chokepointsByService.get(service.id) ?? [];
    const serviceFindings = findingsByService.get(service.id) ?? [];
    const serviceLinks = links.filter((link) => link.serviceAId === service.id || link.serviceBId === service.id);

    const chokepointsByKind: Partial<Record<LabChokepointKind, number>> = {};
    const serviceProviders = new Set<string>();
    for (const chokepoint of serviceChokepoints) {
      chokepointsByKind[chokepoint.kind] = (chokepointsByKind[chokepoint.kind] ?? 0) + 1;
      serviceProviders.add(chokepoint.provider);
      providerNames.add(chokepoint.provider);
    }
    const activeCategories = new Set<LabInfraCategory>();
    for (const finding of serviceFindings) {
      activeCategories.add(finding.category);
      categoriesSeen.add(finding.category);
      if (finding.providerId) {
        const name = providerNameById.get(finding.providerId);
        if (name) {
          serviceProviders.add(name);
          providerNames.add(name);
        }
      }
    }

    if (filters.status && service.status !== filters.status) continue;
    if (filters.category && !activeCategories.has(filters.category)) continue;
    if (filters.provider && !serviceProviders.has(filters.provider)) continue;

    rows.push({
      service,
      lastScanAt: lastScans.get(service.id) ?? null,
      chokepointsByKind,
      chokepointTotal: serviceChokepoints.length,
      confirmedLinks: serviceLinks.filter((link) => link.status === "CONFIRMED").length,
      candidateLinks: serviceLinks.filter((link) => link.status === "CANDIDATE").length,
      activeCategories: [...activeCategories],
      providers: [...serviceProviders].sort((a, b) => a.localeCompare(b)),
    });
  }

  return {
    rows,
    providerNames: [...providerNames].sort((a, b) => a.localeCompare(b)),
    categories: LAB_INFRA_CATEGORIES.filter((category) => categoriesSeen.has(category)),
  };
}

/* ---- one service's registry page ---- */

export type LabRegistryFinding = LabInfraFindingView & {
  providerName: string | null;
  /** The chokepoint kind this finding promotes to, null when none. */
  promotableKind: LabChokepointKind | null;
};

export type LabRegistryCategoryGroup = {
  category: LabInfraCategory;
  /** What the newest scans still see. */
  active: LabRegistryFinding[];
  /** What earlier scans saw and the newest no longer do — the "switched from" history. */
  inactive: LabRegistryFinding[];
};

export type LabRegistryLink = {
  link: LabServiceLinkView;
  otherServiceName: string;
  otherServiceKind: LabServiceKind;
};

export type LabRegistryServiceDetail = {
  service: LabServiceView;
  scans: LabInfraScanView[];
  categoryGroups: LabRegistryCategoryGroup[];
  /** Categories with promotable findings, for the promote forms. */
  promotableCategories: LabInfraCategory[];
  links: LabRegistryLink[];
  chokepoints: LabChokepointView[];
  reports: LabReportView[];
  /** The directory rows a finding's promote form can choose from. */
  providers: LabProviderView[];
};

export async function labRegistryServiceDetail(id: string): Promise<LabRegistryServiceDetail | null> {
  const [services, providers] = await Promise.all([listLabServices(), listLabProviders()]);
  const service = services.find((entry) => entry.id === id);
  if (!service) return null;

  const [scans, findings, links, chokepoints, reports] = await Promise.all([
    listInfraScansForService(id),
    listInfraFindingsForService(id),
    listServiceLinks(),
    listLabChokepoints(),
    listLabReports(),
  ]);
  const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const promotable = new Set<LabInfraCategory>(PROMOTABLE_CATEGORIES);

  const decorate = (finding: LabInfraFindingView): LabRegistryFinding => ({
    ...finding,
    providerName: finding.providerId ? providerNameById.get(finding.providerId) ?? null : null,
    promotableKind: promotable.has(finding.category) ? promotableKindFor(finding.category) : null,
  });

  const categoriesPresent = new Set<LabInfraCategory>(findings.map((finding) => finding.category));
  const categoryGroups: LabRegistryCategoryGroup[] = [];
  for (const category of LAB_INFRA_CATEGORIES) {
    if (!categoriesPresent.has(category)) continue;
    const inCategory = findings.filter((finding) => finding.category === category).map(decorate);
    categoryGroups.push({
      category,
      active: inCategory.filter((finding) => finding.active),
      inactive: inCategory.filter((finding) => !finding.active),
    });
  }

  const serviceLinks = links.filter((link) => link.serviceAId === id || link.serviceBId === id);
  const registryLinks: LabRegistryLink[] = serviceLinks.map((link) => {
    const otherId = link.serviceAId === id ? link.serviceBId : link.serviceAId;
    const other = services.find((entry) => entry.id === otherId);
    return {
      link,
      otherServiceName: other?.name ?? "—",
      otherServiceKind: other?.kind ?? "WEBSITE",
    };
  });

  return {
    service,
    scans,
    categoryGroups,
    promotableCategories: [...promotable],
    links: registryLinks,
    chokepoints: chokepoints.filter((chokepoint) => chokepoint.serviceId === id),
    reports: reports.filter(
      (report) => report.serviceId === id || report.bulkServiceIds.includes(id),
    ),
    providers,
  };
}

/* ---- the provider directory ---- */

export type LabProviderDependent = {
  id: string;
  name: string;
  kind: LabServiceKind;
  urls: string[];
  viaChokepoint: boolean;
  viaFinding: boolean;
};

export type LabProviderReportHistory = {
  sent: number;
  awaiting: number;
  actioned: number;
  refused: number;
  noReply: number;
  /** Median days from sending to a recorded outcome. */
  medianDaysToOutcome: number | null;
};

export type LabProviderDirectoryEntry = {
  provider: LabProviderView;
  dependents: LabProviderDependent[];
  reports: LabProviderReportHistory;
};

export async function labProviderDirectory(): Promise<LabProviderDirectoryEntry[]> {
  const [providers, services, chokepoints, reports, activeFindings] = await Promise.all([
    listLabProviders(),
    listLabServices(),
    listLabChokepoints(),
    listLabReports(),
    listActiveInfraFindings(),
  ]);

  return providers.map((provider) => {
    // Which services depend on this provider: a chokepoint recorded against
    // its name and kind, or an active finding linked to its directory row.
    const dependents = new Map<string, LabProviderDependent>();
    const addDependent = (service: LabServiceView, viaChokepoint: boolean, viaFinding: boolean) => {
      const existing = dependents.get(service.id);
      if (existing) {
        existing.viaChokepoint ||= viaChokepoint;
        existing.viaFinding ||= viaFinding;
        return;
      }
      dependents.set(service.id, {
        id: service.id, name: service.name, kind: service.kind, urls: service.urls,
        viaChokepoint, viaFinding,
      });
    };
    for (const chokepoint of chokepoints) {
      if (chokepoint.provider !== provider.name || chokepoint.kind !== provider.kind) continue;
      const service = services.find((entry) => entry.id === chokepoint.serviceId);
      if (service) addDependent(service, true, false);
    }
    for (const finding of activeFindings) {
      if (finding.providerId !== provider.id) continue;
      const service = services.find((entry) => entry.id === finding.serviceId);
      if (service) addDependent(service, false, true);
    }

    // Its reports: sent through a chokepoint of this name and kind, or a
    // bulk report drafted against this directory row's name.
    const history: LabProviderReportHistory = { sent: 0, awaiting: 0, actioned: 0, refused: 0, noReply: 0, medianDaysToOutcome: null };
    const durations: number[] = [];
    for (const report of reports) {
      const viaChokepointRow =
        report.chokepointId !== null &&
        chokepoints.some((chokepoint) => chokepoint.id === report.chokepointId && chokepoint.provider === provider.name && chokepoint.kind === provider.kind);
      const viaBulkRow = report.bulkProviderName === provider.name && report.templateKind === provider.kind;
      if (!viaChokepointRow && !viaBulkRow) continue;
      if (report.status !== "SENT" || !report.sentAt) continue;
      history.sent += 1;
      if (report.outcome === "ACTIONED") history.actioned += 1;
      else if (report.outcome === "REFUSED") history.refused += 1;
      else if (report.outcome === "NO_REPLY") history.noReply += 1;
      else history.awaiting += 1;
      if (report.outcomeAt) {
        durations.push(daysBetween(new Date(report.sentAt), new Date(report.outcomeAt)));
      }
    }
    history.medianDaysToOutcome = median(durations);

    return {
      provider,
      dependents: [...dependents.values()].sort((a, b) => a.name.localeCompare(b.name)),
      reports: history,
    };
  });
}
