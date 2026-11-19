/**
 * Network policy for every crawl fetch: which URLs may be requested and which
 * resolved addresses may be connected to.
 *
 * The production policy is built only by `productionPolicy()`. There is no
 * environment variable that loosens it. Tests that need to reach a fixture
 * server on 127.0.0.1 build their own policy object in code
 * (tests/support/test-policy.ts) and pass it in; tests/unit/policy.test.ts
 * checks that src/ never constructs a loopback allowance and that the config
 * schema has no key for one.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CrawlError } from "../errors.ts";
import { isBlockedAddress } from "./ip.ts";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type NetPolicy = {
  /** Resolve a hostname to every address it has. */
  resolve: Resolver;
  /** True when a resolved (or literal) address may be connected to. */
  isAddressAllowed: (address: string) => boolean;
  /** True when the URL port may be used. Production: 80 and 443 only. */
  isPortAllowed: (port: number, protocol: "http:" | "https:") => boolean;
};

export const systemResolver: Resolver = async (hostname) => {
  const all = await lookup(hostname, { all: true, verbatim: true });
  return all.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

export function productionPolicy(resolve: Resolver = systemResolver): NetPolicy {
  return {
    resolve,
    isAddressAllowed: (address) => !isBlockedAddress(address),
    isPortAllowed: (port, protocol) =>
      (protocol === "http:" && port === 80) || (protocol === "https:" && port === 443),
  };
}

/**
 * Parse and check a URL before any network activity. The WHATWG parser
 * canonicalises decimal, octal and hex IPv4 forms (http://2130706433/,
 * http://0177.0.0.1/, http://0x7f.1/) to dotted quads, so the address check
 * sees the real target.
 */
export function checkUrl(raw: string | URL, policy: NetPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CrawlError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new CrawlError("blocked_scheme");
  if (url.username !== "" || url.password !== "") throw new CrawlError("url_credentials");
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!policy.isPortAllowed(port, url.protocol)) throw new CrawlError("blocked_port");
  const host = bareHost(url.hostname);
  if (host === "") throw new CrawlError("invalid_url");
  if (isIP(host) !== 0 && !policy.isAddressAllowed(host)) throw new CrawlError("blocked_address");
  return url;
}

export function bareHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * Resolve and validate. Rejects when ANY address is blocked, not just the
 * first, so a hostname that mixes a public and a private record (a common
 * rebinding trick) is refused outright.
 */
export async function resolveAllowed(hostname: string, policy: NetPolicy): Promise<ResolvedAddress> {
  const host = bareHost(hostname);
  const literal = isIP(host);
  if (literal !== 0) {
    if (!policy.isAddressAllowed(host)) throw new CrawlError("blocked_address");
    return { address: host, family: literal === 6 ? 6 : 4 };
  }
  let addrs: ResolvedAddress[];
  try {
    addrs = await policy.resolve(host);
  } catch (err) {
    // WP13: a name that does not exist is permanent — never retried in this
    // run, reported `gone` so the app kills the row without five tries.
    // Any other resolver failure (timeout, temporary error) keeps the
    // retryable dns_failed.
    if (err !== null && typeof err === "object" && (err as { code?: unknown }).code === "ENOTFOUND") {
      throw new CrawlError("dns_not_found");
    }
    throw new CrawlError("dns_failed", { retryable: true });
  }
  if (addrs.length === 0) throw new CrawlError("dns_failed", { retryable: true });
  for (const a of addrs) {
    if (isIP(a.address) === 0 || !policy.isAddressAllowed(a.address)) throw new CrawlError("blocked_address");
  }
  // Prefer IPv4 for predictability; every address was already validated.
  return addrs.find((a) => a.family === 4) ?? addrs[0]!;
}
