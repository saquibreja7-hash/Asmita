/**
 * A mock of the Asmita crawler API on 127.0.0.1: GET pool, GET sources,
 * POST findings, and (crawler v2 WP3) the frontier routes POST
 * /api/crawler/frontier/{claim,report}, plus (WP5) POST /api/crawler/discoveries.
 * Records every request so tests can assert on what the crawler sent,
 * including the Authorization header.
 *
 * The frontier half mirrors the app's rules (asmita/src/lib/crawl-pages.ts)
 * on purpose: the seed created on first claim (at priority 50, review fix),
 * rows claimed for 30 minutes, the daily page budget, the visit schedule
 * (24 h after fetched, doubling after not_modified up to 14 days, error
 * backoff 1 h / 6 h / 24 h and dead after five, gone dead) and the
 * per-source digest dedup of reported links with the app's in-scope check.
 * Crawler v3 WP11 is mirrored too: link priorities (sitemap 10, feed 20,
 * pagination 30, pages 50 + 10 per depth level), the claim order (priority,
 * then nextDueAt), the lastmod jump (priority 5, due now, clamped to now)
 * and the visit reset (a successful visit falls back to the kind/depth
 * value, so the jump is one-shot). The crawler v3 review fix (WP13) is
 * mirrored too: an `error` with `failure: "permanent"` backs off like any
 * error on the first attempt and is remembered; the row dies only on a
 * permanent failure at least 24 h after the first one. It is written out
 * independently so drift between the crawler and the app's contract shows
 * up as a test failure.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import type { EmbeddingItem, Finding, Pool, Source } from "../../src/asmita/client.ts";

/**
 * The server's request contract, written out independently of the client's
 * schema so client drift shows up as a 400 in tests. WP28: findings may
 * carry the layer that matched (`method`), an SSCD finding carries
 * `sscdSimilarity` and no distance, and a pdq finding may carry a
 * borderline score.
 */
const ServerFinding = z
  .strictObject({
    fingerprintId: z.string().min(1),
    pageUrl: z.string().min(1),
    imageUrl: z.string().min(1),
    method: z.enum(["pdq", "vpdq", "sscd"]).optional(),
    distance: z.number().int().min(0).max(31).optional(),
    sscdSimilarity: z.number().min(0).max(1).optional(),
    quality: z.number().min(0).max(100),
    observedAt: z.iso.datetime({ offset: true }),
    sourceId: z.string().min(1),
  })
  .superRefine((f, ctx) => {
    const method = f.method ?? "pdq";
    if (method === "sscd") {
      if (f.distance !== undefined) ctx.addIssue({ code: "custom", path: ["distance"], message: "sscd carries no distance" });
      if (f.sscdSimilarity === undefined) ctx.addIssue({ code: "custom", path: ["sscdSimilarity"], message: "sscd requires sscdSimilarity" });
      return;
    }
    if (f.distance === undefined) ctx.addIssue({ code: "custom", path: ["distance"], message: "distance required" });
    if (f.sscdSimilarity !== undefined && f.method !== "pdq") ctx.addIssue({ code: "custom", path: ["sscdSimilarity"], message: "pdq only" });
  });
const ServerEmbedding = z.strictObject({
  fingerprintId: z.string().min(1),
  pageUrl: z.string().min(1),
  imageUrl: z.string().min(1),
  model: z.string().min(1),
  version: z.string().min(1),
  vector: z.array(z.number().finite()).min(16).max(2048),
});
const ServerEmbeddingsEnvelope = z.strictObject({
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  embeddings: z.array(ServerEmbedding).min(1).max(10),
});
const ServerEnvelope = z.strictObject({
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  findings: z.array(z.unknown()).min(1).max(50),
});
const ServerClaim = z.strictObject({
  sourceId: z.string().min(1),
  limit: z.number().int().min(1).max(200),
});
const ServerReportLink = z.strictObject({
  url: z.string().min(10).max(2048),
  kind: z.enum(["page", "sitemap", "feed"]),
  // Crawler v3 WP11: a pagination link runs before plain pages; a sitemap
  // link may carry the entry's <lastmod> as a strict ISO date.
  pagination: z.boolean().optional(),
  lastmod: z.iso.datetime({ offset: true }).optional(),
});
const ServerReportPage = z
  .strictObject({
    id: z.string().min(1),
    status: z.enum(["fetched", "not_modified", "gone", "blocked", "error"]),
    etag: z.string().min(1).max(512).optional(),
    lastModified: z.string().min(1).max(512).optional(),
    // Crawler v3 review fix (WP13): an `error` whose fetch failed
    // permanently. Only ever sent with status "error".
    failure: z.literal("permanent").optional(),
    aliases: z.array(z.string().min(10).max(2048)).max(20).optional(),
    links: z.array(ServerReportLink).max(500),
  })
  .superRefine((page, ctx) => {
    if (page.failure !== undefined && page.status !== "error") {
      ctx.addIssue({ code: "custom", path: ["failure"], message: "only with status error" });
    }
  });
