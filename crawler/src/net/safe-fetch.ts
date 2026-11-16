/**
 * The only way the crawler talks to crawled hosts.
 *
 * SSRF guard, enforced at connect time (not as a pre-check):
 *   undici calls our connector for every new socket. The connector resolves
 *   the hostname itself, rejects the connection if ANY resolved address is
 *   blocked, then dials the validated IP literal while passing the original
 *   hostname as TLS `servername` (SNI and certificate name check). The Host
 *   header comes from the request origin, so virtual hosting still works.
 *   Because the address that is checked is the address that is dialled,
 *   there is no window for DNS rebinding between check and connect.
 *
 * Every redirect hop is re-parsed and re-checked (scheme, port, credentials,
 * literal address) and its connection goes through the same connector.
 * Requests carry no cookies or authorisation (undici has no cookie jar and we
 * set no such header). Bodies are capped while streaming and again after
 * decompression. This fetcher never sees the Asmita service key: the Asmita
 * client (src/asmita/client.ts) uses its own dispatcher.
 */
import { isIP } from "node:net";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { Agent, buildConnector } from "undici";
import { CrawlError, toCrawlError } from "../errors.ts";
import { parseRetryAfter } from "../retry.ts";
import { bareHost, checkUrl, resolveAllowed, type NetPolicy } from "./policy.ts";

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);
const brotli = promisify(zlib.brotliDecompress);

export type SafeFetchConfig = {
  userAgent: string;
  connectTimeoutMs: number;
  headersTimeoutMs: number;
  /** Idle time allowed between body chunks. */
  bodyTimeoutMs: number;
  /** Hard deadline for one hop, headers and body together (stops slow drips). */
  totalTimeoutMs: number;
  maxRedirects: number;
};

export type FetchKind = "html" | "image" | "robots";

