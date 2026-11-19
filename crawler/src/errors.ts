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
  "dns_not_found",
  "dns_failed",
  "too_many_redirects",
  "redirect_invalid",
  "out_of_scope",
  "image_host_cap",
  "image_host_failures",
  // transport
  "connect_failed",
  "connect_timeout",
  "headers_timeout",
  "body_timeout",
  "tls_failed",
  /**
   * A certificate the crawler could not verify for a reason that usually
   * lies with the crawler's own environment, not the site: a missing local
   * issuer (no CA bundle, a TLS-intercepting middlebox) or a non-TLS answer
   * on the TLS port (ERR_SSL_WRONG_VERSION_NUMBER, a proxy). Temporary
   * (review fix): never a reason to give a page up.
   */
  "tls_unverified",
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
  "image_truncated",
  "image_decode_timeout",
  "image_decoder_crashed",
  "image_too_small",
  // API
  "api_unauthorized",
  "api_disabled",
  "api_bad_response",
  "api_http_status",
  "api_network",
  "api_redirect",
  "api_bad_request",
  "api_payload_too_large",
  "finding_invalid",
  "pool_stale",
  // browser rendering (WP7)
  "browser_launch_failed",
  "browser_failed",
  "browser_aborted",
  "browser_timeout",
  "browser_protocol",
  /** The browser proxy refused a tunnel opened outside any render. */
  "browser_no_render",
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
  ENOTFOUND: "dns_not_found",
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
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "tls_unverified",
  UNABLE_TO_GET_ISSUER_CERT: "tls_failed",
  CERT_NOT_YET_VALID: "tls_failed",
  CERT_UNTRUSTED: "tls_failed",
  ERR_SSL_WRONG_VERSION_NUMBER: "tls_unverified",
};

// WP13: a name that does not exist is permanent, so it is never retried in
// this run either. EAI_AGAIN (and every other resolver failure, see
// net/policy.ts) stays "dns_failed" and keeps its retry.
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "connect_failed",
  "connect_timeout",
  "headers_timeout",
  "body_timeout",
  "network_error",
  "dns_failed",
  // Review fix: an environment-type TLS failure is temporary, so it keeps
  // its in-run retry like every other temporary failure.
  "tls_unverified",
]);

/**
 * Fetch-failure classes (crawler v3 WP13, review fix). Permanent failures —
 * a DNS name that does not exist, a definite certificate failure (expired,
 * wrong name, self-signed) — cannot be fixed by retrying in this run, so
 * they are never retried in-run; the page is reported `error` with the
 * `permanent` hint, and the app marks the row dead only when the same row
 * fails permanently again at least 24 h later (one bad resolver answer or
 * one bad hour never kills a page). Environment-type TLS failures
 * (tls_unverified) are temporary. Temporary failures —
 * timeouts, connection resets and connection refusals, 5xx answers — keep
 * the existing 1 h / 6 h / 24 h backoff; 429/503 are temporary too and keep
 * today's treatment exactly (in-run retry with Retry-After, `error` at the
 * app). Everything else (scope, robots, caps, decode, API...) has no class.
 */
export type FailureClass = "permanent" | "temporary";

const PERMANENT_FETCH_FAILURES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["dns_not_found", "tls_failed"]);
const TEMPORARY_FETCH_FAILURES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "tls_unverified",
  "dns_failed",
  "connect_failed",
  "connect_timeout",
  "headers_timeout",
  "body_timeout",
  "network_error",
]);

/** The class of a fetch failure (WP13), or null when the error is not one. */
export function fetchFailureClass(err: { code: ErrorCode; status?: number | undefined }): FailureClass | null {
  if (PERMANENT_FETCH_FAILURES.has(err.code)) return "permanent";
  if (TEMPORARY_FETCH_FAILURES.has(err.code)) return "temporary";
  if (err.code === "http_status") {
    // 5xx and 429/503 are temporary; other statuses have their own mapping
    // (404/410 gone, 401/403 blocked) and no class of their own.
    return err.status !== undefined && (err.status >= 500 || err.status === 429) ? "temporary" : null;
  }
  return null;
}

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