const ServerReport = z.strictObject({
  sourceId: z.string().min(1),
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  pages: z.array(z.unknown()).min(0).max(200),
});
const ServerDiscoveries = z.strictObject({
  sourceId: z.string().min(1),
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  hosts: z.array(z.string().min(1).max(253)).min(0).max(200),
});
const BODY_LIMIT = 256 * 1024;

/** The tracking-parameter rule of the app's digest key (crawl-page-key.ts). */
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;

/**
 * The app's digest key of a page URL (crawl-page-key.ts, mirrored): the
 * crawler v3 WP10 normalisation — https, one leading `www.` dropped, a final
 * index document and a non-root trailing slash dropped — with tracking
 * parameters stripped and the rest sorted.
 */
function pageKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.replace(/^www\./i, "");
  if (/\/index\.(?:html|htm|php)\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/index\.(?:html|htm|php)\/?$/i, "/");
  if (url.pathname === "") url.pathname = "/";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  if (url.search) {
    const params = [...new URLSearchParams(url.search).entries()].filter(([k]) => !TRACKING_PARAM.test(k));
    params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
    url.search = new URLSearchParams(params).toString();
  }
  return url.toString();
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const CLAIM_MS = 30 * MIN;
/**
 * The app's permanent-failure window (crawler v3 review fix, WP13): a row
 * that failed permanently dies on the next permanent failure at least this
 * long after the first one.
 */
const PERMANENT_FAIL_MS = 24 * HOUR;
/** The app's priority rule (crawl-pages.ts), mirrored (crawler v3 WP11). */
const PRIORITY_DEFAULT = 100;
const PRIORITY_LASTMOD = 5;
/** The seed row's priority (review fix, WP11): the depth-0 page value. */
const PRIORITY_SEED = 50;
function linkPriority(link: { kind: "page" | "sitemap" | "feed"; pagination?: boolean }, depth: number): number {
  if (link.kind === "sitemap") return 10;
  if (link.kind === "feed") return 20;
  if (link.pagination === true) return 30;
  return Math.min(50 + 10 * Math.max(depth, 0), PRIORITY_DEFAULT);
}
/** The app's visit reset (review fix, WP11): a successful visit resets a row's priority to its kind/depth value. */
function visitPriority(row: { kind: "PAGE" | "SITEMAP" | "FEED"; viaPagination: boolean; depth: number }): number {
  return linkPriority({ kind: row.kind === "SITEMAP" ? "sitemap" : row.kind === "FEED" ? "feed" : "page", pagination: row.viaPagination }, row.depth);
}

type MockPage = {
  id: string;
  sourceId: string;
  url: string;
  urlDigest: string;
  depth: number;
  priority: number;
  /** Stored from a pagination link (review fix: its canonical aliases are ignored). */
  viaPagination: boolean;
  etag: string | null;
  lastModified: string | null;
  status: "PENDING" | "FETCHED" | "NOT_MODIFIED" | "GONE" | "BLOCKED" | "ERROR" | "DEAD";
  /** The row's document kind (the app's CrawlPage.kind), for the visit reset. */
  kind: "PAGE" | "SITEMAP" | "FEED";
  claimedUntil: number | null;
  lastFetchedAt: number | null;
  nextDueAt: number;
  failCount: number;
  /** First permanent fetch failure (review fix, WP13); null once it fetches again. */
  lastPermanentFailAt: number | null;
};

/**
 * A source in the app's contract shape, with the WP7 fields defaulted the way
 * the app defaults a human-added site: origin "admin", hops 0, render "http".
 */
export function siteSource(
  fields: Pick<Source, "id" | "domain" | "pageBudget" | "delayMs"> & Partial<Pick<Source, "origin" | "hops" | "render" | "matched">>,
): Source {
  return { kind: "site", origin: "admin", hops: 0, render: "http", ...fields };
}

export type MockRequest = { method: string; path: string; authorization: string | undefined; body: unknown };

