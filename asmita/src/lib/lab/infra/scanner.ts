import { isPrivateHost } from "@/lib/lab/lab-liveness";
import { readCapped, registrableDomain } from "@/lib/lab/lab-lookup";
import { extractHeaderFindings, extractHtmlFindings, type ExtractedFinding } from "@/lib/lab/infra/extract";
import { SIGNATURE_VERSION } from "@/lib/lab/infra/signatures";
import {
  ctCertificates,
  rdapIpNetwork,
  rdapRegistrar,
  resolveIps,
  resolveMxHosts,
  resolveNsSet,
  type NetworkDeps,
} from "@/lib/lab/infra/network";

/*
 * WP114 (research-tools-spec.md): the infrastructure scanner. For every
 * tracked service URL it fetches exactly one thing — the public landing
 * page — and turns the page, its response headers, DNS, RDAP and
 * Certificate Transparency into normalised findings.
 *
 * Hard safety limits, all enforced here:
 *  - GET only, no cookies, no JavaScript, no referrer.
 *  - At most 3 redirects, and the whole chain is recorded; every hop must
 *    itself be a public http(s) host or the scan stops.
 *  - One 10 s timeout for the whole chain.
 *  - At most 1 MB of body, and the content type must be HTML or plain text.
 *  - Private, loopback and link-local hosts are never fetched (the same
 *    guard as the daily liveness check).
 *  - Images, video and other media are never requested: nothing the page
 *    references is fetched, no link is followed, no form is submitted.
 *  - The HTML is never stored; only extracted findings survive.
 *
 * User-Agent per the spec: "AsmitaLab/1.0 (+research; contact on /lab)".
 */

export const INFRA_USER_AGENT = "AsmitaLab/1.0 (+research; contact on /lab)";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1024 * 1024;

export type LandingPageResult =
  | {
      ok: true;
      finalUrl: string;
      redirectChain: string[];
      httpStatus: number;
      headers: Headers;
      html: string;
    }
  | {
      ok: false;
      finalUrl: string | null;
      redirectChain: string[];
      httpStatus: number | null;
      error: string;
    };

export type ScannerDeps = NetworkDeps & {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** The whole-chain fetch budget. 10 s per the spec; tests shorten it. */
  fetchTimeoutMs?: number;
};

/**
 * Fetches one landing page under the hard limits. Never sends cookies,
 * never executes JavaScript, never reads a media response body.
 */
export async function fetchLandingPage(rawUrl: string, deps: ScannerDeps = {}): Promise<LandingPageResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const chain: string[] = [];
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, finalUrl: null, redirectChain: [], httpStatus: null, error: "invalid_url" };
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    return { ok: false, finalUrl: null, redirectChain: [], httpStatus: null, error: "invalid_url" };
  }
  if (isPrivateHost(current.hostname)) {
    return { ok: false, finalUrl: rawUrl, redirectChain: [], httpStatus: null, error: "private_host_refused" };
  }

  const deadline = Date.now() + (deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: null, error: "timeout" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": INFRA_USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        },
      });
      if (!(response instanceof Response)) {
        clearTimeout(timer);
        return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: null, error: "fetch_failed" };
      }
    } catch {
      clearTimeout(timer);
      return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: null, error: "fetch_failed" };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      let next: URL | null = null;
      if (location) {
        try {
          next = new URL(location, current);
        } catch {
          next = null;
        }
      }
      if (!next) {
        return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: response.status, error: "invalid_redirect" };
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: response.status, error: "invalid_redirect" };
      }
      if (isPrivateHost(next.hostname)) {
        return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: response.status, error: "private_host_refused" };
      }
      if (hop === MAX_REDIRECTS) {
        return { ok: false, finalUrl: next.toString(), redirectChain: chain, httpStatus: response.status, error: "too_many_redirects" };
      }
      chain.push(next.toString());
      current = next;
      continue;
    }

    // Non-redirect: content type must be HTML or plain text before any body
    // is read, so media responses are never downloaded.
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (contentType !== "text/html" && contentType !== "text/plain" && contentType !== "application/xhtml+xml") {
      return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: response.status, error: "content_type_not_html" };
    }

    // The HTML is read capped and kept only in this call's scope; nothing
    // stores it (the scan row keeps status, findings keep evidence text).
    const html = await readCapped(response, MAX_HTML_BYTES);
    return { ok: true, finalUrl: current.toString(), redirectChain: chain, httpStatus: response.status, headers: response.headers, html };
  }
  return { ok: false, finalUrl: current.toString(), redirectChain: chain, httpStatus: null, error: "too_many_redirects" };
}

