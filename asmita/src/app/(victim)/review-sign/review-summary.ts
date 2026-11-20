import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { checkLink, matchPlatform } from "@/lib/link-check";
import { platformDirectory } from "@/lib/platforms";

// Plain words for the review summary: a readable platform name for each link
// and a quality word for each fingerprint, instead of raw hex and percentages.

export type QualityLevel = "good" | "fair" | "low";

const GOOD_QUALITY = 70;
// Matches LOW_QUALITY_THRESHOLD in hash-submission.ts (server-only), below
// which a fingerprint is held for a person to check; a test keeps them equal.
export const FAIR_QUALITY = 50;

export function qualityLevel(quality: number): QualityLevel {
  if (quality >= GOOD_QUALITY) return "good";
  if (quality >= FAIR_QUALITY) return "fair";
  return "low";
}

export const QUALITY_KEYS: Record<QualityLevel, MessageKey> = {
  good: "review.fingerprints.quality.good",
  fair: "review.fingerprints.quality.fair",
  low: "review.fingerprints.quality.low",
};

export function linkPlatformName(url: string): string | null {
  const parsed = checkLink(url);
  return parsed.ok ? matchPlatform(parsed.domain, platformDirectory)?.name ?? null : null;
}

export function numbered(locale: Locale, key: "review.links.item" | "review.fingerprints.item" | "review.fingerprints.videoItem", index: number) {
  return t(locale, key).replace("{n}", String(index + 1));
}

/** "A, B and C" in the reader's language. */
export function joinNames(names: string[], locale: Locale): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? "";
  const and = locale === "hi" ? " और " : " and ";
  return `${unique.slice(0, -1).join(", ")}${and}${unique[unique.length - 1]}`;
}