/** The mock's mirror of the app's discovery rules (WP5). */
export type MockDiscoveryRules = {
  /** A discovered source is enabled while its hops are within this (app default 2). */
  maxHops?: number;
  /** At most this many discovered sources are auto-enabled per UTC day (app default 200). */
  maxPerDay?: number;
  /** Page budget of a discovered source (app default: CRAWLER_DISCOVERED_PAGE_BUDGET, 200). */
  pageBudget?: number;
  /** Budget a discovered source is promoted to on a match (app default: CRAWLER_REPORTED_PAGE_BUDGET, 2000). */
  reportedBudget?: number;
  /** Hosts the mock never stores (the app's never-crawl list, test-provided). */
  neverCrawl?: string[];
};

export type MockAsmitaOptions = {
  key: string;
  pool: Pool;
  sources: Source[];
  /** Override status for a route ("pool" | "sources" | "findings" | "embeddings" | "claim" | "report" | "discoveries"), e.g. 503. */
  status?: Partial<Record<"pool" | "sources" | "findings" | "embeddings" | "claim" | "report" | "discoveries", number>>;
  /** Fail the first N calls of a route with 500. */
  failFirst?: Partial<Record<"pool" | "sources" | "findings" | "embeddings" | "claim" | "report" | "discoveries", number>>;
  /**
   * Answer a route with this status once more than `after` calls reached the
   * route (e.g. the key revoked between two passes of a --loop run).
   */
  statusAfter?: Partial<Record<"pool" | "sources" | "findings" | "embeddings" | "claim" | "report" | "discoveries", { after: number; status: number }>>;
  /** Pool served from the second pool request on (simulates a re-sync change). */
  poolAfterFirst?: Pool;
  /** Fingerprint ids the server answers "fingerprint_not_accepted" for. */
  notAccepted?: string[];
  /** Body size limit for POST /findings (default 256 KiB, 413 above). */
  bodyLimit?: number;
  /** Answer with the pre-rollout statuses "created" / "duplicate". */
  legacyStatuses?: boolean;
  /** Treat this source's domain as something else (simulates a scope mismatch). */
  sourceDomainOverride?: string;
  /**
   * The mock's mirror of the app's discovery rules (WP5). Without it no
   * host reported to POST /discoveries is ever stored.
   */
  discovery?: MockDiscoveryRules;
  /**
   * The mock's mirror of the app's SSCD rules (WP28). Without it no
   * embedding is ever stored (the app answers the same way while its
   * ENABLE_SSCD is off). `confirmedFindings` names the (fingerprint,
   * page, image) locations an analyst has confirmed — the app's
   * finding_not_confirmed gate, mirrored.
   */
  sscd?: {
    model: string;
    version: string;
    confirmedFindings?: Array<{ fingerprintId: string; pageUrl: string; imageUrl: string }>;
  };
  /**
   * The frontier's clock (default Date.now). Tests advance it to prove
   * scheduling, the daily budget and the 30-minute claim window.
   */
  now?: () => number;
  /**
   * Seed URL of a source's first claim. Production: https://<domain>/.
   * Fixture runs point it at their local server.
   */
  seedUrl?: (source: Source) => string;
};

export type MockDiscoveredSource = {
  id: string;
  domain: string;
  hops: number;
  discoveredFromId: string;
  enabled: boolean;
  pageBudget: number;
  delayMs: number;
  createdAt: number;
  /** Why a stored-disabled source was not auto-enabled: "max_hops" | "daily_cap". */
  disabledReason: "max_hops" | "daily_cap" | null;
  /** Set when a finding under this source promoted it. */
  promotedAt: number | null;
};

/** A discovered row as GET /sources answers it (origin "discovered", its hops). */
function discoveredAsSource(d: MockDiscoveredSource): Source {
  return siteSource({ id: d.id, domain: d.domain, pageBudget: d.pageBudget, delayMs: d.delayMs, origin: "discovered", hops: d.hops });
}

