import type { NoticeBasis, PlatformTier } from "@prisma/client";

export type PlatformDirectoryEntry = {
  id: string;
  name: string;
  domainPatterns: string[];
  tier: PlatformTier;
  noticeBasis: NoticeBasis;
  grievanceEmail: string;
  formUrl?: string;
  apiEndpoint?: string;
  lastContactVerifiedByHuman: boolean;
  lastContactVerifiedAt?: string;
};

export const HUMAN_VERIFICATION_REQUIRED = "<TO_BE_VERIFIED_BY_HUMAN>";

export const platformDirectory: PlatformDirectoryEntry[] = [
  // ── TIER_1: Major social / search platforms ───────────────────────────
  {
    id: "instagram",
    name: "Instagram / Meta",
    domainPatterns: ["instagram.com", "www.instagram.com"],
    tier: "TIER_1",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED, // fbgoindia@support.facebook.com is for mechanism questions only; use form
    formUrl: "https://help.meta.com/requests/1371776380779082/",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "facebook",
    name: "Facebook / Meta",
    domainPatterns: ["facebook.com", "www.facebook.com", "m.facebook.com"],
    tier: "TIER_1",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: "https://help.meta.com/requests/1371776380779082/",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    domainPatterns: ["whatsapp.com", "www.whatsapp.com", "wa.me"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance_officer_wa@support.whatsapp.com",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "youtube",
    name: "YouTube",
    domainPatterns: ["youtube.com", "www.youtube.com", "youtu.be"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "support-in@google.com",
    formUrl: "https://support.google.com/youtube/answer/10728153",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "x-twitter",
    name: "X / Twitter",
    domainPatterns: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    tier: "TIER_1",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED, // X says GO cannot be contacted by email; legal process not accepted by email
    formUrl: "https://help.x.com/en/forms/report-to-grievance-officer-india",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "snapchat",
    name: "Snapchat",
    domainPatterns: ["snapchat.com", "www.snapchat.com"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance-officer-in@snap.com",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    domainPatterns: ["linkedin.com", "www.linkedin.com"],
    tier: "TIER_1",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED, // linkedin_takedown@luthra.com is for court orders / govt directions only
    formUrl: "https://www.linkedin.com/help/linkedin/ask/LGO",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "microsoft-bing",
    name: "Microsoft / Bing",
    domainPatterns: ["bing.com", "www.bing.com", "msn.com", "www.msn.com"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_AND_DMCA",
    grievanceEmail: "grievanceofficer@microsoft.com",
    formUrl: "https://www.microsoft.com/concern/bing",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "google-search",
    name: "Google Search",
    domainPatterns: ["google.com", "www.google.com", "google.co.in", "www.google.co.in"],
    tier: "TIER_1",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: "support-in@google.com",
    formUrl: "https://support.google.com/websearch/answer/16305143", // de-indexes from search results; does not remove source content
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  // ── TIER_2: Adult / content platforms ────────────────────────────────
  {
    id: "pornhub",
    name: "Pornhub / Aylo",
    domainPatterns: ["pornhub.com", "www.pornhub.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: "https://www.pornhub.com/content-removal",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "xvideos",
    name: "xVideos",
    domainPatterns: ["xvideos.com", "www.xvideos.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: "https://www.xvideos.com/legal/takedown",
    lastContactVerifiedByHuman: false, // form URL not confirmed in research pass 2026-06-14; verify manually before enabling
  },
  {
    id: "xnxx",
    name: "XNXX",
    domainPatterns: ["xnxx.com", "www.xnxx.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: "https://www.xnxx.com/legal/takedown",
    lastContactVerifiedByHuman: false, // form URL not confirmed in research pass 2026-06-14; verify manually before enabling
  },
  {
    id: "xhamster",
    name: "xHamster",
    domainPatterns: ["xhamster.com", "www.xhamster.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: "https://xhamster.com/info/contact?subject=legal",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "onlyfans",
    name: "OnlyFans",
    domainPatterns: ["onlyfans.com", "www.onlyfans.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false, // no contact found in research pass 2026-06-14
  },
  // ── TIER_3: Regional / messaging platforms ────────────────────────────
  {
    id: "telegram",
    name: "Telegram",
    domainPatterns: ["t.me", "telegram.me", "telegram.org"],
    tier: "TIER_3",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance-in@telegram.org",
    formUrl: "https://telegram.org/support",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "sharechat",
    name: "ShareChat / Moj",
    domainPatterns: ["sharechat.com", "www.sharechat.com", "moj.tv", "www.moj.tv"],
    tier: "TIER_3",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance@sharechat.co",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "quora",
    name: "Quora",
    domainPatterns: ["quora.com", "www.quora.com"],
    tier: "TIER_3",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "rgo@quora.com",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "jiochat",
    name: "JioChat",
    domainPatterns: ["jiochat.com", "www.jiochat.com"],
    tier: "TIER_3",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance.officer@jio.com",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
  {
    id: "josh",
    name: "Josh",
    domainPatterns: ["myjosh.in", "www.myjosh.in"],
    tier: "TIER_3",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: "grievance.officer@myjosh.in",
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: "2026-06-14",
  },
];

export function findPlatformByDomain(domain: string) {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return (
    platformDirectory.find((platform) =>
      platform.domainPatterns.some((pattern) => {
        const cleanPattern = pattern.replace(/^\*\./, "").replace(/^www\./, "");
        return normalized === cleanPattern || normalized.endsWith(`.${cleanPattern}`);
      }),
    ) ?? null
  );
}
