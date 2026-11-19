// Content-Security-Policy for every response. next.config.ts sets the
// nonce-less policy (API routes, and pages under `next dev`); the Worker entry
// (src/cloudflare-worker.ts) replaces it on pages with one carrying a
// per-request nonce. There is no middleware file; the CSP is set only in these
// two places.

export type CspOptions = {
  frameAncestors?: "'none'" | "'self'";
  /** /talk only: the Sarvam SDK loads its audio worklet from a blob: URL and opens a WebSocket to Sarvam. */
  voice?: boolean;
  /** Pages in production. Ignored outside production. */
  nonce?: string;
  env?: string | undefined;
};

/** Where browsers POST CSP violation reports (S5). */
export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting-Endpoints name the CSP report-to directive points at. */
export const CSP_REPORT_ENDPOINT_NAME = "csp-endpoint";
/** Value of the Reporting-Endpoints header, kept beside the CSP that names it. */
export const CSP_REPORTING_ENDPOINTS = `${CSP_REPORT_ENDPOINT_NAME}="${CSP_REPORT_PATH}"`;

/**
 * Trusted Types, report-only (S6): measuring violations before any
 * enforcement. Sent as a SEPARATE Content-Security-Policy-Report-Only
 * header; the enforced policy above never carries this directive.
 */
export const TRUSTED_TYPES_REPORT_ONLY = [
  "require-trusted-types-for 'script'",
  `report-uri ${CSP_REPORT_PATH}`,
  `report-to ${CSP_REPORT_ENDPOINT_NAME}`,
].join("; ");

export function buildCsp({ frameAncestors = "'none'", voice = false, nonce, env = process.env.NODE_ENV }: CspOptions = {}) {
  const isProd = env === "production";
  const isDev = env === "development";
  // Production pages allow only same-origin files and inline scripts carrying
  // the nonce. Without a nonce (API routes, PDFs, and development, where Vite
  // and React's dev tooling also need eval) 'unsafe-inline' stays as before.
  // No 'strict-dynamic': it would also drop the blob: worklet source.
  // 'report-sample' (S4) makes any blocked script or style attach a short
  // sample of itself to the violation report.
  const scriptSrc = [
    "'self'",
    isProd && nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...(voice ? ["blob:"] : []),
    "'report-sample'",
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' 'report-sample'",
    "img-src 'self' data:",
    // The browser opens the signed voice WebSocket straight to Sarvam; the
    // session route refuses any signed URL on another host.
    `connect-src 'self'${voice ? " wss://apps.sarvam.ai" : ""}`,
    // vPDQ (WP18) reads her chosen video into a hidden <video> from a
    // same-origin blob: object URL, on whatever document the filing flow is
    // running under (soft navigations keep the source document's policy, so
    // this cannot be scoped to /submit). A blob: media URL is page-created
    // data the page already holds — it grants no cross-origin media — and
    // script-src stays closed to blob: everywhere except /talk's worklet.
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
    // CSP violation reporting (S5): report-to is the Reporting API target
    // named in the Reporting-Endpoints header; report-uri is the fallback for
    // browsers without Reporting API support.
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_ENDPOINT_NAME}`,
  ].join("; ");
}

/** 128 random bits, base64. */
export function createCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Worker entry: pages get a fresh nonce per request. vinext reads it from the
 * request's CSP header and puts it on every script it renders, and the same
 * policy replaces next.config.ts's nonce-less one on the response. API routes
 * keep next.config.ts's policy. A CSP header sent by the client is dropped so
 * it can never choose the nonce.
 */
export function withPageCsp(request: Request, pathname: string) {
  const headers = new Headers(request.headers);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  const policy = pathname.startsWith("/api/")
    ? null
    : buildCsp({ nonce: createCspNonce(), voice: pathname === "/talk" });
  if (policy) headers.set("content-security-policy", policy);
  return { request: new Request(request, { headers }), policy };
}
