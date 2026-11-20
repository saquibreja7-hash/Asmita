// Fetch Metadata guard (web audit S13). A browser never sends
// Sec-Fetch-Site: cross-site on a request the page itself initiated, so a
// cross-site non-GET/HEAD request to /api can only be another site forging
// the request (classic CSRF shape) or a caller that authenticates some
// other way. Cookie-authenticated routes refuse the former with 403;
// requests without the header (old browsers, server-to-server callers)
// fall through to the route's own checks.
//
// Enforced in src/proxy.ts (dev, e2e and the vinext Worker pipeline) and
// again in src/cloudflare-worker.ts so production never depends on the app
// pipeline running first. No imports: the Worker entry uses this directly.

// Routes that authenticate with a signature, bearer token or shared secret
// instead of a cookie, so a cross-site request is how they are meant to be
// called. These are the only /api routes exempt from the guard.
export const FETCH_METADATA_EXEMPT_ROUTES = [
  // Resend delivery webhooks: verified by the svix signature.
  "/api/webhooks/resend",
  // The crawler service presents its service key (only its sha256 is stored).
  // /api/crawler/embeddings arrived with the master merge (SSCD WP28) and
  // carries the same bearer, so it joins its six siblings.
  "/api/crawler/pool",
  "/api/crawler/sources",
  "/api/crawler/discoveries",
  "/api/crawler/findings",
  "/api/crawler/embeddings",
  "/api/crawler/frontier/claim",
  "/api/crawler/frontier/report",
  // NGO partners vouch with a bearer API key; the case id is a path segment.
  "/api/ngo/vouch/",
  // Cloudflare Cron Triggers present the CRON_SECRET bearer token.
  "/api/cron/maintenance",
  "/api/cron/purge-expired-urls",
  "/api/cron/sweep-due-jobs",
  // CSP violation reports (added with the CSP reporting work) are sent by
  // browsers and carry no credentials.
  "/api/csp-report",
] as const;

export function isFetchMetadataExempt(pathname: string): boolean {
  return FETCH_METADATA_EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route.endsWith("/") ? route : `${route}/`),
  );
}

/**
 * Returns a 403 response that refuses the request, or null when the request
 * must fall through to the route (safe method, not cross-site, not /api, an
 * exempt route, or no Fetch Metadata at all).
 */
export function crossSiteApiRequestRefusal(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  // Absent header (old browsers, server-to-server): fall through to the
  // existing CSRF and auth checks.
  if (request.headers.get("sec-fetch-site") !== "cross-site") return null;
  const { pathname } = new URL(request.url);
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  if (isFetchMetadataExempt(pathname)) return null;
  return new Response(JSON.stringify({ error: "cross_site_blocked" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}
