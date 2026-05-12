import { createHash } from "node:crypto";
import {
  NoticeBasis,
  PlatformTier,
  PrismaClient,
  TemplateType,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

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

const templateSeeds = [
  {
    templateType: TemplateType.IT_RULES_2021,
    subjectTemplate: "Urgent NCII takedown request - Case {{caseReference}}",
    bodyTemplate: [
      "Dear {{platformName}} Grievance Officer,",
      "",
      "Asmita is assisting an adult user who has declared that the submitted URL contains non-consensual intimate imagery involving them.",
      "",
      "Case reference: {{caseReference}}",
      "Submitted URL token: {{url}}",
      "Declaration reference: {{declarationReference}}",
      "",
      "We request urgent review and removal under applicable Indian law, including the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.",
      "",
      "This draft template must be reviewed by legal counsel before production use.",
    ].join("\n"),
    legalCitations: ["IT Rules 2021 Rule 3(2)(b)"],
  },
  {
    templateType: TemplateType.DMCA,
    subjectTemplate: "DMCA / NCII removal request - Case {{caseReference}}",
    bodyTemplate: [
      "Dear {{platformName}} Legal / Trust and Safety Team,",
      "",
      "Asmita is assisting an adult user with a non-consensual intimate imagery takedown request.",
      "",
      "Case reference: {{caseReference}}",
      "Submitted URL token: {{url}}",
      "",
      "Please review this URL through your abuse, privacy, or copyright removal process. This draft template must be reviewed by legal counsel before production use.",
    ].join("\n"),
    legalCitations: ["DMCA Section 512", "Indian IT Rules 2021"],
  },
  {
    templateType: TemplateType.IT_RULES_AND_DMCA,
    subjectTemplate: "NCII removal and escalation request - Case {{caseReference}}",
    bodyTemplate: [
      "Dear {{platformName}} Grievance Officer / Legal Team,",
      "",
      "Asmita is assisting an adult user with a non-consensual intimate imagery report.",
      "",
      "Case reference: {{caseReference}}",
      "Submitted URL token: {{url}}",
      "",
      "Please process this request under the applicable NCII, privacy, abuse, IT Rules, and DMCA channels available for your service.",
      "",
      "This draft template must be reviewed by legal counsel before production use.",
    ].join("\n"),
    legalCitations: ["IT Rules 2021 Rule 3(2)(b)", "DMCA Section 512"],
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
