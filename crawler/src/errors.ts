/**
 * Every failure the crawler reports is reduced to a fixed code. Messages from
 * undici, DNS, sharp or Zod can embed hostnames, URLs or values, so they are
 * never logged or surfaced; only the code is.
 */
export const ERROR_CODES = [
  // URL / policy
  "invalid_url",
  "blocked_scheme",
  "blocked_port",
  "url_credentials",
  "blocked_address",
  "dns_failed",
  "too_many_redirects",
  "redirect_invalid",
  "out_of_scope",
  // transport
  "connect_failed",
  "connect_timeout",
  "headers_timeout",
  "body_timeout",
  "tls_failed",
  "network_error",
  "aborted",
  // response
  "http_status",
  "body_too_large",
  "decompression_failed",
  "unsupported_encoding",
  "content_type",
  // images
  "image_sniff_failed",
  "image_format",
  "image_too_many_pixels",
  "image_decode_failed",
  "image_too_small",
  // API
  "api_unauthorized",
  "api_disabled",
  "api_bad_response",
  "api_http_status",
  "api_network",
  "api_redirect",
  "pool_stale",
  // other
  "robots_disallowed",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CrawlError extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(code: ErrorCode, opts: { status?: number; retryable?: boolean; retryAfterMs?: number } = {}) {
    // The message is the code on purpose: nothing variable goes in it.
    super(code);
    this.name = "CrawlError";
    this.code = code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

const SYSCALL_CODES: Record<string, ErrorCode> = {
  ENOTFOUND: "dns_failed",
  EAI_AGAIN: "dns_failed",
  ECONNREFUSED: "connect_failed",
  ECONNRESET: "network_error",
  EPIPE: "network_error",
  ETIMEDOUT: "connect_timeout",
  EHOSTUNREACH: "connect_failed",
  ENETUNREACH: "connect_failed",
  UND_ERR_CONNECT_TIMEOUT: "connect_timeout",
  UND_ERR_HEADERS_TIMEOUT: "headers_timeout",
  UND_ERR_BODY_TIMEOUT: "body_timeout",
  UND_ERR_SOCKET: "network_error",
  UND_ERR_CLOSED: "network_error",
  UND_ERR_ABORTED: "aborted",
  UND_ERR_RES_CONTENT_LENGTH_MISMATCH: "network_error",
  UND_ERR_RESPONSE_EXCEEDED_MAX_SIZE: "body_too_large",
  ERR_BUFFER_TOO_LARGE: "body_too_large",
  Z_DATA_ERROR: "decompression_failed",
  Z_BUF_ERROR: "decompression_failed",
  ERR_PADDING_1: "decompression_failed",
  ABORT_ERR: "aborted",
  ERR_TLS_CERT_ALTNAME_INVALID: "tls_failed",
  CERT_HAS_EXPIRED: "tls_failed",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls_failed",
  SELF_SIGNED_CERT_IN_CHAIN: "tls_failed",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls_failed",
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "connect_failed",
  "connect_timeout",
  "headers_timeout",
  "body_timeout",
  "network_error",
  "dns_failed",
]);

/** Map anything thrown to a CrawlError without keeping its message. */
export function toCrawlError(err: unknown): CrawlError {
  if (err instanceof CrawlError) return err;
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const e = cur as { code?: unknown; name?: unknown; cause?: unknown; errors?: unknown };
    if (e instanceof CrawlError) return e;
    if (typeof e.code === "string" && SYSCALL_CODES[e.code]) {
      const code = SYSCALL_CODES[e.code]!;
      return new CrawlError(code, { retryable: RETRYABLE.has(code) });
    }
    if (e.name === "AbortError" || e.name === "TimeoutError") return new CrawlError("aborted");
    if (Array.isArray(e.errors) && e.errors.length > 0) {
      cur = e.errors[0];
      continue;
    }
    cur = e.cause;
  }
  return new CrawlError("internal");
}
