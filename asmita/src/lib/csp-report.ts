/*
 * CSP violation report parsing (WP46 S5). Browsers POST violation reports to
 * /api/csp-report in one of two shapes:
 *
 *  - legacy report-uri: Content-Type application/csp-report, body
 *    {"csp-report": { "document-uri": ..., "blocked-uri": ... }}
 *  - Reporting API: Content-Type application/reports+json, body an array of
 *    typed reports; CSP violations arrive as { type: "csp-violation", ... }.
 *
 * Reports are untrusted telemetry: any site can make a browser POST here, so
 * only three fields are ever read, every URL is reduced to an origin or a
 * path (query strings and fragments stripped before anything is logged), and
 * cookies, bodies, user agents and script samples never reach the log.
 */

/** Hard cap on one report request (S5). */
export const MAX_CSP_REPORT_BYTES = 8 * 1024;
/** Per-network reports per window; reports are best-effort, drops are free. */
export const CSP_REPORTS_PER_10_MINUTES = 60;
export const CSP_REPORT_WINDOW_MS = 10 * 60_000;

export const CSP_REPORT_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
] as const;

export type CspViolationSummary = {
  directive: string;
  blockedOrigin: string;
  documentPath: string;
};

const MAX_URL_CHARS = 2048;
const MAX_DIRECTIVE_CHARS = 128;
/** CSP's fixed non-URL blocked-uri tokens, e.g. "inline" and "eval". */
const TOKEN_PATTERN = /^[\w-]{1,32}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Origin for http(s) URLs, the raw token for CSP's fixed non-URL values, else "". */
function originOrToken(value: unknown): string {
  const raw = text(value);
  if (!raw || raw.length > MAX_URL_CHARS) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // Not a URL; fall through to the token check.
  }
  return TOKEN_PATTERN.test(raw) ? raw : "";
}

/** Path only — query and fragment are dropped; only page URLs are kept. */
function documentPath(value: unknown): string {
  const raw = text(value);
  if (!raw || raw.length > MAX_URL_CHARS) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.pathname;
  } catch {
    return "";
  }
}

function summarize(directive: unknown, effectiveDirective: unknown, blocked: unknown, document: unknown): CspViolationSummary | null {
  const resolved = text(effectiveDirective) || text(directive);
  if (!resolved || resolved.length > MAX_DIRECTIVE_CHARS) return null;
  return {
    directive: resolved,
    blockedOrigin: originOrToken(blocked),
    documentPath: documentPath(document),
  };
}

function summarizeLegacyReport(payload: Record<string, unknown>): CspViolationSummary | null {
  const report = payload["csp-report"];
  if (!report || typeof report !== "object") return null;
  const fields = report as Record<string, unknown>;
  return summarize(
    fields["violated-directive"],
    fields["effective-directive"],
    fields["blocked-uri"],
    fields["document-uri"],
  );
}

function summarizeReportingApiReport(item: Record<string, unknown>): CspViolationSummary | null {
  const body = item.body;
  if (!body || typeof body !== "object") return null;
  const fields = body as Record<string, unknown>;
  return summarize(
    fields.violatedDirective,
    fields.effectiveDirective,
    fields.blockedURL,
    fields.documentURL ?? item.url,
  );
}

/**
 * Extracts the logged fields from a report body. Returns null when the body
 * is not a CSP report at all (not JSON, wrong shape); non-CSP entries inside
 * a reports+json batch are skipped, not errors, so a mixed batch the browser
 * batched together still delivers its CSP entries.
 */
export function summarizeCspReports(contentType: string, body: string): CspViolationSummary[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  if (contentType === "application/csp-report") {
    const summary = summarizeLegacyReport(parsed as Record<string, unknown>);
    return summary ? [summary] : null;
  }
  if (contentType === "application/reports+json") {
    if (!Array.isArray(parsed)) return null;
    const summaries: CspViolationSummary[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.type !== "csp-violation") continue;
      const summary = summarizeReportingApiReport(record);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }
  return null;
}

/**
 * The only place report content is ever written out: directive, blocked-uri
 * origin and document path, nothing else.
 */
export function logCspViolation(summary: CspViolationSummary) {
  console.info(JSON.stringify({ cspViolation: summary }));
}
