import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  NoticeBasis,
  PlatformTier,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { templateSeeds } from "./template-seeds";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function hashEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

const platformSeeds = [
  // ── TIER_1: Major social / search platforms ───────────────────────────
  {
    name: "Instagram / Meta",
    domainPatterns: ["instagram.com", "www.instagram.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: null,
    formUrl: "https://help.meta.com/requests/1371776380779082/",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Facebook / Meta",
    domainPatterns: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "threads.net"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: null,
    formUrl: "https://help.meta.com/requests/1371776380779082/",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "WhatsApp",
    domainPatterns: ["whatsapp.com", "www.whatsapp.com", "wa.me"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance_officer_wa@support.whatsapp.com",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "YouTube",
    domainPatterns: ["youtube.com", "www.youtube.com", "youtu.be"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "support-in@google.com",
    formUrl: "https://support.google.com/youtube/answer/10728153",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "X / Twitter",
    domainPatterns: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: null,
    formUrl: "https://help.x.com/en/forms/report-to-grievance-officer-india",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Snapchat",
    domainPatterns: ["snapchat.com", "www.snapchat.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance-officer-in@snap.com",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "LinkedIn",
    domainPatterns: ["linkedin.com", "www.linkedin.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: null,
    formUrl: "https://www.linkedin.com/help/linkedin/ask/LGO",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Microsoft / Bing",
    domainPatterns: ["bing.com", "www.bing.com", "msn.com", "www.msn.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_AND_DMCA,
    grievanceEmail: "grievanceofficer@microsoft.com",
    formUrl: "https://www.microsoft.com/concern/bing",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Google Search",
    domainPatterns: ["google.com", "www.google.com", "google.co.in", "www.google.co.in"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: "support-in@google.com",
    formUrl: "https://support.google.com/websearch/answer/16305143",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  // ── TIER_2: Adult / content platforms ────────────────────────────────
  {
    name: "Pornhub / Aylo",
    domainPatterns: ["pornhub.com", "www.pornhub.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://www.pornhub.com/content-removal",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "xVideos",
    domainPatterns: ["xvideos.com", "www.xvideos.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://www.xvideos.com/legal/takedown",
    apiEndpoint: null,
    lastContactVerifiedByHuman: false, // form URL not confirmed in research pass 2026-06-14
  },
  {
    name: "XNXX",
    domainPatterns: ["xnxx.com", "www.xnxx.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://www.xnxx.com/legal/takedown",
    apiEndpoint: null,
    lastContactVerifiedByHuman: false, // form URL not confirmed in research pass 2026-06-14
  },
  {
    name: "xHamster",
    domainPatterns: ["xhamster.com", "www.xhamster.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://xhamster.com/info/contact?subject=legal",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "OnlyFans",
    domainPatterns: ["onlyfans.com", "www.onlyfans.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: false, // no contact found in research pass 2026-06-14
  },
  // ── TIER_3: Regional / messaging platforms ────────────────────────────
  {
    name: "Telegram",
    domainPatterns: ["t.me", "telegram.me", "telegram.org"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance-in@telegram.org",
    formUrl: "https://telegram.org/support",
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "ShareChat / Moj",
    domainPatterns: ["sharechat.com", "www.sharechat.com", "moj.tv", "www.moj.tv"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance@sharechat.co",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Quora",
    domainPatterns: ["quora.com", "www.quora.com"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "rgo@quora.com",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "JioChat",
    domainPatterns: ["jiochat.com", "www.jiochat.com"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance.officer@jio.com",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
  {
    name: "Josh",
    domainPatterns: ["myjosh.in", "www.myjosh.in"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: "grievance.officer@myjosh.in",
    formUrl: null,
    apiEndpoint: null,
    lastContactVerifiedByHuman: true,
    lastContactVerifiedAt: new Date("2026-06-14"),
  },
] as const;


async function main() {
  const adminEmail = process.env.ADMIN_OTP_EMAIL;
  if (adminEmail) {
    await prisma.user.upsert({
      where: { emailHash: hashEmail(adminEmail) },
      create: {
        emailHash: hashEmail(adminEmail),
        emailEncrypted: "<SET_AFTER_ENCRYPTION_KEY_CONFIGURED>",
        emailVerified: true,
        role: UserRole.ADMIN,
        ageOver18: true,
      },
      update: { role: UserRole.ADMIN, emailVerified: true },
    });

    console.log("Seeded admin user from ADMIN_OTP_EMAIL.");
  } else {
    console.log("ADMIN_OTP_EMAIL not set; skipping admin seed.");
  }

  for (const platform of platformSeeds) {
    const existing = await prisma.platform.findFirst({
      where: { name: platform.name },
      select: { id: true },
    });

    const data = {
      domainPatterns: [...platform.domainPatterns],
      tier: platform.tier,
      noticeBasis: platform.noticeBasis,
      grievanceEmail: platform.grievanceEmail,
      formUrl: platform.formUrl,
      apiEndpoint: platform.apiEndpoint,
      lastContactVerifiedByHuman: platform.lastContactVerifiedByHuman,
      lastContactVerifiedAt: "lastContactVerifiedAt" in platform ? platform.lastContactVerifiedAt : null,
    };

    if (existing) {
      await prisma.platform.update({ where: { id: existing.id }, data });
    } else {
      await prisma.platform.create({ data: { name: platform.name, ...data } });
    }
  }

  for (const template of templateSeeds) {
    const existing = await prisma.noticeTemplate.findFirst({
      where: {
        templateType: template.templateType,
        version: 1,
        platformId: null,
      },
      select: { id: true },
    });

    const data = {
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      legalCitations: template.legalCitations,
      reviewedByLegal: process.env.NODE_ENV !== "production",
      isActive: true,
    };

    if (existing) {
      await prisma.noticeTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.noticeTemplate.create({
        data: {
          ...data,
          templateType: template.templateType,
          version: 1,
        },
      });
    }
  }

  console.log("Seeded platforms and notice templates.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
