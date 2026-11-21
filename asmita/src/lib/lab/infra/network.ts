import { getDomain } from "tldts";

/*
 * WP114 (research-tools-spec.md): the network lookups behind the
 * infrastructure scanner — A/AAAA/NS/MX over DNS, the ASN and network name
 * of a resolved IP through RDAP (IANA bootstrap files, cached), the
 * registrar through domain RDAP, and certificate issuer + SANs through
 * Certificate Transparency (crt.sh JSON).
 *
 * Lab code may fetch (charter), but every request is time-boxed, its
 * response size capped, and its result best-effort: a lookup that fails or
 * times out contributes no finding and never throws. All inputs come from
 * URLs the analyst entered; nothing here is reached from the complaint
 * workflow. The IANA bootstrap and crt.sh are public registries, not the
 * services being tracked.
 */

const BOOTSTRAP_DNS_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_IPV4_URL = "https://data.iana.org/rdap/ipv4.json";
const BOOTSTRAP_IPV6_URL = "https://data.iana.org/rdap/ipv6.json";

const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1_000;
const RDAP_TIMEOUT_MS = 10_000;
const RDAP_MAX_BYTES = 256 * 1024;
const DNS_TIMEOUT_MS = 5_000;
const CT_URL = "https://crt.sh/";
const CT_TIMEOUT_MS = 10_000;
const CT_MAX_BYTES = 1024 * 1024;
const CT_MAX_ENTRIES = 200;

export type NetworkDeps = {
  fetchImpl?: typeof fetch;
  resolve4?: (host: string) => Promise<string[]>;
  resolve6?: (host: string) => Promise<string[]>;
  resolveNs?: (host: string) => Promise<string[]>;
  resolveMx?: (host: string) => Promise<{ exchange: string; priority: number }[]>;
  now?: () => number;
};

/* ---- DNS ---- */

async function defaultResolve<T>(host: string, method: string): Promise<T[]> {
  try {
    const dns = await import("node:dns/promises");
    const resolver = dns as unknown as Record<string, ((h: string) => Promise<T[]>) | undefined>;
    const fn = resolver[method];
    if (!fn) return [];
    return await Promise.race([
      fn(host),
      new Promise<T[]>((resolve) => setTimeout(() => resolve([]), DNS_TIMEOUT_MS)),
    ]);
  } catch {
    // node:dns is unavailable or blocked (e.g. some Worker runtimes); no
    // network findings, never an error.
    return [];
  }
}

/** A and AAAA records, best effort. */
export async function resolveIps(host: string, deps: NetworkDeps = {}): Promise<string[]> {
  const resolve4 = deps.resolve4 ?? ((h: string) => defaultResolve<string>(h, "resolve4"));
  const resolve6 = deps.resolve6 ?? ((h: string) => defaultResolve<string>(h, "resolve6"));
  const [v4, v6] = await Promise.all([resolve4(host).catch(() => []), resolve6(host).catch(() => [])]);
  return [...new Set([...v4, ...v6])];
}

/** The name-server set of the registrable domain, sorted and lowercased. */
export async function resolveNsSet(host: string, deps: NetworkDeps = {}): Promise<string[]> {
  const resolveNs = deps.resolveNs ?? ((h: string) => defaultResolve<string>(h, "resolveNs"));
  const target = getDomain(host) ?? host;
  const servers = await resolveNs(target).catch(() => []);
  return [...new Set(servers.map((s) => s.toLowerCase().replace(/\.$/, "")))].sort();
}

/** MX exchange hosts of the registrable domain. */
export async function resolveMxHosts(host: string, deps: NetworkDeps = {}): Promise<string[]> {
  const resolveMx =
    deps.resolveMx ?? ((h: string) => defaultResolve<{ exchange: string; priority: number }>(h, "resolveMx"));
  const target = getDomain(host) ?? host;
  const records = await resolveMx(target).catch(() => []);
  return [...new Set(records.map((r) => r.exchange.toLowerCase().replace(/\.$/, "")))].sort();
}

/* ---- fetch helper: time-boxed, size-capped, JSON or null ---- */

async function fetchJson(url: string, timeoutMs: number, maxBytes: number, fetchImpl: typeof fetch): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const text = await readCapped(response, maxBytes);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, cap: number): Promise<string> {
  if (!response.body) return await response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= cap) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const merged = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, merged.byteLength - offset);
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder().decode(merged);
}

/* ---- IANA RDAP bootstrap (RFC 8517), cached ---- */

type BootstrapCache = { fetchedAt: number; services: [string[], string[]][] };

const bootstrapCache = new Map<string, BootstrapCache>();
const globals = globalThis as typeof globalThis & { __asmitaRdapBootstrap?: Map<string, BootstrapCache> };
globals.__asmitaRdapBootstrap ??= bootstrapCache;