export type FetchOptions = {
  kind: FetchKind;
  maxBytes: number;
  accept: string;
  signal?: AbortSignal | undefined;
  /**
   * Called before every hop, including the first. Throw to refuse the hop
   * (scope, robots); await to wait for the host's politeness slot.
   */
  beforeHop?: (url: URL, hop: number) => Promise<void>;
  /**
   * Wraps the network part of each hop (global concurrency cap). Applied
   * after beforeHop, so a politeness wait does not hold a slot.
   */
  gate?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type FetchResult = {
  url: URL;
  status: number;
  /** Lower-cased media type without parameters, "" if missing. */
  contentType: string;
  body: Buffer;
  xRobotsTag: string;
};

export class SafeFetcher {
  private readonly agent: Agent;

  constructor(
    private readonly policy: NetPolicy,
    private readonly config: SafeFetchConfig,
  ) {
    const base = buildConnector({ timeout: config.connectTimeoutMs, allowH2: false, rejectUnauthorized: true });
    this.agent = new Agent({
      headersTimeout: config.headersTimeoutMs,
      bodyTimeout: config.bodyTimeoutMs,
      connections: 2,
      connect: (opts, callback) => {
        const host = bareHost(opts.hostname);
        resolveAllowed(host, policy).then(
          (addr) => {
            base(
              {
                ...opts,
                hostname: addr.address,
                // SNI and certificate verification use the real hostname.
                servername: isIP(host) === 0 ? host : "",
              },
              callback,
            );
          },
          (err: unknown) => callback(toCrawlError(err), null),
        );
      },
    });
  }

  async fetch(input: string | URL, opts: FetchOptions): Promise<FetchResult> {
    let url = checkUrl(input, this.policy);
    for (let hop = 0; ; hop++) {
      if (hop > this.config.maxRedirects) throw new CrawlError("too_many_redirects");
      if (opts.beforeHop) await opts.beforeHop(url, hop);
      const hopUrl = url;
      const result = opts.gate ? await opts.gate(() => this.fetchHop(hopUrl, opts)) : await this.fetchHop(hopUrl, opts);
      if (result.kind === "redirect") {
        let next: URL;
        try {
          next = new URL(result.location, url);
        } catch {
          throw new CrawlError("redirect_invalid");
        }
        url = checkUrl(next, this.policy);
        continue;
      }
      return result.value;
    }
  }

  private async fetchHop(
    url: URL,
    opts: FetchOptions,
  ): Promise<{ kind: "redirect"; location: string } | { kind: "done"; value: FetchResult }> {
    const deadline = AbortSignal.timeout(this.config.totalTimeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    let res;
    try {
      res = await this.agent.request({
        origin: url.origin,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          "user-agent": this.config.userAgent,
          accept: opts.accept,
          "accept-encoding": "gzip, deflate, br",
        },
        signal,
      });
    } catch (err) {
      throw toCrawlError(err);
    }
    const { statusCode, headers, body } = res;
    try {
      if (statusCode >= 300 && statusCode < 400 && statusCode !== 304) {
        const location = header(headers.location);
        if (!location) throw new CrawlError("redirect_invalid");
        return { kind: "redirect", location };
      }
      if (statusCode < 200 || statusCode >= 300) {
        throw new CrawlError("http_status", {
          status: statusCode,
          retryable: statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504,
          retryAfterMs: parseRetryAfter(headers["retry-after"]),
        });
      }
      const declared = Number(header(headers["content-length"]) ?? "NaN");
      if (Number.isFinite(declared) && declared > opts.maxBytes) throw new CrawlError("body_too_large");
      const raw = await readCapped(body, opts.maxBytes);
      const decoded = await decode(raw, header(headers["content-encoding"]), opts.maxBytes);
      return {
        kind: "done",
        value: {
          url,
          status: statusCode,
          contentType: (header(headers["content-type"]) ?? "").split(";")[0]!.trim().toLowerCase(),
          body: decoded,
          xRobotsTag: (header(headers["x-robots-tag"]) ?? "").toLowerCase(),
        },
      };
    } catch (err) {
      throw deadline.aborted && !opts.signal?.aborted ? new CrawlError("body_timeout", { retryable: true }) : toCrawlError(err);
    } finally {
      // Release the socket; a no-op once the body has been fully read.
      // undici emits "aborted" on an unread body we destroy; it is expected.
      body.on("error", () => undefined);
      if (!body.destroyed) body.destroy();
    }
  }

  async close(): Promise<void> {
    await this.agent.close().catch(() => undefined);
  }
}

function header(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Read a body stream into memory, aborting as soon as it exceeds maxBytes. */
export async function readCapped(stream: AsyncIterable<Uint8Array> & { destroy(): void }, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw new CrawlError("body_too_large");
    }
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
  return Buffer.concat(chunks, total);
}

/**
 * Undo Content-Encoding with the same byte cap on the inflated output, so a
 * small compressed body cannot expand into gigabytes (decompression bomb).
 * Stacked encodings ("gzip, br") are refused rather than unwound.
 */
export async function decode(raw: Buffer, encoding: string | undefined, maxBytes: number): Promise<Buffer> {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "" || enc === "identity") return raw;
  if (enc.includes(",")) throw new CrawlError("unsupported_encoding");
  const limit = { maxOutputLength: maxBytes };
  try {
    switch (enc) {
      case "gzip":
      case "x-gzip":
        return await gunzip(raw, limit);
      case "br":
        return await brotli(raw, limit);
      case "deflate":
        // Some servers send raw deflate under this name.
        return await inflate(raw, limit).catch((err: unknown) => {
          if (isTooLarge(err)) throw err;
          return inflateRaw(raw, limit);
        });
      default:
        throw new CrawlError("unsupported_encoding");
    }
  } catch (err) {
    if (err instanceof CrawlError) throw err;
    if (isTooLarge(err)) throw new CrawlError("body_too_large");
    throw new CrawlError("decompression_failed");
  }
}

function isTooLarge(err: unknown): boolean {
  return (
    err instanceof RangeError ||
    (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE")
  );
}
