import { findPlatformByDomain } from "@/lib/platforms";
import { sha256 } from "@/lib/hash";
import { checkLink } from "@/lib/link-check";

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
  const checked = checkLink(rawUrl);
  if (!checked.ok) return checked;
  const parsed = checked.url;
  const domain = checked.domain;

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
