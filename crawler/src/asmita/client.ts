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

export const PoolSchema = z.object({
  version: z.string().min(1).max(200),
  generatedAt: z.iso.datetime({ offset: true }),
  threshold: z.number().int().min(0).max(256),
  fingerprints: z.array(
    z.object({
      id: ID,
      pdq: z.string().regex(HEX64),
      quality: z.number().min(0).max(100),
    }),
  ),
});
export type Pool = z.infer<typeof PoolSchema>;

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
export const ReportedPageSchema = z.strictObject({
  id: ID,
  status: z.enum(["fetched", "not_modified", "gone", "blocked", "error"]),
  etag: z.string().min(1).max(512).optional(),
  lastModified: z.string().min(1).max(512).optional(),
  links: z
    .array(
      z.strictObject({
        url: z.url({ protocol: /^https?$/ }),
        kind: z.enum(["page", "sitemap", "feed"]),
      }),
    )
    .max(500),
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
