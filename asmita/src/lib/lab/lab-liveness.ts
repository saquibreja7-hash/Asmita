import { writeAuditLog } from "@/lib/audit";
import { listLabServices, recordLabLiveness } from "@/lib/lab/lab-services";
import type { LabUrlStatus } from "@/lib/lab/lab-store";

/*
 * E2 (docs/lab/charter.md): the daily liveness check. For every tracked
 * service URL it sends one HEAD request — no cookies, no body read — and
 * marks the URL up (the server answered with anything below 500) or down
 * (no answer, timeout or server error). A service is up if any of its URLs
 * answered, down if none did; downSince records the first fully-down day.
 *
 * Lab code may fetch (the lint rule does not apply here), but each request
 * is time-boxed and the run is capped, so the daily cron cannot run away.
 * Private and loopback addresses are never fetched.
 */

const PER_URL_TIMEOUT_MS = 8_000;
const MAX_SERVICES_PER_RUN = 200;
const MAX_URLS_PER_RUN = 1_000;

const USER_AGENT = "AsmitaLab/1.0 (research; abuse-reporting liveness check)";

export type LivenessRunResult = {
  servicesChecked: number;
  urlsChecked: number;
  urlsUp: number;
  urlsDown: number;
  servicesSkipped: number;
};

export type LivenessDeps = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  maxServices?: number;
};

/** Literal-address and localhost guard: the liveness check only ever fetches public hosts. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

/** One HEAD request, time-boxed; up means the server answered below 500. */
async function checkOneUrl(rawUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  if (isPrivateHost(new URL(rawUrl).hostname)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_URL_TIMEOUT_MS);
  try {
    const response = await fetchImpl(rawUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    // The body, if any, is deliberately never read.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one liveness pass over every tracked service (up to the caps) and
 * writes the results. The run itself audits one LAB_LIVENESS_RUN entry with
 * counts only; per-service writes are not audited separately.
 */
export async function runLabLivenessCheck(deps: LivenessDeps = {}): Promise<LivenessRunResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const services = (await listLabServices()).filter((service) => service.urls.length > 0);
  const maxServices = Math.min(deps.maxServices ?? MAX_SERVICES_PER_RUN, MAX_SERVICES_PER_RUN);
  const result: LivenessRunResult = {
    servicesChecked: 0, urlsChecked: 0, urlsUp: 0, urlsDown: 0, servicesSkipped: 0,
  };
  let urlBudget = MAX_URLS_PER_RUN;
  for (const service of services) {
    if (result.servicesChecked >= maxServices || urlBudget <= 0) {
      result.servicesSkipped += 1;
      continue;
    }
    const urls = service.urls.slice(0, urlBudget);
    urlBudget -= urls.length;
    const checkedAt = now().toISOString();
    const statuses: LabUrlStatus[] = [];
    for (const url of urls) {
      const up = await checkOneUrl(url, fetchImpl);
      statuses.push({ url, up, checkedAt });
      result.urlsChecked += 1;
      if (up) result.urlsUp += 1;
      else result.urlsDown += 1;
    }
    await recordLabLiveness(service.id, statuses, now());
    result.servicesChecked += 1;
  }
  if (result.urlsChecked > 0) {
    await writeAuditLog({
      eventType: "LAB_LIVENESS_RUN",
      entityType: "LabService",
      data: {
        servicesChecked: result.servicesChecked,
        urlsChecked: result.urlsChecked,
        urlsUp: result.urlsUp,
        urlsDown: result.urlsDown,
        servicesSkipped: result.servicesSkipped,
      },
    });
  }
  return result;
}
