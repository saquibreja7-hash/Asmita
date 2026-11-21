import { z } from "zod";

/*
 * E2 helper (docs/lab/charter.md): a domain lookup (DNS plus RDAP) that
 * suggests the host and registrar behind a service URL, to help the analyst
 * pick the right chokepoint. Lab code may fetch; this module is the lab
 * path, so the no-URL-fetch lint rule does not apply — but every request is
 * still time-boxed and its response size capped.
 *
 * RDAP: the base URL is operator configuration (LAB_RDAP_BASE_URL), not a
 * constant in this public repo. Unset, the lookup still suggests the host
 * from the URL and the name servers from DNS; the registrar appears once
 * the owner configures an RDAP endpoint (for example a registry's or the
 * IANA bootstrap's).
 */

const RDAP_TIMEOUT_MS = 5_000;
const RDAP_MAX_BYTES = 64 * 1024;
const DNS_TIMEOUT_MS = 3_000;

export const labLookupInputSchema = z
  .object({ url: z.string().trim().min(1).max(2000) })
  .strict();

export type LabLookupResult =
  | { ok: true; host: string; nameServers: string[]; registrar: string | null; rdapChecked: boolean }
  | { ok: false; error: "invalid_url" };

export type LabLookupDeps = {
  fetchImpl?: typeof fetch;
  resolveNs?: (host: string) => Promise<string[]>;
};

/** Whether an RDAP base is configured, for the console's hint text. */
export function rdapConfigured() {
  return typeof process.env.LAB_RDAP_BASE_URL === "string" && process.env.LAB_RDAP_BASE_URL !== "";
}

function parsePublicHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function defaultResolveNs(host: string): Promise<string[]> {
  try {
    const dns = await import("node:dns/promises");
    return await Promise.race([
      dns.resolveNs(host),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), DNS_TIMEOUT_MS)),
    ]);
  } catch {
    return [];
  }
}

/** Reads at most `cap` bytes of a response body, then cancels the stream. */
async function readCapped(response: Response, cap: number): Promise<string> {
  if (!response.body) return "";
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

/** One RDAP query, time-boxed and size-capped. Returns null on any failure. */
async function rdapLookup(base: string, domain: string, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const text = await readCapped(response, RDAP_MAX_BYTES);
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

type RdapEntity = {
  roles?: unknown;
  vcardArray?: unknown;
  entities?: RdapEntity[];
};

/** Finds the registrar's name in an RDAP response, through nested entities. */
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

function vcardName(vcardArray: unknown): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2 || !Array.isArray(vcardArray[1])) return null;
  for (const field of vcardArray[1]) {
    if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string" && field[3] !== "") {
      return field[3];
    }
  }
  return null;
}

/** The registrable-domain guess for a host: its last two labels. */
function registrableGuess(host: string): string | null {
  const labels = host.split(".");
  if (labels.length < 2) return null;
  return labels.slice(-2).join(".");
}

/**
 * Suggests the host, name servers and registrar for a service URL. DNS and
 * RDAP are best effort: a lookup that fails or times out just returns what
 * it has. Never throws.
 */
export async function lookupServiceUrl(rawUrl: string, deps: LabLookupDeps = {}): Promise<LabLookupResult> {
  const parsed = parsePublicHttpUrl(rawUrl);
  if (!parsed) return { ok: false, error: "invalid_url" };
  const host = parsed.hostname.toLowerCase();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveNs = deps.resolveNs ?? defaultResolveNs;

  const nameServers = await resolveNs(host).catch(() => []);

  let registrar: string | null = null;
  let rdapChecked = false;
  const base = process.env.LAB_RDAP_BASE_URL;
  if (base) {
    rdapChecked = true;
    const candidates = host.includes(".") && registrableGuess(host) !== host
      ? [host, registrableGuess(host)!]
      : [host];
    for (const candidate of candidates) {
      const rdap = await rdapLookup(base, candidate, fetchImpl);
      if (rdap) {
        registrar = extractRegistrar(rdap);
        if (registrar) break;
      }
    }
  }

  return { ok: true, host, nameServers, registrar, rdapChecked };
}
