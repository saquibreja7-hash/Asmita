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
  {
    id: "instagram",
    name: "Instagram / Meta",
    domainPatterns: ["instagram.com", "www.instagram.com"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
  },
  {
    id: "facebook",
    name: "Facebook / Meta",
    domainPatterns: ["facebook.com", "www.facebook.com", "m.facebook.com"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
  },
  {
    id: "youtube",
    name: "YouTube",
    domainPatterns: ["youtube.com", "www.youtube.com", "youtu.be"],
    tier: "TIER_1",
    noticeBasis: "IT_RULES_2021",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
  },
  {
    id: "pornhub",
    name: "Pornhub",
    domainPatterns: ["pornhub.com", "www.pornhub.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
  },
  {
    id: "xvideos",
    name: "xVideos",
    domainPatterns: ["xvideos.com", "www.xvideos.com"],
    tier: "TIER_2",
    noticeBasis: "DMCA",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
  },
  {
    id: "telegram",
    name: "Telegram",
    domainPatterns: ["t.me", "telegram.me", "telegram.org"],
    tier: "TIER_3",
    noticeBasis: "FORM_ONLY",
    grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
    formUrl: HUMAN_VERIFICATION_REQUIRED,
    lastContactVerifiedByHuman: false,
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
