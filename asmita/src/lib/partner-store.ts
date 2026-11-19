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

export type MemoryPartnerShareConsent = {
  id: string;
  caseId: string;
  /** The fingerprints the case page listed when she ticked. */
  hashSubmissionIds: string[];
  templateId: string;
  templateDigest: string;
  agreedAt: Date;
  withdrawnAt: Date | null;
};

/** WP32: the memory twin of PartnerFeedEvent (the partner feed's event log). */
export type MemoryPartnerFeedEvent = {
  id: string;
  seq: number;
  fingerprintId: string;
  type: "ADD" | "WITHDRAW";
  kind: "image" | "video";
  caseId: string | null;
  caseRef: string | null;
  createdAt: Date;
};

/** WP32: the memory twin of PartnerOutcome (what a partner reported it did). */
export type MemoryPartnerOutcome = {
  id: string;
  partnerId: string;
  fingerprintId: string | null;
  /** encryptField output; the URL only ever sits on the partner's own domains. */
  urlEncrypted: string | null;
  urlHash: string | null;
  submittedUrlId: string | null;
  caseId: string | null;
  outcome: "REMOVED" | "BLOCKED_REUPLOAD" | "NOT_FOUND" | "NOT_OUR_CONTENT";
  note: string | null;
  createdAt: Date;
};

type PartnerMemory = {
  partners: Map<string, MemoryPlatformPartner>;
  keys: Map<string, MemoryPlatformPartnerKey>;
  /** WP31: the survivor's partner-sharing agreements, the twin of PartnerShareConsent. */
  shareConsents: MemoryPartnerShareConsent[];
  /** WP32: the feed's event log, ordered by seq; the next seq hands out the counter. */
  feedEvents: MemoryPartnerFeedEvent[];
  nextFeedSeq: number;
  /** WP32: partner-reported outcomes, the twin of PartnerOutcome. */
  outcomes: MemoryPartnerOutcome[];
};

const globals = globalThis as typeof globalThis & { __asmitaPartnerStore?: PartnerMemory };

function emptyMemory(): PartnerMemory {
  return { partners: new Map(), keys: new Map(), shareConsents: [], feedEvents: [], nextFeedSeq: 1, outcomes: [] };
}

export function partnerMemory(): PartnerMemory {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[partner-store.ts] In-memory partner state cannot be used in production.");
  }
  globals.__asmitaPartnerStore ??= emptyMemory();
  // A store created before the share consents existed (dev hot reload).
  globals.__asmitaPartnerStore.shareConsents ??= [];
  globals.__asmitaPartnerStore.feedEvents ??= [];
  globals.__asmitaPartnerStore.nextFeedSeq ??= 1;
  globals.__asmitaPartnerStore.outcomes ??= [];
  return globals.__asmitaPartnerStore;
}

export function resetPartnerMemory() {
  globals.__asmitaPartnerStore = emptyMemory();
}

/** Account erasure, memory path: the same rows the database path deletes. */
export function erasePartnerShareConsentsForCases(caseIds: string[]) {
  if (!globals.__asmitaPartnerStore || caseIds.length === 0) return;
  const ids = new Set(caseIds);
  globals.__asmitaPartnerStore.shareConsents = globals.__asmitaPartnerStore.shareConsents.filter(
    (consent) => !ids.has(consent.caseId),
  );
}

/**
 * Account erasure, memory path: outcome rows for her cases go too. They are
 * the only partner rows that can hold one of her links (urlEncrypted); the
 * feed's event log stays, because it carries ids only, never an address.
 */
export function erasePartnerOutcomesForCases(caseIds: string[]) {
  if (!globals.__asmitaPartnerStore || caseIds.length === 0) return;
  const ids = new Set(caseIds);
  globals.__asmitaPartnerStore.outcomes = globals.__asmitaPartnerStore.outcomes.filter(
    (outcome) => outcome.caseId === null || !ids.has(outcome.caseId),
  );
}
