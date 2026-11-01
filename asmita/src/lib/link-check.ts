/*
 * The one definition of a link Asmita accepts. Pure, with no server-only
 * imports, so the submit form checks each line in the browser with exactly
 * the rules /api/cases/create applies, and nothing is sent to check it.
 */

export type LinkCheckError = "invalid_url" | "blocked_scheme" | "local_or_private_address";
export type LinkCheck = { ok: true; url: URL; domain: string } | { ok: false; error: LinkCheckError };
export type PlatformPattern = { name: string; domainPatterns: string[] };

const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

// Loopback, private, link-local and carrier-grade NAT ranges. IPv6 literals
// are refused outright: a real post is never addressed that way.
function isPrivateAddress(hostname: string) {
  if (hostname.startsWith("[")) return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// People paste "instagram.com/p/abc" as often as the full link; anything with
// a dot and no spaces is treated as a web address.
function withScheme(raw: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return /^[^\s/]+\.[^\s/]+/.test(raw) && !/\s/.test(raw) ? `https://${raw}` : raw;
}

export function checkLink(raw: string): LinkCheck {
  let url: URL;
  try {
    url = new URL(withScheme(raw.trim()));
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false, error: "blocked_scheme" };
  const hostname = url.hostname.toLowerCase();
  if (blockedHosts.has(hostname) || isPrivateAddress(hostname)) return { ok: false, error: "local_or_private_address" };
  if (!hostname.includes(".")) return { ok: false, error: "invalid_url" };
  return { ok: true, url, domain: hostname.replace(/^www\./, "") };
}

export function matchPlatform<T extends PlatformPattern>(domain: string, platforms: readonly T[]): T | null {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return (
    platforms.find((platform) =>
      platform.domainPatterns.some((pattern) => {
        const clean = pattern.replace(/^\*\./, "").replace(/^www\./, "");
        return normalized === clean || normalized.endsWith(`.${clean}`);
      }),
    ) ?? null
  );
}
