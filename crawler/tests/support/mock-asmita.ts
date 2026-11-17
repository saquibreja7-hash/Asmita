/**
 * A mock of the Asmita crawler API on 127.0.0.1: GET pool, GET sources,
 * POST findings, and (crawler v2 WP3) the frontier routes POST
 * /api/crawler/frontier/{claim,report}. Records every request so tests can
 * assert on what the crawler sent, including the Authorization header.
 *
 * The frontier half mirrors the app's rules (asmita/src/lib/crawl-pages.ts)
 * on purpose: the seed created on first claim, rows claimed for 30 minutes,
 * the daily page budget, the visit schedule (24 h after fetched, doubling
 * after not_modified up to 14 days, error backoff 1 h / 6 h / 24 h and dead
 * after five, gone dead) and the per-source digest dedup of reported links
 * with the app's in-scope check. It is written out independently so drift
 * between the crawler and the app's contract shows up as a test failure.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import type { Finding, Pool, Source } from "../../src/asmita/client.ts";

/**
 * The server's request contract, written out independently of the client's
 * schema so client drift shows up as a 400 in tests.
 */
const ServerFinding = z.strictObject({
  fingerprintId: z.string().min(1),
  pageUrl: z.string().min(1),
  imageUrl: z.string().min(1),
  distance: z.number().int().min(0).max(31),
  quality: z.number().min(0).max(100),
  observedAt: z.iso.datetime({ offset: true }),
  sourceId: z.string().min(1),
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
});
const ServerReportPage = z.strictObject({
  id: z.string().min(1),
  status: z.enum(["fetched", "not_modified", "gone", "blocked", "error"]),
  etag: z.string().min(1).max(512).optional(),
  lastModified: z.string().min(1).max(512).optional(),
  links: z.array(ServerReportLink).max(500),
});
const ServerReport = z.strictObject({
  sourceId: z.string().min(1),
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  pages: z.array(z.unknown()).min(0).max(200),
});
const BODY_LIMIT = 256 * 1024;

/** The tracking-parameter rule of the app's digest key (crawl-pages.ts). */
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;

/** The app's digest key of a page URL: tracking params stripped, rest sorted. */
function pageKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  if (url.pathname === "") url.pathname = "/";
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

type MockPage = {
  id: string;
  sourceId: string;
  url: string;
  urlDigest: string;
  depth: number;
  etag: string | null;
  lastModified: string | null;
  status: "PENDING" | "FETCHED" | "NOT_MODIFIED" | "GONE" | "BLOCKED" | "ERROR" | "DEAD";
  claimedUntil: number | null;
  lastFetchedAt: number | null;
  nextDueAt: number;
  failCount: number;
};

export type MockRequest = { method: string; path: string; authorization: string | undefined; body: unknown };

