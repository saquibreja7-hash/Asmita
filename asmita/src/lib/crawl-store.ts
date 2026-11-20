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
  /** PDQ image or VPDQ video fingerprint; absent reads as PDQ (rows seeded before video fingerprints existed). */
  algorithm?: "PDQ" | "VPDQ";
  /**
   * Video only (VPDQ, video-fingerprints spec WP20): the kept frame list as
   * the same JSON the route stored ({ hash, quality, t }), encrypted. The
   * pool serves its hashes; erasure clears it with the pool id.
   */
  videoFramesEncrypted?: string | null;
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
  /** What the authorisation covers (WP22). Absent rows are the original full scope. */
  scope?: "SEARCH_AND_NOTICE" | "WATCH_ONLY";
  /** The WATCH_ONLY authorisation a full one replaced at "Take it down" (WP22). */
  convertedFromId?: string | null;
  // Watch-and-verify WP24: the re-upload window on a resolved case (crawl-watch.ts).
  watchUntil?: Date | null;
};

export type MemoryCrawlFinding = {
  id: string;
  caseId: string;
  hashSubmissionId: string;
  crawlConsentId: string | null;
  pageUrlEncrypted: string;
  imageUrlEncrypted: string;
  urlDigest: string | null;
  /** Null for an SSCD finding: the second layer has no PDQ distance (ADR 008). */
  distance: number | null;
  /**
   * The SSCD similarity the crawler scored (ADR 008, WP28): set on an SSCD
   * finding, or on a borderline PDQ match it scored against the fingerprint's
   * embeddings. Information for the analyst, never an automatic decision.
   */
  sscdSimilarity: number | null;
  quality: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sourceId: string;
  runId: string;
  reviewStatus: "CANDIDATE" | "APPROVED" | "DISMISSED";
  /** Which layer matched (ADR 008): a hash distance (PDQ/VPDQ) or SSCD. */
  method: "PDQ" | "VPDQ" | "SSCD";
  reviewedById: string | null;
  reviewedAt: Date | null;
  secondReviewedById: string | null;
  secondReviewedAt: Date | null;
};

/**
 * An SSCD embedding of an ANALYST-CONFIRMED copy, the memory twin of the
 * FindingEmbedding row (ADR 008, WP28). The vector is kept in plain memory
 * (the dev store holds decrypted rows by design); it is never logged and
 * leaves with the finding, the fingerprint's rejection, the consent's
 * withdrawal or the case's erasure.
 */
export type MemoryFindingEmbedding = {
  id: string;
  findingId: string;
  hashSubmissionId: string;
  caseId: string;
  model: string;
  version: string;
  vector: number[];
  createdAt: Date;
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
  /** Crawl order (crawler v3 WP11): lower runs first; claim sorts by it, then nextDueAt. */
  priority: number;
  etag: string | null;
  lastModified: string | null;
  status: "PENDING" | "FETCHED" | "NOT_MODIFIED" | "GONE" | "BLOCKED" | "ERROR" | "DEAD";
  claimedUntil: Date | null;
  lastFetchedAt: Date | null;
  nextDueAt: Date;
  failCount: number;
  createdAt: Date;
  /**
   * First permanent fetch failure (crawler v3 review fix, WP13); cleared on a
   * successful visit. Optional: rows created before the column lack it (null).
   */
  lastPermanentFailAt?: Date | null;
};

export type MemoryCrawlServiceKey = {
  id: string;
  name: string;
  keyHash: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

/*
 * One scheduled re-check that a link reported removed really stayed down
 * (watch-and-verify WP23, link-verification.ts). caseId is a memory-only
 * denormalised copy: the database reaches the case through SubmittedUrl, but
 * the memory erasure (eraseCrawlMemoryForCases below) runs after the case's
 * link rows are already gone, so it cannot resolve them.
 */
export type MemoryLinkVerification = {
  id: string;
  caseId: string;
  submittedUrlId: string;
  dueAt: Date;
  attempt: number;
  outcome: "PENDING" | "GONE" | "STILL_ONLINE" | "UNKNOWN";
  checkedAt: Date | null;
  enqueuedAt: Date | null;
  createdAt: Date;
};

type CrawlMemory = {
  fingerprints: Map<string, MemoryFingerprint>;
  consents: MemoryCrawlConsent[];
  findings: Map<string, MemoryCrawlFinding>;
  // SSCD embeddings of confirmed copies (ADR 008, WP28), keyed by row id;
  // at most one per finding (findingEmbeddingByFinding finds it).
  embeddings: Map<string, MemoryFindingEmbedding>;
  sources: Map<string, MemoryCrawlSource>;
  // Keyed by host (lookups are by host, isBlockedCrawlHost in crawl-sources.ts).
  blockedHosts: Map<string, MemoryCrawlBlockedHost>;
  // The frontier (WP3), keyed by row id; urlDigest is unique per source.
  pages: Map<string, MemoryCrawlPage>;
  keys: Map<string, MemoryCrawlServiceKey>;
  // Pages fetched per source per UTC day (CrawlSourceDay), keyed by
  // sourceDayKey below.
  sourceDays: Map<string, number>;
  // Link removal re-checks (watch-and-verify WP23), keyed by row id.
  linkVerifications: Map<string, MemoryLinkVerification>;
};

const globals = globalThis as typeof globalThis & { __asmitaCrawlStore?: CrawlMemory };

function emptyMemory(): CrawlMemory {
  return { fingerprints: new Map(), consents: [], findings: new Map(), embeddings: new Map(), sources: new Map(), blockedHosts: new Map(), pages: new Map(), keys: new Map(), sourceDays: new Map(), linkVerifications: new Map() };
}

export function crawlMemory(): CrawlMemory {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[crawl-store.ts] In-memory crawler state cannot be used in production.");
  }
  globals.__asmitaCrawlStore ??= emptyMemory();
  // A store created before the per-day counters existed (dev hot reload).
  globals.__asmitaCrawlStore.sourceDays ??= new Map();
  globals.__asmitaCrawlStore.linkVerifications ??= new Map();
  // A store created before SSCD embeddings existed (dev hot reload).
  globals.__asmitaCrawlStore.embeddings ??= new Map();
  return globals.__asmitaCrawlStore;
}

/** The SSCD embedding seeded from one finding, if any (ADR 008: one per finding). */
export function findingEmbeddingByFinding(findingId: string): MemoryFindingEmbedding | null {
  for (const embedding of crawlMemory().embeddings.values()) {
    if (embedding.findingId === findingId) return embedding;
  }
  return null;
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
  // The SSCD embeddings of her confirmed copies go with the findings (ADR
  // 008): the pool must stop serving them, exactly as on the database path.
  for (const [id, embedding] of memory.embeddings ?? new Map<string, MemoryFindingEmbedding>()) {
    if (ids.has(embedding.caseId)) memory.embeddings.delete(id);
  }
  // Fingerprints are kept (as on the database path) but leave the pool; the
  // video frame list goes with the pool id, as the database erasure clears
  // both in the same statement (WP17/WP20).
  for (const fingerprint of memory.fingerprints.values()) {
    if (ids.has(fingerprint.caseId)) {
      fingerprint.crawlPoolId = null;
      fingerprint.videoFramesEncrypted = null;
    }
  }
  // Sources stay, including REPORTED ones her links created: they carry her
  // host only, never her link or case, so erasing her must not touch them.
  // Removal re-checks are case data (they reference her links), so they go.
  for (const [id, verification] of memory.linkVerifications) if (ids.has(verification.caseId)) memory.linkVerifications.delete(id);
}