async function loadBootstrap(url: string, deps: NetworkDeps): Promise<[string[], string[]][] | null> {
  const now = deps.now ?? Date.now;
  const cached = bootstrapCache.get(url);
  if (cached && now() - cached.fetchedAt < BOOTSTRAP_TTL_MS) return cached.services;
  const json = await fetchJson(url, RDAP_TIMEOUT_MS, RDAP_MAX_BYTES, deps.fetchImpl ?? fetch);
  if (!json || typeof json !== "object") return cached ? cached.services : null;
  const services = (json as { services?: unknown }).services;
  if (!Array.isArray(services)) return cached ? cached.services : null;
  const parsed: [string[], string[]][] = [];
  for (const service of services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const [entries, urls] = service as [unknown, unknown];
    if (!Array.isArray(entries) || !Array.isArray(urls)) continue;
    const entryList = entries.filter((e): e is string => typeof e === "string");
    const urlList = urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
    if (entryList.length > 0 && urlList.length > 0) parsed.push([entryList, urlList]);
  }
  bootstrapCache.set(url, { fetchedAt: now(), services: parsed });
  return parsed;
}

function resetRdapBootstrapForTests() {
  bootstrapCache.clear();
}

/** The rightmost labels of a domain, for bootstrap entry matching. */
function tldOf(domain: string): string {
  return domain.split(".").pop()!.toLowerCase();
}

/** RDAP base URL for a domain, from the IANA bootstrap (dns.json). */
async function rdapBaseForDomain(domain: string, deps: NetworkDeps): Promise<string | null> {
  const services = await loadBootstrap(BOOTSTRAP_DNS_URL, deps);
  if (!services) return null;
  const tld = tldOf(domain);
  for (const [entries, urls] of services) {
    if (entries.some((entry) => entry.toLowerCase() === tld)) {
      const https = urls.find((url) => url.startsWith("https://")) ?? urls[0]!;
      return https.replace(/\/$/, "");
    }
  }
  return null;
}

/* ---- IP → RDAP base (ipv4.json / ipv6.json) ---- */

/** Parses "a.b.c.d" into one 32-bit word; IPv6 into four 32-bit words. */
export function parseIp(ip: string): number[] | null {
  if (ip.includes(":")) return parseIpv6(ip);
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const words: number[] = [];
  for (let i = 0; i < 4; i += 2) {
    const high = Number(parts[i]);
    const low = Number(parts[i + 1]);
    if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || low < 0 || high > 255 || low > 255) return null;
    words.push((high << 8) | low);
  }
  return words;
}

function parseIpv6(ip: string): number[] | null {
  const trimmed = ip.replace(/^\[|\]$/g, "");
  const [head, tail] = trimmed.split("::");
  const headGroups = head ? head.split(":").filter(Boolean) : [];
  const tailGroups = tail !== undefined ? (tail ? tail.split(":").filter(Boolean) : []) : null;
  let groups: string[];
  if (tailGroups === null) {
    groups = headGroups;
    if (groups.length !== 8) return null;
  } else {
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  }
  if (groups.length !== 8) return null;
  const words: number[] = [];
  for (let i = 0; i < 8; i += 2) {
    const high = parseInt(groups[i]!, 16);
    const low = parseInt(groups[i + 1]!, 16);
    if (Number.isNaN(high) || Number.isNaN(low)) return null;
    words.push((high << 16) | low);
  }
  return words;
}

/** Whether the parsed IP is within a bootstrap CIDR entry like "196.0.0.0/8". */
function ipInEntry(words: number[], entry: string): boolean {
  const [base, prefixText] = entry.split("/");
  const baseWords = parseIp(base!);
  if (!baseWords) return false;
  const totalBits = words.length === 2 ? 32 : 128;
  const prefix = prefixText === undefined ? totalBits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) return false;
  for (let i = 0; i < words.length; i++) {
    const bitStart = i * 32;
    if (prefix <= bitStart) return true; // this and later words fully outside the prefix
    const wordPrefix = Math.min(32, prefix - bitStart);
    const mask = wordPrefix === 32 ? 0xffffffff : (0xffffffff << (32 - wordPrefix)) >>> 0;
    if ((words[i]! & mask) !== (baseWords[i]! & mask)) return false;
  }
  return true;
}

async function rdapBaseForIp(ip: string, deps: NetworkDeps): Promise<string | null> {
  const words = parseIp(ip);
  if (!words) return null;
  const url = words.length === 2 ? BOOTSTRAP_IPV4_URL : BOOTSTRAP_IPV6_URL;
  const services = await loadBootstrap(url, deps);
  if (!services) return null;
  for (const [entries, urls] of services) {
    if (entries.some((entry) => ipInEntry(words, entry))) {
      const https = urls.find((u) => u.startsWith("https://")) ?? urls[0]!;
      return https.replace(/\/$/, "");
    }
  }
  return null;
}

/* ---- registrar via domain RDAP ---- */

type RdapEntity = { roles?: unknown; vcardArray?: unknown; entities?: RdapEntity[] };

function vcardName(vcardArray: unknown): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2 || !Array.isArray(vcardArray[1])) return null;
  for (const field of vcardArray[1]) {
    if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string" && field[3] !== "") return field[3];
  }
  return null;
}

