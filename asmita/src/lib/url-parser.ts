import { findPlatformByDomain } from "@/lib/platforms";
import { sha256 } from "@/lib/hash";

const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const blockedSchemes = new Set(["ftp:", "file:", "javascript:", "data:"]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type ParsedSubmittedUrl =
  | {
      ok: true;
      normalizedUrl: string;
      domain: string;
      urlHash: string;
      platform: ReturnType<typeof findPlatformByDomain>;
    }
  | { ok: false; error: "invalid_url" | "blocked_scheme" | "local_or_private_address" };

export function parseSubmittedUrl(rawUrl: string): ParsedSubmittedUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (blockedSchemes.has(parsed.protocol) || !["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "blocked_scheme" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const domain = hostname.replace(/^www\./, "");
  if (blockedHosts.has(hostname) || isPrivateIpv4(hostname)) {
    return { ok: false, error: "local_or_private_address" };
  }

  parsed.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) =>
    parsed.searchParams.delete(key),
  );

  const normalizedUrl = parsed.toString();
  return {
    ok: true,
    normalizedUrl,
    domain,
    urlHash: sha256(normalizedUrl),
    platform: findPlatformByDomain(domain),
  };
}
