/**
 * Fields a re-seed may write to a platform that already exists.
 *
 * Contact fields (grievance email, form URL, API endpoint) and the
 * verification flags are deliberately absent: after the first seed they belong
 * to the admin console, where a human edits them and a second admin verifies
 * them. A re-seed must never re-mark a contact verified or overwrite an
 * admin-edited one. Only a new row takes the seed's contact values.
 */
export type PlatformSeedLike = {
  domainPatterns: readonly string[];
  tier: unknown;
  noticeBasis: unknown;
  grievanceEmail: string | null;
  formUrl: string | null;
  apiEndpoint: string | null;
  lastContactVerifiedByHuman: boolean;
  lastContactVerifiedAt?: Date;
};

export function platformSeedUpdateData<T extends PlatformSeedLike>(platform: T) {
  return {
    domainPatterns: [...platform.domainPatterns],
    tier: platform.tier as T["tier"],
    noticeBasis: platform.noticeBasis as T["noticeBasis"],
  };
}

export function platformSeedCreateData<T extends PlatformSeedLike>(platform: T) {
  return {
    ...platformSeedUpdateData(platform),
    grievanceEmail: platform.grievanceEmail,
    formUrl: platform.formUrl,
    apiEndpoint: platform.apiEndpoint,
    lastContactVerifiedByHuman: platform.lastContactVerifiedByHuman,
    lastContactVerifiedAt: platform.lastContactVerifiedAt ?? null,
  };
}
