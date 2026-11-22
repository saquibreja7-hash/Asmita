import { getDomain } from "tldts";
import {
  createServiceLink,
  findActiveFindingsByValue,
  listInfraFindingsForService,
  type LabInfraFindingView,
} from "@/lib/lab/infra/store";
import { registrableDomain } from "@/lib/lab/lab-lookup";
import { listLabServices } from "@/lib/lab/lab-services";
import type { LabInfraCategory } from "@/lib/lab/lab-store";

/*
 * WP114 (research-tools-spec.md): clustering candidates. After each scan,
 * services that share an analytics ID, a crypto address, a resolved IP, an
 * exact nameserver set or a TLS SAN become LabServiceLink candidates for an
 * analyst to confirm or dismiss (WP115). Two guards keep the links honest:
 *  - a shared-CDN anycast IP is not evidence, so SHARED_IP skips services
 *    with any active CDN finding;
 *  - everyone on a big commercial DNS provider shares its NS set, so
 *    SHARED_NAMESERVER_SET skips sets made only of large providers.
 */

// Registrable domains of widely-shared managed DNS services. When every NS
// host of a set lives on one of these, the set is not evidence of a shared
// operator. Extend as analysts meet more; keep it conservative.
const LARGE_DNS_PROVIDERS = new Set([
  "cloudflare.com",
  "googledomains.com",
  "google.com",
  "azure-dns.com",
  "azure-dns.net",
  "azure-dns.org",
  "nsone.net",
  "ultradns.com",
  "ultradns.org",
  "ultradns.net",
  "dnsmadeeasy.com",
  "digitalocean.com",
  "nscloud.co",
  "dnsimple.com",
  "dnsimple.io",
  "dynect.net",
  "registrar-servers.com",
  "domaincontrol.com",
  "vercel-dns.com",
  "no-ip.com",
]);

/** Whether one NS host belongs to a large shared DNS provider. */
function isLargeDnsHost(nsHost: string): boolean {
  const registrable = getDomain(nsHost) ?? nsHost;
  if (LARGE_DNS_PROVIDERS.has(registrable)) return true;
  // Amazon Route 53 runs on hosts like ns-123.awsdns-45.org.
  return registrable.startsWith("awsdns");
}

/** A nameserver set links services only when it is not a big provider's. */
function nameserverSetIsLinkable(nsSetValue: string): boolean {
  const hosts = nsSetValue.split(",").filter(Boolean);
  if (hosts.length === 0) return false;
  return !hosts.every(isLargeDnsHost);
}

type ClusterReason = {
  reason: "SHARED_ANALYTICS_ID" | "SHARED_IP" | "SHARED_NAMESERVER_SET" | "SHARED_CRYPTO_ADDRESS" | "SHARED_TLS_SAN";
  category: LabInfraCategory;
  /** Whether this finding is a candidate for linking at all. */
  ownMatches?: (finding: LabInfraFindingView) => boolean;
  /** Whether the pair (own finding's service, other finding's service) may be linked. */
  pairMatches?: (
    own: LabInfraFindingView,
    other: LabInfraFindingView,
    findingsOf: (serviceId: string) => LabInfraFindingView[],
  ) => boolean;
};

function hasActiveCdn(findings: LabInfraFindingView[]): boolean {
  return findings.some((finding) => finding.active && finding.category === "CDN");
}

const REASONS: ClusterReason[] = [
  { reason: "SHARED_ANALYTICS_ID", category: "ANALYTICS_ID" },
  { reason: "SHARED_CRYPTO_ADDRESS", category: "CRYPTO_ADDRESS" },
  {
    // Skip IPs of shared-CDN anycast ranges: a service behind a CDN shares
    // its address with every other site on that CDN, which proves nothing
    // about the operator. The guard is two-sided.
    reason: "SHARED_IP",
    category: "HOSTING_ASN",
    pairMatches: (own, other, findingsOf) =>
      !hasActiveCdn(findingsOf(own.serviceId)) && !hasActiveCdn(findingsOf(other.serviceId)),
  },
  {
    reason: "SHARED_NAMESERVER_SET",
    category: "NAMESERVER",
    ownMatches: (finding) => nameserverSetIsLinkable(finding.value),
  },
  {
    // TLS SAN candidates are SAN-domain values; issuer names never carry
    // the SAN evidence marker.
    reason: "SHARED_TLS_SAN",
    category: "TLS_ISSUER",
    ownMatches: isSanFinding,
  },
];

