/**
 * Typed client for the Asmita crawler API.
 *
 * Isolation from crawling: this client has its own undici Agent and builds
 * every URL from the configured ASMITA_API_URL origin; it never accepts a URL
 * from crawl data. Redirects are refused (a 3xx is an error), so the bearer
 * key cannot be carried to another origin. The crawl fetcher
 * (src/net/safe-fetch.ts) never sees the key.
 *
 * Status handling: 503 = crawler switched off (ApiDisabled, the run stops
 * cleanly with exit 0); 401/403 = bad key (exit non-zero); 5xx, 429 and
 * network errors are retried with backoff. POST /findings is retry-safe
 * because the server deduplicates (it answers "accepted" either way).
 */
import { Agent } from "undici";
import { z } from "zod";
import { CrawlError } from "../errors.ts";
import { parseRetryAfter, withRetry } from "../retry.ts";

const HEX64 = /^[0-9a-f]{64}$/;
const ID = z.string().min(1).max(128);

/**
 * One image fingerprint in the pool: the pre-WP20 shape, unchanged (the
 * video-fingerprints spec's video entries are a second shape beside it).
 */
export const PoolImageEntrySchema = z.object({
  id: ID,
  pdq: z.string().regex(HEX64),
  quality: z.number().min(0).max(100),
});
export type PoolImageEntry = z.infer<typeof PoolImageEntrySchema>;

/**
 * One video fingerprint in the pool (video-fingerprints spec WP20): its
 * kept frame hashes, one 64-hex PDQ per frame (vPDQ), at most 1000 — the
 * route's per-submission cap. The id is the video submission's pool id;
 * a match is reported against it like an image match.
 */
export const PoolVideoEntrySchema = z.object({
  id: ID,
  kind: z.literal("video"),
  frames: z.array(z.string().regex(HEX64)).min(1).max(1000),
});
export type PoolVideoEntry = z.infer<typeof PoolVideoEntrySchema>;

export const PoolSchema = z.object({
  version: z.string().min(1).max(200),
  generatedAt: z.iso.datetime({ offset: true }),
  threshold: z.number().int().min(0).max(256),
  fingerprints: z.array(z.union([PoolImageEntrySchema, PoolVideoEntrySchema])),
});
export type Pool = z.infer<typeof PoolSchema>;

/** Whether a pool entry is a video fingerprint (WP20). */
export function isVideoPoolEntry(entry: Pool["fingerprints"][number]): entry is PoolVideoEntry {
  return "kind" in entry && entry.kind === "video";
}

export const SourcesSchema = z.object({
  sources: z.array(
    z.object({
      id: ID,
      kind: z.literal("site"),
      domain: z.string().min(1).max(253),
      pageBudget: z.number().int().min(1).max(100_000),
      delayMs: z.number().int().min(0).max(600_000),
      /** How the site entered the list (crawler v2 WP1). */
      origin: z.enum(["admin", "reported", "discovered"]),
      /** Hops from a human-added or survivor-reported site (WP5). */
      hops: z.number().int().min(0).max(50),
      /**
       * Rendering (WP7): "browser" pages are rendered by Chromium; "auto"
       * pages are rendered only when their HTML has scripts and no image
       * candidates; "http" never (the default, and the old behaviour).
       */
      render: z.enum(["http", "browser", "auto"]),
    }),
  ),
});
export type Source = z.infer<typeof SourcesSchema>["sources"][number];

// --- Frontier (crawler v2 WP3) ------------------------------------------------

/** Run ids the app accepts on findings and frontier reports. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Server contract for POST /api/crawler/frontier/claim, written independently. */
export const FrontierClaimRequestSchema = z.strictObject({
  sourceId: ID,
  limit: z.number().int().min(1).max(200),
});
export type FrontierClaimRequest = z.infer<typeof FrontierClaimRequestSchema>;

export const ClaimedPageSchema = z.strictObject({
  id: ID,
  url: z.url({ protocol: /^https?$/ }),
  depth: z.number().int().min(0).max(50),
  etag: z.string().min(1).max(512).optional(),
  lastModified: z.string().min(1).max(512).optional(),
});
export type ClaimedPage = z.infer<typeof ClaimedPageSchema>;

export const FrontierClaimResponseSchema = z.object({
  urls: z.array(ClaimedPageSchema).max(200),
});

