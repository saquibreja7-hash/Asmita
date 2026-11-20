import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/encryption";
import type { PartnerInterest, PartnerStatus, PlatformType, UserBase } from "@/lib/platform-partners-shared";

// Partner programme sign-ups from /for-platforms. These are business contacts
// at platforms, never survivors, but they are still personal data: name,
// email, phone and the free-text message are encrypted at rest.

export type PartnerApplicationInput = {
  organisationName: string;
  platformName: string;
  websiteDomain: string;
  platformType: PlatformType;
  userBase: UserBase;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone?: string;
  interests: PartnerInterest[];
  message?: string;
};

export type PartnerApplication = PartnerApplicationInput & {
  id: string;
  status: PartnerStatus;
  createdAt: string;
};

// Local development and tests without a database keep sign-ups here, capped.
export const partnerApplications: PartnerApplication[] = [];
export const MAX_MEMORY_APPLICATIONS = 200;

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export async function recordPartnerApplication(input: PartnerApplicationInput): Promise<{ id: string }> {
  if (devNoDb()) {
    const record: PartnerApplication = {
      ...input,
      id: crypto.randomUUID(),
      status: "NEW",
      createdAt: new Date().toISOString(),
    };
    partnerApplications.push(record);
    if (partnerApplications.length > MAX_MEMORY_APPLICATIONS) {
      partnerApplications.splice(0, partnerApplications.length - MAX_MEMORY_APPLICATIONS);
    }
    return { id: record.id };
  }
  const saved = await db.platformPartnerApplication.create({
    data: {
      organisationName: input.organisationName,
      platformName: input.platformName,
      websiteDomain: input.websiteDomain,
      platformType: input.platformType,
      userBase: input.userBase,
      contactName: encryptField(input.contactName),
      contactRole: input.contactRole,
      contactEmail: encryptField(input.contactEmail),
      contactPhone: input.contactPhone ? encryptField(input.contactPhone) : null,
      interests: input.interests,
      message: input.message ? encryptField(input.message) : null,
    },
    select: { id: true },
  });
  return { id: saved.id };
}

/** Every sign-up, newest first, decrypted for the admin console. */
export async function listPartnerApplications(limit = 200): Promise<PartnerApplication[]> {
  if (devNoDb()) return [...partnerApplications].reverse().slice(0, limit);
  const rows = await db.platformPartnerApplication.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  const open = (value: string | null) => {
    if (!value) return undefined;
    try {
      return decryptField(value);
    } catch {
      return "[could not decrypt]";
    }
  };
  return rows.map((row) => ({
    id: row.id,
    organisationName: row.organisationName,
    platformName: row.platformName,
    websiteDomain: row.websiteDomain,
    platformType: row.platformType as PlatformType,
    userBase: row.userBase as UserBase,
    contactName: open(row.contactName) ?? "",
    contactRole: row.contactRole,
    contactEmail: open(row.contactEmail) ?? "",
    contactPhone: open(row.contactPhone),
    interests: row.interests as PartnerInterest[],
    message: open(row.message),
    status: row.status as PartnerStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}