function isSanFinding(finding: LabInfraFindingView): boolean {
  return finding.category === "TLS_ISSUER" && finding.evidence.startsWith("CT SAN");
}

/** Registrable domain → the tracked services whose URLs sit on it. */
async function serviceIdsByDomain(): Promise<Map<string, Set<string>>> {
  const byDomain = new Map<string, Set<string>>();
  for (const service of await listLabServices()) {
    for (const url of service.urls) {
      let domain: string | null = null;
      try {
        domain = registrableDomain(new URL(url).hostname);
      } catch {
        domain = null;
      }
      if (!domain) continue;
      const set = byDomain.get(domain) ?? new Set<string>();
      set.add(service.id);
      byDomain.set(domain, set);
    }
  }
  return byDomain;
}

export type ClusterRunResult = { candidatesCreated: number; reasons: Record<string, number> };

/**
 * Computes LabServiceLink candidates for the services just scanned,
 * linking them with every other service that shares a clusterable value.
 */
export async function computeClusterCandidates(
  scannedServiceIds: string[],
  now: Date,
): Promise<ClusterRunResult> {
  const result: ClusterRunResult = { candidatesCreated: 0, reasons: {} };
  const loaded = new Map<string, LabInfraFindingView[]>();
  const findingsOf = (serviceId: string): LabInfraFindingView[] => loaded.get(serviceId) ?? [];
  for (const serviceId of scannedServiceIds) {
    loaded.set(serviceId, await listInfraFindingsForService(serviceId));
  }

  for (const { reason, category, ownMatches, pairMatches } of REASONS) {
    let reasonCount = 0;
    const seen = new Set<string>();
    for (const serviceId of scannedServiceIds) {
      const own = (loaded.get(serviceId) ?? []).filter((finding) => finding.active && finding.category === category);
      for (const finding of own) {
        if (ownMatches && !ownMatches(finding)) continue;
        const key = `${finding.serviceId}:${finding.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const others = (await findActiveFindingsByValue(finding.value, category)).filter(
          (other) => other.serviceId !== finding.serviceId,
        );
        for (const other of others) {
          if (!loaded.has(other.serviceId)) {
            loaded.set(other.serviceId, await listInfraFindingsForService(other.serviceId));
          }
          if (pairMatches && !pairMatches(finding, other, findingsOf)) continue;
          const created = await createServiceLink(finding.serviceId, other.serviceId, reason, finding.value, now);
          if (created) reasonCount += 1;
        }
      }
    }
    result.reasons[reason] = reasonCount;
    result.candidatesCreated += reasonCount;
  }

  // SHARED_TLS_SAN, second form. The scanner drops a service's own domain
  // from its SANs, so one certificate covering a.example (service X) and
  // b.example (service Y) records b.example on X and a.example on Y: equal
  // values never meet. A SAN that IS another tracked service's registrable
  // domain links the two, in both directions (X's SAN names Y's domain, or
  // an earlier scan of Y recorded a SAN naming X's domain).
  const byDomain = await serviceIdsByDomain();
  let sanDomainCount = 0;
  for (const serviceId of scannedServiceIds) {
    for (const finding of findingsOf(serviceId)) {
      if (!finding.active || !isSanFinding(finding)) continue;
      for (const otherId of byDomain.get(finding.value) ?? []) {
        if (otherId === serviceId) continue;
        if (await createServiceLink(serviceId, otherId, "SHARED_TLS_SAN", finding.value, now)) sanDomainCount += 1;
      }
    }
    for (const [domain, owners] of byDomain) {
      if (!owners.has(serviceId)) continue;
      for (const other of await findActiveFindingsByValue(domain, "TLS_ISSUER")) {
        if (other.serviceId === serviceId || !isSanFinding(other)) continue;
        if (await createServiceLink(serviceId, other.serviceId, "SHARED_TLS_SAN", domain, now)) sanDomainCount += 1;
      }
    }
  }
  result.reasons.SHARED_TLS_SAN = (result.reasons.SHARED_TLS_SAN ?? 0) + sanDomainCount;
  result.candidatesCreated += sanDomainCount;
  return result;
}
