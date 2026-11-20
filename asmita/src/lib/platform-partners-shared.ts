// Options for the platform partner sign-up form (/for-platforms). Shared by the
// browser form, the API schema and the admin console, so all three agree.
// No server-only imports here: the form bundles this file.

export const PLATFORM_TYPES = {
  SOCIAL: "Social media or messaging",
  VIDEO: "Video or streaming",
  DATING: "Dating",
  ADULT: "Adult content",
  HOSTING: "File, image or cloud hosting",
  FORUM: "Forum or community",
  SEARCH: "Search engine",
  INFRA: "Hosting provider, CDN or domain registrar",
  OTHER: "Something else",
} as const;

export const USER_BASES = {
  UNDER_100K: "Fewer than 1 lakh",
  LAKH_10L: "1 lakh to 10 lakh",
  TEN_LAKH_50L: "10 lakh to 50 lakh",
  OVER_50L: "More than 50 lakh",
  UNKNOWN: "Prefer not to say",
} as const;

// What a partner can sign up for. Fingerprints are only ever shared for cases
// where the survivor has agreed to it.
export const PARTNER_INTERESTS = {
  FINGERPRINT_ALERTS: "Fingerprint alerts from new cases",
  CRAWLER_MONITORING: "Monitoring of our public pages by Asmita's crawler",
  TAKEDOWN_CHANNEL: "A dedicated channel for takedown notices",
  REUPLOAD_CHECKS: "Checks that removed content stays down",
} as const;

export type PlatformType = keyof typeof PLATFORM_TYPES;
export type UserBase = keyof typeof USER_BASES;
export type PartnerInterest = keyof typeof PARTNER_INTERESTS;

export const PARTNER_STATUSES = ["NEW", "CONTACTED", "ONBOARDED", "DECLINED"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** "https://www.Example.in/path" -> "example.in"; null when it is not a plain domain. */
export function normaliseDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (value.length < 4 || value.length > 253) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return null;
  return value;
}
