/*
 * In-memory partner-programme state for local development and tests without
 * a database, the partner twin of crawl-store.ts. Never used in production:
 * every partner module selects the database path whenever DATABASE_URL is
 * set, and these helpers refuse to run under NODE_ENV=production.
 *
 * Rows keep the same shape as the database tables. Encrypted columns hold
 * encryptField output, exactly like the memory path of the crawler store
 * (see tests/unit/crawler-routes.test.ts); tests seed them explicitly.
 */

export type MemoryPlatformPartner = {
  id: string;
  name: string;
  primaryDomain: string;
  extraDomains: string[];
  status: "ACTIVE" | "SUSPENDED";
  /** encryptField output; null when no channel email is set. */
  channelEmailEncrypted: string | null;
  createdFromApplicationId: string | null;
  crawlPermissionRecordedAt: Date | null;
  crawlPermissionRecordedById: string | null;
  crawlPermissionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryPlatformPartnerKey = {
  id: string;
  partnerId: string;
  /** sha256 of the bearer key. The key itself exists only at issue time. */
  keyHash: string;
  label: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

type PartnerMemory = {
  partners: Map<string, MemoryPlatformPartner>;
  keys: Map<string, MemoryPlatformPartnerKey>;
};

const globals = globalThis as typeof globalThis & { __asmitaPartnerStore?: PartnerMemory };

function emptyMemory(): PartnerMemory {
  return { partners: new Map(), keys: new Map() };
}

export function partnerMemory(): PartnerMemory {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[partner-store.ts] In-memory partner state cannot be used in production.");
  }
  globals.__asmitaPartnerStore ??= emptyMemory();
  return globals.__asmitaPartnerStore;
}

export function resetPartnerMemory() {
  globals.__asmitaPartnerStore = emptyMemory();
}