/** One page outcome for POST /api/crawler/frontier/report. */
export const ReportedPageSchema = z
  .strictObject({
    id: ID,
    status: z.enum(["fetched", "not_modified", "gone", "blocked", "error"]),
    etag: z.string().min(1).max(512).optional(),
    lastModified: z.string().min(1).max(512).optional(),
    /**
     * Crawler v3 review fix (WP13): an `error` whose fetch failed permanently
     * (a DNS name that does not exist, a definite certificate failure). The
     * app marks the row dead only when it fails permanently again at least
     * 24 h later; until then it is an ordinary error backoff. Optional on
     * both sides, only with status `error`.
     */
    failure: z.literal("permanent").optional(),
    /**
     * The page's in-scope <link rel="canonical"> targets (crawler v3 WP10),
     * reported as aliases: the app never fetches one. Optional on both sides;
     * at most 20 per page.
     */
    aliases: z.array(z.url({ protocol: /^https?$/ })).max(20).optional(),
    links: z
      .array(
        z.strictObject({
          url: z.url({ protocol: /^https?$/ }),
          kind: z.enum(["page", "sitemap", "feed"]),
          /**
           * Crawler v3 WP11: a pagination link runs before plain pages (the
           * app stores priority 30), and a link out of a sitemap document may
           * carry the entry's <lastmod> as a strict ISO date — an entry newer
           * than the row's last fetch makes the app crawl it at once.
           * Optional on both sides.
           */
          pagination: z.boolean().optional(),
          lastmod: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .max(500),
  })
  .superRefine((page, ctx) => {
    // The server refuses the whole entry otherwise (its schema is strict):
    // catch our own bug before the request leaves.
    if (page.failure !== undefined && page.status !== "error") {
      ctx.addIssue({ code: "custom", path: ["failure"], message: "only with status error" });
    }
  });
export type ReportedPage = z.infer<typeof ReportedPageSchema>;

export const FrontierReportRequestSchema = z.strictObject({
  sourceId: ID,
  runId: z.string().regex(RUN_ID_PATTERN),
  pages: z.array(ReportedPageSchema).min(0).max(200),
});
export type FrontierReportRequest = z.infer<typeof FrontierReportRequestSchema>;

export const FrontierReportResponseSchema = z.object({
  accepted: z.number().int().min(0).max(200),
});

// --- Discovery reporting (crawler v2 WP5) -------------------------------------

/**
 * Server contract for POST /api/crawler/discoveries, written independently:
 * the out-of-scope hosts seen linked from in-scope pages, hosts only, at
 * most 200 per request, deduplicated by the crawler per run.
 */
export const DiscoveriesRequestSchema = z.strictObject({
  sourceId: ID,
  runId: z.string().regex(RUN_ID_PATTERN),
  hosts: z.array(z.string().min(1).max(253)).max(200),
});
export type DiscoveriesRequest = z.infer<typeof DiscoveriesRequestSchema>;

export const DiscoveriesResponseSchema = z.object({
  accepted: z.number().int().min(0).max(200),
});

/**
 * The server validates findings strictly (no extra fields at envelope or
 * item level). The same rules are applied here before sending, so a
 * malformed finding is dropped locally instead of failing a whole batch.
 */
export const FindingSchema = z.strictObject({
  fingerprintId: ID,
  // No length cap beyond the batch byte limit (the contract sets none).
  pageUrl: z.url({ protocol: /^https?$/ }),
  imageUrl: z.url({ protocol: /^https?$/ }),
  distance: z.number().int().min(0).max(31),
  quality: z.number().min(0).max(100),
  observedAt: z.iso.datetime({ offset: true }),
  sourceId: ID,
});
export type Finding = z.infer<typeof FindingSchema>;
export const FindingsRequestSchema = z.strictObject({
  runId: z.string().regex(RUN_ID_PATTERN),
  findings: z.array(FindingSchema).min(1).max(50),
});

/** Per-item rejection reasons the server can return. */
export const REJECT_REASONS = [
  "invalid_finding",
  "media_payload_rejected",
  "invalid_url",
  "unknown_source",
  "fingerprint_not_accepted",
  // The page is not inside the source's scope: a crawler scope bug.
  "page_not_in_source",
] as const;

export const FindingsResponseSchema = z.object({
  results: z.array(
    z.object({
      // "accepted" | "rejected". During the server rollout the old
      // "created" / "duplicate" statuses are still tolerated and treated as
      // "accepted" (the server no longer tells the two apart).
      status: z
        .enum(["accepted", "rejected", "created", "duplicate"])
        .transform((s): "accepted" | "rejected" => (s === "rejected" ? "rejected" : "accepted")),
      reason: z.string().max(500).optional(),
    }),
  ),
});
export type FindingResult = z.infer<typeof FindingsResponseSchema>["results"][number];

export const MAX_FINDINGS_PER_CALL = 50;
/** Server body limit is 256 KiB; batches are cut below it with headroom. */
export const MAX_FINDINGS_BODY_BYTES = 240 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024; // pools can be large; still bounded

export type AsmitaClientConfig = {
  baseUrl: string;
  serviceKey: string;
  userAgent: string;
  timeoutMs: number;
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export class AsmitaClient {
  private readonly agent: Agent;
  private readonly origin: URL;

  constructor(private readonly config: AsmitaClientConfig) {
    this.origin = new URL(config.baseUrl);
    this.agent = new Agent({ headersTimeout: config.timeoutMs, bodyTimeout: config.timeoutMs, connections: 2 });
  }

  getPool(signal?: AbortSignal): Promise<Pool> {
    return this.call("GET", "/api/crawler/pool", undefined, PoolSchema, signal);
  }

  getSources(signal?: AbortSignal): Promise<Source[]> {
    return this.call("GET", "/api/crawler/sources", undefined, SourcesSchema, signal).then((r) => r.sources);
  }

  /**
   * The next batch of due pages for one source (WP3): claimed for 30 minutes,
   * so a second process gets different rows. An empty batch means the source
   * has nothing due (or is unknown/disabled: the app answers empty, not 400).
   */
  claimFrontier(sourceId: string, limit: number, signal?: AbortSignal): Promise<ClaimedPage[]> {
    const body = { sourceId, limit };
    if (!FrontierClaimRequestSchema.safeParse(body).success) throw new CrawlError("internal");
    return this.call("POST", "/api/crawler/frontier/claim", body, FrontierClaimResponseSchema, signal).then((r) => r.urls);
  }

  /**
   * Reports one entry per claimed page. Retry-safe: a report the server
   * applied but we never saw answered only moves schedules forward; the
   * per-source digest dedups links. Validated locally with the server's
   * rules so our bug never sends a 400-worthy body.
   */
  reportFrontier(sourceId: string, runId: string, pages: ReportedPage[], signal?: AbortSignal): Promise<number> {
    const body = { sourceId, runId, pages };
    if (!FrontierReportRequestSchema.safeParse(body).success) throw new CrawlError("internal");
    return this.call("POST", "/api/crawler/frontier/report", body, FrontierReportResponseSchema, signal).then((r) => r.accepted);
  }

  /**
   * Reports the out-of-scope hosts linked from in-scope pages (WP5): hosts
   * only, at most 200 per request, deduplicated per run before this call.
   * The app decides which become sources; an empty list is never sent.
   * Best-effort by design: a failed report loses nothing but the chance of
   * these hosts becoming sources this run — the pages that linked them stay
   * in the frontier, so a later run reports them again.
   */
  async reportDiscoveries(sourceId: string, runId: string, hosts: string[], signal?: AbortSignal): Promise<number> {
    if (hosts.length === 0) return 0;
    const body = { sourceId, runId, hosts };
    if (!DiscoveriesRequestSchema.safeParse(body).success) throw new CrawlError("internal");
    return this.call("POST", "/api/crawler/discoveries", body, DiscoveriesResponseSchema, signal).then((r) => r.accepted);
  }

  async postFindings(runId: string, findings: Finding[], signal?: AbortSignal): Promise<FindingResult[]> {
    if (findings.length === 0) return [];
    const body = { runId, findings };
    // Never send something the server would 400 on: that would be our bug.
    if (!FindingsRequestSchema.safeParse(body).success) throw new CrawlError("internal");
    const res = await this.call("POST", "/api/crawler/findings", body, FindingsResponseSchema, signal);
    if (res.results.length !== findings.length) throw new CrawlError("api_bad_response");
    return res.results;
  }

  private call<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Path is a constant from this file, appended to the configured base path.
    const url = new URL(this.origin.pathname.replace(/\/$/, "") + path, this.origin);
    return withRetry(
      async () => {
        let res;
        const timeout = AbortSignal.timeout(this.config.timeoutMs);
        try {
          res = await this.agent.request({
            origin: this.origin.origin,
            path: url.pathname,
            method,
            headers: {
              authorization: `Bearer ${this.config.serviceKey}`,
              "user-agent": this.config.userAgent,
              accept: "application/json",
              ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            body: body === undefined ? null : JSON.stringify(body),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        } catch {
          // Never surface the underlying message (it names the origin).
          throw signal?.aborted ? new CrawlError("aborted") : new CrawlError("api_network", { retryable: true });
        }
        const { statusCode, headers } = res;
        let text: string;
        try {
          text = await readText(res.body, MAX_RESPONSE_BYTES);
        } catch {
          throw new CrawlError("api_network", { retryable: true });
        }
        if (statusCode === 503) throw new CrawlError("api_disabled", { status: 503 });
        if (statusCode === 401 || statusCode === 403) throw new CrawlError("api_unauthorized", { status: statusCode });
        if (statusCode >= 300 && statusCode < 400) throw new CrawlError("api_redirect", { status: statusCode });
        // 400 = our request was malformed (a bug): never retried.
        if (statusCode === 400) throw new CrawlError("api_bad_request", { status: 400 });
        // 413 = batch too large: the findings sink splits it and resends.
        if (statusCode === 413) throw new CrawlError("api_payload_too_large", { status: 413 });
        if (statusCode < 200 || statusCode >= 300) {
          throw new CrawlError("api_http_status", {
            status: statusCode,
            retryable: statusCode === 429 || statusCode >= 500,
            retryAfterMs: parseRetryAfter(headers["retry-after"]),
          });
        }
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new CrawlError("api_bad_response");
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) throw new CrawlError("api_bad_response");
        return parsed.data;
      },
      {
        attempts: this.config.attempts,
        baseDelayMs: this.config.baseDelayMs,
        maxDelayMs: this.config.maxDelayMs,
        signal,
      },
    );
  }

  async close(): Promise<void> {
    await this.agent.close().catch(() => undefined);
  }
}

async function readText(stream: AsyncIterable<Uint8Array> & { destroy(): void }, max: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of stream) {
    total += c.byteLength;
    if (total > max) {
      stream.destroy();
      throw new CrawlError("body_too_large");
    }
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks).toString("utf8");
}