export class MockAsmita {
  readonly requests: MockRequest[] = [];
  /** Findings accepted (created), by `${fingerprintId}|${imageUrl}`. */
  readonly created = new Map<string, Finding>();
  readonly posted: Finding[] = [];
  readonly bodySizes: number[] = [];
  readonly badRequests: string[] = [];
  /** The frontier: page rows by id (the app's CrawlPage table). */
  readonly pages = new Map<string, MockPage>();
  /** Every claim body, in order. */
  readonly claims: Array<{ sourceId: string; limit: number }> = [];
  /** Every report, in order, with its page statuses, permanent hints and accepted count. */
  readonly reports: Array<{ sourceId: string; runId: string; count: number; accepted: number; statuses: Record<string, number>; permanent: number }> = [];
  /** Every discovery report, in order (the app's POST /discoveries). */
  readonly discoveryReports: Array<{ sourceId: string; runId: string; hosts: string[]; accepted: number }> = [];
  /** Every canonical alias the crawler reported, in order (WP10): page id -> alias URL. */
  readonly reportedAliases: Array<{ sourceId: string; pageId: string; url: string }> = [];
  /** The sources the mock created from discovery reports, by host (the app's DISCOVERED rows). */
  readonly discovered = new Map<string, MockDiscoveredSource>();
  /**
   * WP28: every embedding offer the crawler posted, in order, and the ones
   * the mock stored (the app's FindingEmbedding rows), keyed by
   * fingerprint|page|image.
   */
  readonly postedEmbeddings: EmbeddingItem[] = [];
  readonly storedEmbeddings = new Map<string, EmbeddingItem>();
  /** Auto-enables per UTC day, by day-start timestamp (the app's daily cap). */
  readonly autoEnabledByDay = new Map<number, number>();
  private server: Server | null = null;
  private calls: Record<string, number> = {};
  private idCounter = 0;

  constructor(public opts: MockAsmitaOptions) {}

