import { writeAuditLog } from "@/lib/audit";
import { listLabServices, type LabServiceView } from "@/lib/lab/lab-services";
import { computeClusterCandidates, type ClusterRunResult } from "@/lib/lab/infra/cluster";
import { recordInfraScan, recordScanFindings } from "@/lib/lab/infra/store";
import { scanService, SIGNATURE_VERSION, type ScannerDeps } from "@/lib/lab/infra/scanner";

/*
 * WP114 (research-tools-spec.md): one infrastructure-scan run. On demand
 * from an admin (one service) or from the weekly cron (every tracked
 * service, hard-capped at 100 services and 300 URLs per run so the run can
 * never run away). One LAB_INFRA_SCAN_RUN audit entry records counts and
 * the trigger only — never a service name or URL.
 */

export const MAX_SERVICES_PER_RUN = 100;
export const MAX_URLS_PER_RUN = 300;

export type InfraScanRunResult = {
  servicesScanned: number;
  urlsScanned: number;
  urlsFetched: number;
  servicesSkipped: number;
  findingsUpserted: number;
  findingsDeactivated: number;
  linkCandidates: number;
  reasons: Record<string, number>;
};

export type InfraScanDeps = ScannerDeps & {
  now?: () => Date;
  maxServices?: number;
  maxUrls?: number;
};

/** Scans one service now (admin "scan" action): all its URLs, then clusters. */
export async function runInfraScanForService(
  service: LabServiceView,
  trigger: "admin" | "cron" | "test",
  deps: InfraScanDeps = {},
): Promise<InfraScanRunResult> {
  return scanServices([service], trigger, deps);
}

/** The weekly run: every tracked service, capped per run. */
export async function runInfraScanRun(
  trigger: "admin" | "cron" | "test",
  deps: InfraScanDeps = {},
): Promise<InfraScanRunResult> {
  const services = (await listLabServices()).filter((service) => service.urls.length > 0);
  return scanServices(services, trigger, deps);
}

async function scanServices(
  services: LabServiceView[],
  trigger: "admin" | "cron" | "test",
  deps: InfraScanDeps,
): Promise<InfraScanRunResult> {
  const now = deps.now ?? (() => new Date());
  const maxServices = Math.min(deps.maxServices ?? MAX_SERVICES_PER_RUN, MAX_SERVICES_PER_RUN);
  const maxUrls = Math.min(deps.maxUrls ?? MAX_URLS_PER_RUN, MAX_URLS_PER_RUN);
  const result: InfraScanRunResult = {
    servicesScanned: 0,
    urlsScanned: 0,
    urlsFetched: 0,
    servicesSkipped: 0,
    findingsUpserted: 0,
    findingsDeactivated: 0,
    linkCandidates: 0,
    reasons: {},
  };
  const scannedIds: string[] = [];
  let urlBudget = maxUrls;

  for (const service of services) {
    if (result.servicesScanned >= maxServices || urlBudget <= 0) {
      result.servicesSkipped += 1;
      continue;
    }
    const urls = service.urls.slice(0, urlBudget);
    urlBudget -= urls.length;
    const scan = await scanService(urls, deps);
    // Findings belong to the service; the scan row that last saw them is
    // the newest scan of this run.
    let lastScanId = "";
    for (const entry of scan.scans) {
      const recorded = await recordInfraScan(
        { serviceId: service.id, url: entry.url, finalUrl: entry.finalUrl, httpStatus: entry.httpStatus, error: entry.error },
        SIGNATURE_VERSION,
        now(),
      );
      lastScanId = recorded.id;
    }
    result.urlsScanned += scan.scans.length;
    result.urlsFetched += scan.scans.filter((entry) => entry.error === null).length;

    const tracked = await recordScanFindings(service.id, lastScanId, scan.findings, scan.checkedCategories, now());
    result.findingsUpserted += tracked.upserted;
    result.findingsDeactivated += tracked.deactivated;
    result.servicesScanned += 1;
    scannedIds.push(service.id);
  }

  if (scannedIds.length > 0) {
    const cluster: ClusterRunResult = await computeClusterCandidates(scannedIds, now());
    result.linkCandidates = cluster.candidatesCreated;
    result.reasons = cluster.reasons;
  }

  if (result.urlsScanned > 0) {
    await writeAuditLog({
      eventType: "LAB_INFRA_SCAN_RUN",
      entityType: "LabService",
      data: {
        trigger,
        servicesScanned: result.servicesScanned,
        servicesSkipped: result.servicesSkipped,
        urlsScanned: result.urlsScanned,
        urlsFetched: result.urlsFetched,
        findingsUpserted: result.findingsUpserted,
        findingsDeactivated: result.findingsDeactivated,
        linkCandidates: result.linkCandidates,
      },
    });
  }
  return result;
}
