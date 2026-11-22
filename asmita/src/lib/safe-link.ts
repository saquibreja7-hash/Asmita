import { z } from "zod";

/**
 * Links an admin types into org content (post attachments and calls to
 * action, event registration, partner sites) are rendered as hrefs on public
 * pages. Only two shapes are allowed: an absolute http(s) URL, or a path on
 * this site that starts with a single "/". That refuses javascript:, data:
 * and other schemes, and protocol-relative "//host" (or "/\host", which
 * browsers read the same way).
 */
export function isSafeLink(value: string): boolean {
  if (/[\s\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Zod string for one such link, trimmed and length-capped. */
export function safeLink(max: number, message = "link_scheme") {
  return z.string().trim().min(1).max(max).refine(isSafeLink, { message });
}