/** The registrar's display name from an RDAP response, through nested entities. */
export function extractRegistrar(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const entity = node as RdapEntity;
  const roles = Array.isArray(entity.roles) ? entity.roles : [];
  if (roles.includes("registrar")) {
    const name = vcardName(entity.vcardArray);
    if (name) return name;
  }
  for (const child of Array.isArray(entity.entities) ? entity.entities : []) {
    const found = extractRegistrar(child);
    if (found) return found;
  }
  return null;
}

/** The registrar of a registrable domain, via the IANA RDAP bootstrap. */
export async function rdapRegistrar(rawDomain: string, deps: NetworkDeps = {}): Promise<string | null> {
  const domain = getDomain(rawDomain) ?? rawDomain;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const candidates = domain !== rawDomain ? [rawDomain, domain] : [domain];
  // LAB_RDAP_BASE_URL stays as an operator override for the IANA bootstrap:
  // one endpoint for every registry, used before the per-TLD lookup.
  const override = process.env.LAB_RDAP_BASE_URL;
  if (override) {
    for (const candidate of candidates) {
      const json = await fetchJson(`${override.replace(/\/$/, "")}/domain/${encodeURIComponent(candidate)}`, RDAP_TIMEOUT_MS, RDAP_MAX_BYTES, fetchImpl);
      const registrar = json ? extractRegistrar(json) : null;
      if (registrar) return registrar;
    }
    return null;
  }
  for (const candidate of candidates) {
    const base = await rdapBaseForDomain(candidate, deps);
    if (!base) continue;
    const json = await fetchJson(`${base}/domain/${encodeURIComponent(candidate)}`, RDAP_TIMEOUT_MS, RDAP_MAX_BYTES, fetchImpl);
    const registrar = json ? extractRegistrar(json) : null;
    if (registrar) return registrar;
  }
  return null;
}

/* ---- ASN and network name via RDAP IP lookup ---- */

export type IpNetwork = { asn: string | null; networkName: string | null };

function findAsn(node: unknown): string | null {
  // RDAP has no standard origin-AS field; RIRs mention it in remarks or
  // descriptions, so search strings for an AS<number> token.
  const seen = new Set<unknown>();
  const walk = (value: unknown): string | null => {
    if (value === null || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          const match = /\bAS\d+\b/.exec(item);
          if (match) return match[0];
          continue;
        }
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "name" && typeof child === "string") continue;
      if (typeof child === "string") {
        const match = /\bAS\d+\b/.exec(child);
        if (match) return match[0];
        continue;
      }
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(node);
}

/** The network name and, where the registry publishes it, the origin AS. */
export async function rdapIpNetwork(ip: string, deps: NetworkDeps = {}): Promise<IpNetwork | null> {
  const base = await rdapBaseForIp(ip, deps);
  if (!base) return null;
  const json = await fetchJson(`${base}/ip/${encodeURIComponent(ip)}`, RDAP_TIMEOUT_MS, RDAP_MAX_BYTES, deps.fetchImpl ?? fetch);
  if (!json || typeof json !== "object") return null;
  const name = (json as { name?: unknown }).name;
  const networkName = typeof name === "string" && name !== "" ? name : null;
  const asn = findAsn(json);
  if (!networkName && !asn) return null;
  return { asn, networkName };
}

/* ---- Certificate Transparency via crt.sh ---- */

export type CtCertificates = { issuers: string[]; sans: string[] };

type CtRow = { issuer_name?: unknown; name_value?: unknown };

/** The common name out of an issuer_name like "CN=Let's Encrypt Authority X3". */
function issuerCommonName(issuerName: string): string | null {
  const match = /(?:^|,\s*)CN=([^,]+)/i.exec(issuerName);
  return match?.[1]?.trim() ?? null;
}

/**
 * Certificate Transparency for a registrable domain: unique issuers and the
 * SANs that appear on certificates for it, capped at 200 entries (10 s
 * timeout, 1 MB body cap). crt.sh is a public log search run by Sectigo.
 */
export async function ctCertificates(rawDomain: string, deps: NetworkDeps = {}): Promise<CtCertificates | null> {
  const domain = getDomain(rawDomain) ?? rawDomain;
  const url = `${CT_URL}?q=${encodeURIComponent(domain)}&output=json`;
  const json = await fetchJson(url, CT_TIMEOUT_MS, CT_MAX_BYTES, deps.fetchImpl ?? fetch);
  if (!Array.isArray(json)) return null;
  const rows = (json as CtRow[]).slice(0, CT_MAX_ENTRIES);
  const issuers = new Set<string>();
  const sans = new Set<string>();
  for (const row of rows) {
    if (typeof row.issuer_name === "string") {
      const commonName = issuerCommonName(row.issuer_name);
      if (commonName) issuers.add(commonName);
    }
    if (typeof row.name_value === "string") {
      for (const name of row.name_value.split("\n")) {
        const clean = name.trim().toLowerCase().replace(/^\*\./, "");
        if (clean) sans.add(clean);
      }
    }
  }
  if (issuers.size === 0 && sans.size === 0) return null;
  return { issuers: [...issuers].sort(), sans: [...sans].sort() };
}

export const infraTestHelpers = { resetRdapBootstrapForTests };
