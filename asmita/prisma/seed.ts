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
  {
    name: "Meta (Facebook / Instagram)",
    domainPatterns: ["facebook.com", "fb.com", "instagram.com", "threads.net"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: null,
    formUrl: null,
    apiEndpoint: null,
  },
  {
    name: "YouTube / Google",
    domainPatterns: ["youtube.com", "youtu.be", "google.com"],
    tier: PlatformTier.TIER_1,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: null,
    formUrl: "https://support.google.com/legal/troubleshooter/1114905",
    apiEndpoint: null,
  },
  {
    name: "X / Twitter",
    domainPatterns: ["x.com", "twitter.com"],
    tier: PlatformTier.TIER_2,
    noticeBasis: NoticeBasis.IT_RULES_2021,
    grievanceEmail: null,
    formUrl: "https://help.x.com/forms/privacy",
    apiEndpoint: null,
  },
  {
    name: "Telegram",
    domainPatterns: ["t.me", "telegram.me", "telegram.org"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.FORM_ONLY,
    grievanceEmail: null,
    formUrl: "https://telegram.org/support",
    apiEndpoint: null,
  },
  {
    name: "Pornhub / Aylo",
    domainPatterns: ["pornhub.com"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://www.pornhub.com/content-removal",
    apiEndpoint: null,
  },
  {
    name: "Bing",
    domainPatterns: ["bing.com"],
    tier: PlatformTier.TIER_3,
    noticeBasis: NoticeBasis.DMCA,
    grievanceEmail: null,
    formUrl: "https://www.microsoft.com/concern/bing",
    apiEndpoint: null,
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

    if (existing) {
      await prisma.platform.update({
        where: { id: existing.id },
        data: {
          domainPatterns: [...platform.domainPatterns],
          tier: platform.tier,
          noticeBasis: platform.noticeBasis,
          grievanceEmail: platform.grievanceEmail,
          formUrl: platform.formUrl,
          apiEndpoint: platform.apiEndpoint,
          lastContactVerifiedByHuman: false,
        },
      });
    } else {
      await prisma.platform.create({
        data: {
          ...platform,
          domainPatterns: [...platform.domainPatterns],
          lastContactVerifiedByHuman: false,
        },
      });
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
      reviewedByLegal: false,
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

  console.log("Seeded draft platforms and unreviewed notice templates.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