  get url(): string {
    const a = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${a.port}`;
  }

  async start(port = 0): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(port, "127.0.0.1", r));
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server?.close(() => r()));
    this.server?.closeAllConnections();
  }

  // --- frontier (the app's rules, mirrored) ---------------------------------

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /** A deterministic keyed stand-in for the app's sha256 digest. */
  private digest(sourceId: string, url: string): string | null {
    const key = pageKey(url);
    if (key === null) return null;
    let hash = 0n;
    const secret = `${sourceId}\u0000${key}`;
    for (let i = 0; i < secret.length; i++) hash = (hash * 1_000_003n + BigInt(secret.charCodeAt(i))) & 0xffffffffffffffffn;
    return hash.toString(16);
  }

  private rowsOf(sourceId: string): MockPage[] {
    return [...this.pages.values()].filter((p) => p.sourceId === sourceId);
  }

  /**
   * Test helper: put a page straight into the frontier, as if an earlier run
   * had reported it (used to give two concurrent crawlers real work from the
   * first claim). Skips duplicates and unparseable URLs, like the app.
   */
  addPage(sourceId: string, url: string, depth: number): void {
    this.insertPage(sourceId, url, depth);
  }

  private insertPage(sourceId: string, url: string, depth: number, priority: number = PRIORITY_DEFAULT, viaPagination = false, kind: "PAGE" | "SITEMAP" | "FEED" = "PAGE"): void {
    const digest = this.digest(sourceId, url);
    if (digest === null) return;
    if (this.rowsOf(sourceId).some((p) => p.urlDigest === digest)) return;
    this.idCounter += 1;
    const id = `page-${this.idCounter}`;
    this.pages.set(id, {
      id, sourceId, url, urlDigest: digest, depth, priority, viaPagination, etag: null, lastModified: null,
      status: "PENDING", kind, claimedUntil: null, lastFetchedAt: null, nextDueAt: 0, failCount: 0, lastPermanentFailAt: null,
    });
  }

  /** The app's claim: seed on first claim, daily budget, 30-minute claims. Public so tests can claim directly. */
  claimFrontier(sourceId: string, limit: number): Array<{ id: string; url: string; depth: number; etag?: string; lastModified?: string }> {
    const source = this.sourceById(sourceId);
    if (!source) return [];
    const now = this.now();
    if (this.rowsOf(sourceId).length === 0) {
      const seedUrl = this.opts.seedUrl ? this.opts.seedUrl(source) : `https://${source.domain}/`;
      // Review fix (WP11): the seed is stored at 50, the depth-0 page value.
      this.insertPage(sourceId, seedUrl, 0, PRIORITY_SEED);
    }
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const fetchedToday = this.rowsOf(sourceId).filter((p) => p.lastFetchedAt !== null && p.lastFetchedAt >= dayStart.getTime()).length;
    const take = Math.min(limit, source.pageBudget - fetchedToday);
    if (take <= 0) return [];
    const due = this.rowsOf(sourceId)
      .filter((p) => p.nextDueAt <= now && p.status !== "DEAD" && p.status !== "GONE" && (p.claimedUntil === null || p.claimedUntil < now))
      // The app's claim order (WP11): lowest priority first, then the
      // longest-due row.
      .sort((a, b) => a.priority - b.priority || a.nextDueAt - b.nextDueAt)
      .slice(0, take);
    for (const row of due) row.claimedUntil = now + CLAIM_MS;
    return due.map((p) => ({
      id: p.id, url: p.url, depth: p.depth,
      ...(p.etag !== null ? { etag: p.etag } : {}),
      ...(p.lastModified !== null ? { lastModified: p.lastModified } : {}),
    }));
  }

  /** The app's report: scheduling, link storage with the in-scope check, canonical aliases (WP10). */
  private report(sourceId: string, pages: unknown[]): number {
    const source = this.sourceById(sourceId);
    if (!source) return 0;
    const now = this.now();
    const domain = (this.opts.sourceDomainOverride ?? source.domain).toLowerCase();
    /** The app's acceptableLink: an explicit http(s) URL on the source's host. */
    const acceptable = (raw: string): string | null => {
      let host: string;
      try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        // The app also refuses non-default ports (crawl-pages.ts); the
        // fixture site lives on one, so the mock checks only the scheme
        // and credentials here. The port rule is covered by the app-side
        // unit tests (crawl-frontier.test.ts).
        if (url.username !== "" || url.password !== "") return null;
        host = url.hostname;
        if (host !== domain && !host.endsWith(`.${domain}`)) return null;
        return raw;
      } catch {
        return null;
      }
    };
    const checkedPages = pages
      .map((raw) => ({ raw, parsed: ServerReportPage.safeParse(raw) }))
      .filter((p): p is { raw: unknown; parsed: { success: true; data: z.infer<typeof ServerReportPage> } } => p.parsed.success)
      .map((p) => p.parsed.data);
    // Pass 1: the aliases (WP10, review fix). They win over links: a row
    // for one that was never fetched and is not a seed is retired; a fetched
    // row or a seed is never touched, no placeholder row is inserted, and a
    // page reached via pagination has its aliases ignored.
    const aliasDigests = new Set<string>();
    for (const entry of checkedPages) {
      const row = this.pages.get(entry.id);
      if (!row || row.sourceId !== sourceId || row.status === "DEAD" || row.status === "GONE") continue;
      for (const raw of entry.aliases ?? []) {
        if (acceptable(raw) === null) continue;
        const digest = this.digest(sourceId, raw);
        if (digest === null || digest === row.urlDigest || aliasDigests.has(digest)) continue;
        this.reportedAliases.push({ sourceId, pageId: entry.id, url: raw });
        if (row.viaPagination) continue;
        aliasDigests.add(digest);
      }
    }
    // A row this report moves was just visited: never an alias victim.
    for (const entry of checkedPages) {
      const row = this.pages.get(entry.id);
      if (row && row.sourceId === sourceId) aliasDigests.delete(row.urlDigest);
    }
    for (const row of this.rowsOf(sourceId)) {
      if (!aliasDigests.has(row.urlDigest)) continue;
      if (row.lastFetchedAt !== null || row.depth === 0) continue;
      if (row.status !== "DEAD" && row.status !== "GONE") {
        row.status = "DEAD";
        row.nextDueAt = now;
        row.claimedUntil = null;
      }
    }
    let accepted = 0;
    /** Rows this report moves (the app excludes them from the lastmod jump). */
    const reportedIds = new Set<string>();
    /** Link lastmods by digest (WP11), the first report of one wins. */
    const lastmodByDigest = new Map<string, number>();
    for (const entry of checkedPages) {
      const row = this.pages.get(entry.id);
      if (!row || row.sourceId !== sourceId || row.status === "DEAD" || row.status === "GONE") continue;
      accepted += 1;
      reportedIds.add(entry.id);
      row.etag = entry.etag ?? row.etag;
      row.lastModified = entry.lastModified ?? row.lastModified;
      row.claimedUntil = null;
      switch (entry.status) {
        case "fetched":
          row.status = "FETCHED";
          row.lastFetchedAt = now;
          row.nextDueAt = now + DAY;
          row.failCount = 0;
          row.lastPermanentFailAt = null; // alive again (review fix, WP13)
          row.priority = visitPriority(row); // the lastmod bump was one-shot (review fix, WP11)
          break;
        case "not_modified": {
          const previous = row.lastFetchedAt !== null ? Math.max(row.nextDueAt - row.lastFetchedAt, 0) : DAY;
          const interval = Math.min(Math.max(previous * 2, DAY), 14 * DAY);
          row.status = "NOT_MODIFIED";
          row.lastFetchedAt = now;
          row.nextDueAt = now + interval;
          row.failCount = 0;
          row.lastPermanentFailAt = null; // alive again (review fix, WP13)
          row.priority = visitPriority(row); // the lastmod bump was one-shot (review fix, WP11)
          break;
        }
        case "gone":
          row.status = "GONE";
          row.lastFetchedAt = now;
          row.nextDueAt = now;
          break;
        case "blocked":
          row.status = "BLOCKED";
          row.nextDueAt = now + DAY;
          break;
        case "error": {
          row.failCount += 1;
          // Review fix (WP13): the first permanent failure is an ordinary
          // error backoff with the failure remembered; the row dies only on
          // a permanent failure at least 24 h after the first one.
          const permanent = entry.failure === "permanent";
          const permanentDead =
            permanent && row.lastPermanentFailAt !== null && now - row.lastPermanentFailAt >= PERMANENT_FAIL_MS;
          if (row.failCount >= 5 || permanentDead) row.status = "DEAD";
          else {
            row.status = "ERROR";
            row.nextDueAt = now + (row.failCount === 1 ? HOUR : row.failCount === 2 ? 6 * HOUR : DAY);
            if (permanent && row.lastPermanentFailAt === null) row.lastPermanentFailAt = now;
          }
          break;
        }
      }
      for (const link of entry.links) {
        if (acceptable(link.url) === null) continue; // the app's in-scope and shape check
        const digest = this.digest(sourceId, link.url);
        if (digest !== null && aliasDigests.has(digest)) continue; // an alias is never a live row
        this.insertPage(
          sourceId,
          link.url,
          row.depth + 1,
          linkPriority(link, row.depth + 1),
          link.pagination === true,
          link.kind === "page" ? "PAGE" : link.kind === "sitemap" ? "SITEMAP" : "FEED",
        );
        // Review fix (WP11): a lastmod in the future is clamped to now.
        if (digest !== null && link.lastmod !== undefined && !lastmodByDigest.has(digest)) {
          lastmodByDigest.set(digest, Math.min(Date.parse(link.lastmod), now));
        }
      }
    }
    // The app's lastmod jump (WP11): a row whose reported sitemap entry is
    // newer than its last fetch is priority 5 and due now — except rows this
    // same report moved (just fetched), dead rows and rows never fetched.
    for (const [digest, lastmod] of lastmodByDigest) {
      const row = this.rowsOf(sourceId).find((p) => p.urlDigest === digest);
      if (!row || reportedIds.has(row.id) || row.status === "DEAD" || row.status === "GONE") continue;
      if (row.lastFetchedAt === null || lastmod <= row.lastFetchedAt) continue;
      row.priority = PRIORITY_LASTMOD;
      row.nextDueAt = now;
    }
    return accepted;
  }

  // --- discoveries (the app's WP5 rules, mirrored) ---------------------------

  /** A source by id, as the app's contract shape: configured or discovered. */
  private sourceById(sourceId: string): Source | null {
    const configured = this.opts.sources.find((s) => s.id === sourceId);
    if (configured) return configured;
    const discovered = [...this.discovered.values()].find((s) => s.id === sourceId);
    return discovered ? discoveredAsSource(discovered) : null;
  }

  /** A source by id: one the test configured, or one the mock discovered. */
  private hopsOf(sourceId: string): number | null {
    const discovered = [...this.discovered.values()].find((s) => s.id === sourceId);
    if (discovered) return discovered.hops;
    return this.opts.sources.some((s) => s.id === sourceId) ? 0 : null;
  }

  /** Whether a host is already a source, whatever its origin (the app's skip rule). */
  private isSource(host: string): boolean {
    return this.opts.sources.some((s) => s.domain === host) || this.discovered.has(host);
  }

  /** Start of the mock's UTC day (the app's daily-cap window). */
  private dayStart(ts: number): number {
    const day = new Date(ts);
    day.setUTCHours(0, 0, 0, 0);
    return day.getTime();
  }

  /**
   * The app's POST /api/crawler/discoveries: skip never-crawl and
   * already-a-source hosts, create a DISCOVERED source one hop deeper than
   * the reporting one, enabled while within the hop limit and the day's
   * auto-enable cap, stored disabled beyond either. `accepted` counts the
   * hosts stored. Domain validation is the app's job (app-side tests); the
   * mock takes the crawler's hostnames as they come.
   */
  reportDiscoveries(sourceId: string, hosts: string[]): number {
    const rules = this.opts.discovery;
    if (!rules) return 0;
    const parentHops = this.hopsOf(sourceId);
    if (parentHops === null) return 0; // the app requires the parent to exist
    const now = this.now();
    const day = this.dayStart(now);
    const maxPerDay = rules.maxPerDay ?? 200;
    let stored = 0;
    const seen = new Set<string>();
    for (const raw of [...new Set(hosts)]) {
      const host = raw.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
      if (!host || seen.has(host)) continue;
      seen.add(host);
      if ((rules.neverCrawl ?? []).some((n) => host === n || host.endsWith(`.${n}`))) continue;
      if (this.isSource(host)) continue;
      const hops = parentHops + 1;
      const withinHops = hops <= (rules.maxHops ?? 2);
      let enabled = false;
      if (withinHops) {
        const used = this.autoEnabledByDay.get(day) ?? 0;
        if (used < maxPerDay) {
          this.autoEnabledByDay.set(day, used + 1);
          enabled = true;
        }
      }
      this.idCounter += 1;
      this.discovered.set(host, {
        id: `disc-${this.idCounter}`,
        domain: host,
        hops,
        discoveredFromId: sourceId,
        enabled,
        pageBudget: rules.pageBudget ?? 200,
        delayMs: 0,
        createdAt: now,
        disabledReason: enabled ? null : withinHops ? "daily_cap" : "max_hops",
        promotedAt: null,
      });
      stored += 1;
    }
    return stored;
  }

  /** A discovered source that produced a match is promoted (the app's rule). */
  private promoteDiscovered(sourceId: string): void {
    const rules = this.opts.discovery;
    if (!rules) return;
    const source = [...this.discovered.values()].find((s) => s.id === sourceId);
    if (!source) return;
    source.hops = 0;
    source.pageBudget = rules.reportedBudget ?? 2000;
    source.promotedAt = this.now();
  }

  /** What GET /sources answers: the configured sources plus enabled discoveries. */
  private enabledSources(): Source[] {
    const discovered = [...this.discovered.values()]
      .filter((s) => s.enabled)
      .map(discoveredAsSource);
    return [...this.opts.sources, ...discovered];
  }

  private async handle(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const rawBuf = Buffer.concat(chunks);
    this.bodySizes.push(rawBuf.length);
    const raw = rawBuf.toString("utf8");
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    const path = (req.url ?? "").split("?")[0]!;
    this.requests.push({ method: req.method ?? "", path, authorization: req.headers.authorization, body });
    const send = (status: number, json?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(json === undefined ? "" : JSON.stringify(json));
    };
    const route =
      req.method === "GET" && path === "/api/crawler/pool"
        ? "pool"
        : req.method === "GET" && path === "/api/crawler/sources"
          ? "sources"
          : req.method === "POST" && path === "/api/crawler/findings"
            ? "findings"
            : req.method === "POST" && path === "/api/crawler/embeddings"
              ? "embeddings"
              : req.method === "POST" && path === "/api/crawler/frontier/claim"
                ? "claim"
                : req.method === "POST" && path === "/api/crawler/frontier/report"
                  ? "report"
                  : req.method === "POST" && path === "/api/crawler/discoveries"
                    ? "discoveries"
                    : null;
    if (!route) return send(404, { error: "not_found" });
    if (req.headers.authorization !== `Bearer ${this.opts.key}`) return send(401, { error: "unauthorized" });
    const override = this.opts.status?.[route];
    if (override) return send(override, { error: "override" });
    this.calls[route] = (this.calls[route] ?? 0) + 1;
    if ((this.opts.failFirst?.[route] ?? 0) >= this.calls[route]!) return send(500, { error: "flaky" });
    const statusLater = this.opts.statusAfter?.[route];
    if (statusLater && this.calls[route]! > statusLater.after) return send(statusLater.status, { error: "override" });

    if (route === "pool") {
      const later = this.opts.poolAfterFirst;
      return send(200, later && this.calls.pool! > 1 ? later : this.opts.pool);
    }
    if (route === "sources") return send(200, { sources: this.enabledSources() });

    if (route === "claim") {
      const parsed = ServerClaim.safeParse(body);
      if (!parsed.success) {
        this.badRequests.push("claim");
        return send(400, { error: "invalid_body" });
      }
      this.claims.push(parsed.data);
      return send(200, { urls: this.claimFrontier(parsed.data.sourceId, parsed.data.limit) });
    }

    if (route === "report") {
      const parsed = ServerReport.safeParse(body);
      if (!parsed.success) {
        this.badRequests.push("report");
        return send(400, { error: "invalid_body" });
      }
      const statuses: Record<string, number> = {};
      let permanent = 0;
      for (const page of parsed.data.pages) {
        const status = (page as { status?: string }).status ?? "invalid";
        statuses[status] = (statuses[status] ?? 0) + 1;
        if ((page as { failure?: string }).failure === "permanent") permanent += 1;
      }
      const accepted = this.report(parsed.data.sourceId, parsed.data.pages);
      this.reports.push({ sourceId: parsed.data.sourceId, runId: parsed.data.runId, count: parsed.data.pages.length, accepted, statuses, permanent });
      return send(200, { accepted });
    }

    if (route === "discoveries") {
      const parsed = ServerDiscoveries.safeParse(body);
      if (!parsed.success) {
        this.badRequests.push("discoveries");
        return send(400, { error: "invalid_body" });
      }
      const accepted = this.reportDiscoveries(parsed.data.sourceId, parsed.data.hosts);
      this.discoveryReports.push({ sourceId: parsed.data.sourceId, runId: parsed.data.runId, hosts: parsed.data.hosts, accepted });
      return send(200, { accepted });
    }

    // The bodyLimit option is the findings route's (it drives the 413-split
    // test); claim and report bodies are checked against the real limit.
    // Embeddings share the server's 256 KiB cap like every POST body.
    if (Buffer.byteLength(raw) > (this.opts.bodyLimit ?? BODY_LIMIT)) return send(413, { error: "payload_too_large" });

    if (route === "embeddings") {
      const parsed = ServerEmbeddingsEnvelope.safeParse(body);
      if (!parsed.success) {
        this.badRequests.push("embeddings");
        return send(400, { error: "invalid_body" });
      }
      // The app's rules (WP28), mirrored: a known pool id, the deployment's
      // model id + version, and an analyst-confirmed finding at exactly
      // this location; repeats are idempotent.
      const rules = this.opts.sscd;
      const known = new Set((this.opts.poolAfterFirst ?? this.opts.pool).fingerprints.map((f) => f.id));
      const results = parsed.data.embeddings.map((item) => {
        this.postedEmbeddings.push(item);
        if (!known.has(item.fingerprintId)) return { status: "rejected", reason: "fingerprint_not_accepted" };
        if (!rules || item.model !== rules.model || item.version !== rules.version) return { status: "rejected", reason: "model_mismatch" };
        const confirmed = (rules.confirmedFindings ?? []).some(
          (c) => c.fingerprintId === item.fingerprintId && c.pageUrl === item.pageUrl && c.imageUrl === item.imageUrl,
        );
        if (!confirmed) return { status: "rejected", reason: "finding_not_confirmed" };
        const key = `${item.fingerprintId}|${item.pageUrl}|${item.imageUrl}`;
        if (this.storedEmbeddings.has(key)) return { status: "stored", reason: "embedding_exists" };
        this.storedEmbeddings.set(key, item);
        return { status: "stored" };
      });
      return send(200, { results });
    }

    const env = ServerEnvelope.safeParse(body);
    if (!env.success) {
      this.badRequests.push("envelope");
      return send(400, { error: "invalid_body" });
    }
    const known = new Set((this.opts.poolAfterFirst ?? this.opts.pool).fingerprints.map((f) => f.id));
    const notAccepted = new Set(this.opts.notAccepted ?? []);
    const sourceIds = new Set([...this.opts.sources, ...this.enabledSources()].map((s) => s.id));
    const results = env.data.findings.map((item) => {
      const parsed = ServerFinding.safeParse(item);
      if (!parsed.success) return { status: "rejected", reason: "invalid_finding" };
      const f = parsed.data;
      this.posted.push(f);
      if (/^data:/i.test(f.imageUrl) || /^data:/i.test(f.pageUrl)) return { status: "rejected", reason: "media_payload_rejected" };
      if (!/^https?:\/\//.test(f.imageUrl) || !/^https?:\/\//.test(f.pageUrl)) return { status: "rejected", reason: "invalid_url" };
      if (!sourceIds.has(f.sourceId)) return { status: "rejected", reason: "unknown_source" };
      // The server checks the page belongs to the source: same host or a subdomain.
      const src = this.sourceById(f.sourceId)!;
      const domain = (this.opts.sourceDomainOverride ?? src.domain).toLowerCase();
      const host = new URL(f.pageUrl).hostname;
      if (host !== domain && !host.endsWith(`.${domain}`)) return { status: "rejected", reason: "page_not_in_source" };
      if (!known.has(f.fingerprintId) || notAccepted.has(f.fingerprintId)) return { status: "rejected", reason: "fingerprint_not_accepted" };
      const key = `${f.fingerprintId}|${f.imageUrl}`;
      if (this.created.has(key)) return { status: this.opts.legacyStatuses ? "duplicate" : "accepted" };
      this.created.set(key, f);
      // A match under a discovered source promotes it (the app's WP5 rule).
      this.promoteDiscovered(f.sourceId);
      return { status: this.opts.legacyStatuses ? "created" : "accepted" };
    });
    return send(200, { results });
  }
}
