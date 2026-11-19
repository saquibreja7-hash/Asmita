/*
 * In-memory crawler state for local development and tests without a
 * database, the crawler's twin of store.ts. Never used in production: every
 * crawl module selects the database path whenever DATABASE_URL is set, and
 * these helpers refuse to run under NODE_ENV=production.
 *
 * The dev hash store (hash-submission.ts) keeps only a digest of each
 * fingerprint and nothing is ever approved in memory, so the crawler's
 * memory path keeps its own fingerprint records, seeded by tests.
 */

export type MemoryFingerprint = {
  id: string;
  caseId: string;
  hashEncrypted: string;
  quality: number;
  status: "PENDING_REVIEW" | "APPROVED" | "DISPATCHED" | "REJECTED";
  crawlPoolId: string | null;
};

export type MemoryCrawlConsent = {
  id: string;
  caseId: string;
  signedPdfEncrypted: string;
  hashSubmissionIds: string[];
  templateId: string;
  templateDigest: string;
  signedAt: Date;
  withdrawnAt: Date | null;
};

export type MemoryCrawlFinding = {
  id: string;
  caseId: string;
  hashSubmissionId: string;
  crawlConsentId: string | null;
  pageUrlEncrypted: string;
  imageUrlEncrypted: string;
  urlDigest: string | null;
  distance: number;
  quality: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sourceId: string;
  runId: string;
  reviewStatus: "CANDIDATE" | "APPROVED" | "DISMISSED";
  reviewedById: string | null;
  reviewedAt: Date | null;
  secondReviewedById: string | null;
  secondReviewedAt: Date | null;
};

export type MemoryCrawlSource = {
  id: string;
  kind: "SITE";
  domain: string;
  pageBudget: number;
  delayMs: number;
  enabled: boolean;
  approvedBy: string | null;
  origin: "ADMIN" | "REPORTED" | "DISCOVERED" | "PARTNER";
  hops: number;
  discoveredFromId: string | null;
  render: "HTTP" | "BROWSER" | "AUTO";
  lastCrawledAt: Date | null;
  pagesCrawled: number;
  /** Crawler v2 WP5: the automatic pause of an unproductive discovered site. */
  pausedUntil: Date | null;
  pauseReason: string | null;
  /** Why a discovered site was stored disabled at birth: "max_hops" | "daily_cap". */
  disabledReason: string | null;
  createdAt: Date;
};

export type MemoryCrawlBlockedHost = {
  id: string;
  host: string;
  reason: string;
  addedBy: string;
  createdAt: Date;
};

export type MemoryCrawlPage = {
  id: string;
  sourceId: string;
  urlEncrypted: string;
  urlDigest: string;
  depth: number;
  kind: "PAGE" | "SITEMAP" | "FEED";
  etag: string | null;
  lastModified: string | null;
  status: "PENDING" | "FETCHED" | "NOT_MODIFIED" | "GONE" | "BLOCKED" | "ERROR" | "DEAD";
  claimedUntil: Date | null;
  lastFetchedAt: Date | null;
  nextDueAt: Date;
  failCount: number;
  createdAt: Date;
};

export type MemoryCrawlServiceKey = {
  id: string;
  name: string;
  keyHash: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

type CrawlMemory = {
  fingerprints: Map<string, MemoryFingerprint>;
  consents: MemoryCrawlConsent[];
  findings: Map<string, MemoryCrawlFinding>;
  sources: Map<string, MemoryCrawlSource>;
  // Keyed by host (lookups are by host, isBlockedCrawlHost in crawl-sources.ts).
  blockedHosts: Map<string, MemoryCrawlBlockedHost>;
  // The frontier (WP3), keyed by row id; urlDigest is unique per source.
  pages: Map<string, MemoryCrawlPage>;
  keys: Map<string, MemoryCrawlServiceKey>;
  // Pages fetched per source per UTC day (CrawlSourceDay), keyed by
  // sourceDayKey below.
  sourceDays: Map<string, number>;
};

const globals = globalThis as typeof globalThis & { __asmitaCrawlStore?: CrawlMemory };

function emptyMemory(): CrawlMemory {
  return { fingerprints: new Map(), consents: [], findings: new Map(), sources: new Map(), blockedHosts: new Map(), pages: new Map(), keys: new Map(), sourceDays: new Map() };
}

export function crawlMemory(): CrawlMemory {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[crawl-store.ts] In-memory crawler state cannot be used in production.");
  }
  globals.__asmitaCrawlStore ??= emptyMemory();
  // A store created before the per-day counters existed (dev hot reload).
  globals.__asmitaCrawlStore.sourceDays ??= new Map();
  return globals.__asmitaCrawlStore;
}

/** The memory key of one source's counter for the UTC day starting at `day`. */
export function sourceDayKey(sourceId: string, day: Date): string {
  return `${sourceId}|${day.toISOString()}`;
}

export function resetCrawlMemory() {
  globals.__asmitaCrawlStore = emptyMemory();
}

/** Account erasure, memory path: the same rows the database path deletes. */
export function eraseCrawlMemoryForCases(caseIds: string[]) {
  if (!globals.__asmitaCrawlStore || caseIds.length === 0) return;
  const memory = globals.__asmitaCrawlStore;
  const ids = new Set(caseIds);
  memory.consents = memory.consents.filter((consent) => !ids.has(consent.caseId));
  for (const [id, finding] of memory.findings) if (ids.has(finding.caseId)) memory.findings.delete(id);
  // Fingerprints are kept (as on the database path) but leave the pool.
  for (const fingerprint of memory.fingerprints.values()) {
    if (ids.has(fingerprint.caseId)) fingerprint.crawlPoolId = null;
  }
  // Sources stay, including REPORTED ones her links created: they carry her
  // host only, never her link or case, so erasing her must not touch them.
}
