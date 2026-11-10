// Content-Security-Policy for every response. next.config.ts sets the
// nonce-less policy (API routes, and pages under `next dev`); the Worker entry
// (src/cloudflare-worker.ts) replaces it on pages with one carrying a
// per-request nonce. The root middleware.ts is not used for this: with the app
// in src/, Next and vinext only look for src/middleware.ts or src/proxy.ts.

export type CspOptions = {
  frameAncestors?: "'none'" | "'self'";
  /** /talk only: the Sarvam SDK loads its audio worklet from a blob: URL and opens a WebSocket to Sarvam. */
  voice?: boolean;
  /** Pages in production. Ignored outside production. */
  nonce?: string;
  env?: string | undefined;
};

export function buildCsp({ frameAncestors = "'none'", voice = false, nonce, env = process.env.NODE_ENV }: CspOptions = {}) {
  const isProd = env === "production";
  const isDev = env === "development";
  // Production pages allow only same-origin files and inline scripts carrying
  // the nonce. Without a nonce (API routes, PDFs, and development, where Vite
  // and React's dev tooling also need eval) 'unsafe-inline' stays as before.
  // No 'strict-dynamic': it would also drop the blob: worklet source.
  const scriptSrc = [
    "'self'",
    isProd && nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...(voice ? ["blob:"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // The browser opens the signed voice WebSocket straight to Sarvam; the
    // session route refuses any signed URL on another host.
    `connect-src 'self'${voice ? " wss://apps.sarvam.ai" : ""}`,
    "font-src 'self' data:",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
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