export type MockAsmitaOptions = {
  key: string;
  pool: Pool;
  sources: Source[];
  /** Override status for a route ("pool" | "sources" | "findings" | "claim" | "report"), e.g. 503. */
  status?: Partial<Record<"pool" | "sources" | "findings" | "claim" | "report", number>>;
  /** Fail the first N calls of a route with 500. */
  failFirst?: Partial<Record<"pool" | "sources" | "findings" | "claim" | "report", number>>;
  /** Pool served from the second pool request on (simulates a re-sync change). */
  poolAfterFirst?: Pool;
  /** Fingerprint ids the server answers "fingerprint_not_accepted" for. */
  notAccepted?: string[];
  /** Body size limit for POST bodies (default 256 KiB, 413 above). */
  bodyLimit?: number;
  /** Answer with the pre-rollout statuses "created" / "duplicate". */
  legacyStatuses?: boolean;
  /** Treat this source's domain as something else (simulates a scope mismatch). */
  sourceDomainOverride?: string;
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
  /** Every report, in order, with its page statuses and accepted count. */
  readonly reports: Array<{ sourceId: string; runId: string; count: number; accepted: number; statuses: Record<string, number> }> = [];
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

  private insertPage(sourceId: string, url: string, depth: number): void {
    const digest = this.digest(sourceId, url);
    if (digest === null) return;
    if (this.rowsOf(sourceId).some((p) => p.urlDigest === digest)) return;
    this.idCounter += 1;
    const id = `page-${this.idCounter}`;
    this.pages.set(id, {
      id, sourceId, url, urlDigest: digest, depth, etag: null, lastModified: null,
      status: "PENDING", claimedUntil: null, lastFetchedAt: null, nextDueAt: 0, failCount: 0,
    });
  }

  /** The app's claim: seed on first claim, daily budget, 30-minute claims. Public so tests can claim directly. */
  claimFrontier(sourceId: string, limit: number): Array<{ id: string; url: string; depth: number; etag?: string; lastModified?: string }> {
    const source = this.opts.sources.find((s) => s.id === sourceId);
    if (!source) return [];
    const now = this.now();
    if (this.rowsOf(sourceId).length === 0) {
      const seedUrl = this.opts.seedUrl ? this.opts.seedUrl(source) : `https://${source.domain}/`;
      this.insertPage(sourceId, seedUrl, 0);
    }
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const fetchedToday = this.rowsOf(sourceId).filter((p) => p.lastFetchedAt !== null && p.lastFetchedAt >= dayStart.getTime()).length;
    const take = Math.min(limit, source.pageBudget - fetchedToday);
    if (take <= 0) return [];
    const due = this.rowsOf(sourceId)
      .filter((p) => p.nextDueAt <= now && p.status !== "DEAD" && p.status !== "GONE" && (p.claimedUntil === null || p.claimedUntil < now))
      .sort((a, b) => a.nextDueAt - b.nextDueAt)
      .slice(0, take);
    for (const row of due) row.claimedUntil = now + CLAIM_MS;
    return due.map((p) => ({
      id: p.id, url: p.url, depth: p.depth,
      ...(p.etag !== null ? { etag: p.etag } : {}),
      ...(p.lastModified !== null ? { lastModified: p.lastModified } : {}),
    }));
  }

  /** The app's report: scheduling, link storage with the in-scope check. */
  private report(sourceId: string, pages: unknown[]): number {
    const source = this.opts.sources.find((s) => s.id === sourceId);
    if (!source) return 0;
    const now = this.now();
    const domain = (this.opts.sourceDomainOverride ?? source.domain).toLowerCase();
    let accepted = 0;
    for (const raw of pages) {
      const checked = ServerReportPage.safeParse(raw);
      if (!checked.success) continue;
      const entry = checked.data;
      const row = this.pages.get(entry.id);
      if (!row || row.sourceId !== sourceId || row.status === "DEAD" || row.status === "GONE") continue;
      accepted += 1;
      row.etag = entry.etag ?? row.etag;
      row.lastModified = entry.lastModified ?? row.lastModified;
      row.claimedUntil = null;
      switch (entry.status) {
        case "fetched":
          row.status = "FETCHED";
          row.lastFetchedAt = now;
          row.nextDueAt = now + DAY;
          row.failCount = 0;
          break;
        case "not_modified": {
          const previous = row.lastFetchedAt !== null ? Math.max(row.nextDueAt - row.lastFetchedAt, 0) : DAY;
          const interval = Math.min(Math.max(previous * 2, DAY), 14 * DAY);
          row.status = "NOT_MODIFIED";
          row.lastFetchedAt = now;
          row.nextDueAt = now + interval;
          row.failCount = 0;
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
          if (row.failCount >= 5) row.status = "DEAD";
          else {
            row.status = "ERROR";
            row.nextDueAt = now + (row.failCount === 1 ? HOUR : row.failCount === 2 ? 6 * HOUR : DAY);
          }
          break;
        }
      }
      for (const link of entry.links) {
        let host: string;
        try {
          const url = new URL(link.url);
          if (url.protocol !== "http:" && url.protocol !== "https:") continue;
          // The app also refuses non-default ports (crawl-pages.ts); the
          // fixture site lives on one, so the mock checks only the scheme
          // and credentials here. The port rule is covered by the app-side
          // unit tests (crawl-frontier.test.ts).
          if (url.username !== "" || url.password !== "") continue;
          host = url.hostname;
        } catch {
          continue;
        }
        if (host !== domain && !host.endsWith(`.${domain}`)) continue; // the app's in-scope check
        this.insertPage(sourceId, link.url, row.depth + 1);
      }
    }
    return accepted;
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
            : req.method === "POST" && path === "/api/crawler/frontier/claim"
              ? "claim"
              : req.method === "POST" && path === "/api/crawler/frontier/report"
                ? "report"
                : null;
    if (!route) return send(404, { error: "not_found" });
    if (req.headers.authorization !== `Bearer ${this.opts.key}`) return send(401, { error: "unauthorized" });
    const override = this.opts.status?.[route];
    if (override) return send(override, { error: "override" });
    this.calls[route] = (this.calls[route] ?? 0) + 1;
    if ((this.opts.failFirst?.[route] ?? 0) >= this.calls[route]!) return send(500, { error: "flaky" });

    if (route === "pool") {
      const later = this.opts.poolAfterFirst;
      return send(200, later && this.calls.pool! > 1 ? later : this.opts.pool);
    }
    if (route === "sources") return send(200, { sources: this.opts.sources });
    if (Buffer.byteLength(raw) > (this.opts.bodyLimit ?? BODY_LIMIT)) return send(413, { error: "payload_too_large" });

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
      for (const page of parsed.data.pages) {
        const status = (page as { status?: string }).status ?? "invalid";
        statuses[status] = (statuses[status] ?? 0) + 1;
      }
      const accepted = this.report(parsed.data.sourceId, parsed.data.pages);
      this.reports.push({ sourceId: parsed.data.sourceId, runId: parsed.data.runId, count: parsed.data.pages.length, accepted, statuses });
      return send(200, { accepted });
    }

    const env = ServerEnvelope.safeParse(body);
    if (!env.success) {
      this.badRequests.push("envelope");
      return send(400, { error: "invalid_body" });
    }
    const known = new Set((this.opts.poolAfterFirst ?? this.opts.pool).fingerprints.map((f) => f.id));
    const notAccepted = new Set(this.opts.notAccepted ?? []);
    const sourceIds = new Set(this.opts.sources.map((s) => s.id));
    const results = env.data.findings.map((item) => {
      const parsed = ServerFinding.safeParse(item);
      if (!parsed.success) return { status: "rejected", reason: "invalid_finding" };
      const f = parsed.data;
      this.posted.push(f);
      if (/^data:/i.test(f.imageUrl) || /^data:/i.test(f.pageUrl)) return { status: "rejected", reason: "media_payload_rejected" };
      if (!/^https?:\/\//.test(f.imageUrl) || !/^https?:\/\//.test(f.pageUrl)) return { status: "rejected", reason: "invalid_url" };
      if (!sourceIds.has(f.sourceId)) return { status: "rejected", reason: "unknown_source" };
      // The server checks the page belongs to the source: same host or a subdomain.
      const src = this.opts.sources.find((s) => s.id === f.sourceId)!;
      const domain = (this.opts.sourceDomainOverride ?? src.domain).toLowerCase();
      const host = new URL(f.pageUrl).hostname;
      if (host !== domain && !host.endsWith(`.${domain}`)) return { status: "rejected", reason: "page_not_in_source" };
      if (!known.has(f.fingerprintId) || notAccepted.has(f.fingerprintId)) return { status: "rejected", reason: "fingerprint_not_accepted" };
      const key = `${f.fingerprintId}|${f.imageUrl}`;
      if (this.created.has(key)) return { status: this.opts.legacyStatuses ? "duplicate" : "accepted" };
      this.created.set(key, f);
      return { status: this.opts.legacyStatuses ? "created" : "accepted" };
    });
    return send(200, { results });
  }
}