/** Categories whose findings can come from the fetched page itself. */
export const PAGE_CATEGORIES = new Set([
  "PAYMENT",
  "AUTH_SSO",
  "ANALYTICS_ID",
  "ADS",
  "CDN",
  "CRYPTO_ADDRESS",
  "TELEGRAM_LINK",
  "SOCIAL_LINK",
  "APP_STORE_LINK",
  "REFERRAL_LINK",
  "MODEL_REPO_LINK",
]);

export type ServiceScanResult = {
  scans: {
    url: string;
    finalUrl: string | null;
    httpStatus: number | null;
    error: string | null;
  }[];
  findings: ExtractedFinding[];
  checkedCategories: Set<string>;
};

/**
 * Scans every URL of one service: the landing page of each URL, then DNS,
 * RDAP and Certificate Transparency once per unique host. Never throws.
 */
export async function scanService(
  urls: string[],
  deps: ScannerDeps = {},
): Promise<ServiceScanResult> {
  const result: ServiceScanResult = { scans: [], findings: [], checkedCategories: new Set() };
  const hosts = new Set<string>();
  const registrable = new Set<string>();

  for (const url of urls) {
    const page = await fetchLandingPage(url, deps);
    result.scans.push({
      url,
      finalUrl: page.finalUrl,
      httpStatus: page.httpStatus,
      error: page.ok ? null : page.error,
    });
    if (!page.ok) continue;
    // The page's own categories were checked this run; a finding there that
    // this scan no longer sees becomes inactive (change tracking).
    for (const category of PAGE_CATEGORIES) result.checkedCategories.add(category);
    try {
      const host = new URL(page.finalUrl).hostname.toLowerCase();
      hosts.add(host);
      const domain = registrableDomain(host);
      if (domain) registrable.add(domain);
    } catch {
      // finalUrl came from a successful fetch; not expected to fail.
    }
    result.findings.push(...extractHtmlFindings(page.html));
    result.findings.push(...extractHeaderFindings(page.headers));
  }

  for (const host of hosts) {
    const ips = await resolveIps(host, deps);
    if (ips.length > 0) result.checkedCategories.add("HOSTING_ASN");
    for (const ip of ips) {
      const network = await rdapIpNetwork(ip, deps);
      const label = [network?.asn, network?.networkName].filter(Boolean).join(" ");
      result.findings.push({
        category: "HOSTING_ASN",
        value: ip,
        evidence: `A/AAAA ${host} → ${label || "no RDAP network"}`,
        confidence: "HIGH",
      });
    }

    const nsSet = await resolveNsSet(host, deps);
    if (nsSet.length > 0) {
      result.checkedCategories.add("NAMESERVER");
      result.findings.push({
        category: "NAMESERVER",
        value: nsSet.join(","),
        evidence: `NS ${nsSet.join(", ")}`,
        confidence: "HIGH",
      });
    }

    const mx = await resolveMxHosts(host, deps);
    if (mx.length > 0) {
      result.checkedCategories.add("MAIL");
      for (const exchange of mx) {
        result.findings.push({
          category: "MAIL",
          value: exchange,
          evidence: `MX ${exchange}`,
          confidence: "HIGH",
        });
      }
    }
  }

  for (const domain of registrable) {
    const registrar = await rdapRegistrar(domain, deps);
    if (registrar) {
      result.checkedCategories.add("REGISTRAR");
      result.findings.push({
        category: "REGISTRAR",
        value: registrar,
        evidence: `RDAP registrar for ${domain}`,
        confidence: "HIGH",
      });
    }
    const ct = await ctCertificates(domain, deps);
    if (ct) {
      result.checkedCategories.add("TLS_ISSUER");
      for (const issuer of ct.issuers) {
        result.findings.push({
          category: "TLS_ISSUER",
          value: issuer,
          evidence: `CT certificate issuer for ${domain}`,
          confidence: "MEDIUM",
        });
      }
      for (const san of ct.sans) {
        const sanDomain = registrableDomain(san);
        if (sanDomain && sanDomain !== domain) {
          // A SAN on this domain's certificates that is another domain: a
          // SHARED_TLS_SAN clustering candidate (cluster.ts links services
          // that share one). Issuer and SAN values share the category; SAN
          // values are always domains, issuer values never are.
          result.findings.push({
            category: "TLS_ISSUER",
            value: sanDomain,
            evidence: `CT SAN on certificates for ${domain}`,
            confidence: "MEDIUM",
          });
        }
      }
    }
  }

  return result;
}

export { SIGNATURE_VERSION };
