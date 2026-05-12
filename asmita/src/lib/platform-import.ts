import { HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";

export type PlatformSeedRow = {
  slug: string;
  name: string;
  domainPatterns: string[];
  tier: PlatformDirectoryEntry["tier"];
  grievanceEmail?: string;
  formUrl?: string;
  apiEndpoint?: string;
  templateType: string;
  lastVerifiedAt?: string;
  verifiedBy?: string;
  sourceUrl?: string;
  staleFlag?: boolean;
};

export function validateVerifiedPlatformSeed(row: PlatformSeedRow, now = new Date()) {
  const errors: string[] = [];
  if (!row.lastVerifiedAt) errors.push("last_verified_at_required");
  if (!row.verifiedBy) errors.push("verified_by_required");
  if (!row.sourceUrl) errors.push("source_url_required");
  if (row.staleFlag) errors.push("stale_contact_blocked");
  if (row.grievanceEmail === HUMAN_VERIFICATION_REQUIRED || row.formUrl === HUMAN_VERIFICATION_REQUIRED) {
    errors.push("placeholder_contact_blocked");
  }
  if (row.lastVerifiedAt) {
    const verifiedAt = new Date(row.lastVerifiedAt);
    const expiresAt = verifiedAt.getTime() + 30 * 24 * 60 * 60_000;
    if (Number.isNaN(verifiedAt.getTime()) || expiresAt < now.getTime()) {
      errors.push("verification_expired");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function importVerifiedPlatformSeeds(rows: PlatformSeedRow[], now = new Date()) {
  return rows.map((row) => {
    const validation = validateVerifiedPlatformSeed(row, now);
    return {
      row,
      imported: validation.ok,
      errors: validation.errors,
    };
  });
}
