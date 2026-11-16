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
 * because the server reports already-recorded findings as "duplicate".
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
    }),
  ),
});
export type Source = z.infer<typeof SourcesSchema>["sources"][number];

export type Finding = {
  fingerprintId: string;
  pageUrl: string;
  imageUrl: string;
  distance: number;
  quality: number;
  observedAt: string;
  sourceId: string;
};

export const FindingsResponseSchema = z.object({
  results: z.array(
    z.object({
      status: z.enum(["created", "duplicate", "rejected"]),
      reason: z.string().max(500).optional(),
    }),
  ),
});
export type FindingResult = z.infer<typeof FindingsResponseSchema>["results"][number];

export const MAX_FINDINGS_PER_CALL = 50;
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

  async postFindings(runId: string, findings: Finding[], signal?: AbortSignal): Promise<FindingResult[]> {
    if (findings.length === 0) return [];
    if (findings.length > MAX_FINDINGS_PER_CALL) throw new CrawlError("internal");
    const res = await this.call("POST", "/api/crawler/findings", { runId, findings }, FindingsResponseSchema, signal);
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
