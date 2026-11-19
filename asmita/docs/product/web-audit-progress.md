# Web audit progress

One section per work package from the web best-practice audit (accessibility,
forms, performance, security headers), owner-approved 20 November 2026,
Saquib. Each lane records what changed, what was not verified, any
user-facing sentence awaiting the owner's approval, and decisions made on
the lane itself.

## WP47 — cookie and CSRF hardening (branch fix/host-cookies-fetch-metadata)

### What changed

- S9 (cookie names): every cookie name now lives in `src/lib/cookie-names.ts`.
  In production the survivor session, admin session and CSRF cookies are
  issued as `__Host-`-prefixed names (which the browser pins to Secure,
  Path=/ and no Domain); dev and test on http://localhost keep the plain
  names, because the prefix requires Secure. The helper is used everywhere a
  cookie is set, read or cleared: `src/lib/csrf.ts`, the verify-otp, logout,
  account-delete, admin auth verify, admin MFA confirm and admin logout
  routes, `src/lib/auth/middleware.ts`, `src/lib/auth/require-admin.ts`, the
  root and victim layouts (through `requireSession`), and the sites that read
  or set the language, eligibility and admin new-links-seen cookies (name
  source only — those keep their plain names everywhere, they are not auth
  cookies).
- S9 (one-release fallback): session and CSRF readers accept the pre-migration
  plain name until the next release (dated comment in
  `src/lib/cookie-names.ts`; the longest of these cookies lives 8 hours, so
  nothing pre-migration can arrive after 2026-11-21). The current
  `__Host-` name is always read first. Both logout routes and account
  deletion clear both names.
- S13 (constant-time compare): `verifyCsrfRequest` compares the submitted
  token with the existing `safeEqual` helper from `src/lib/safe-equal.ts`
  instead of `===`.
- S13 (Fetch Metadata): `src/lib/fetch-metadata.ts` refuses non-GET/HEAD
  requests to `/api` that carry `Sec-Fetch-Site: cross-site` with 403
  `cross_site_blocked`. Requests without the header (old browsers,
  server-to-server) fall through to the existing checks. It runs in
  `src/proxy.ts` (Next 16 proxy; dev, e2e, and the vinext Worker pipeline)
  and again in `src/cloudflare-worker.ts`, both on the same helper. The
  exempt routes — those that authenticate by signature, bearer token or
  shared secret instead of a cookie — are listed in one place with comments:
  `/api/webhooks/resend`, the six `/api/crawler/*` routes, `/api/ngo/vouch/`,
  the three `/api/cron/*` routes, and `/api/csp-report`.
- Tests: new `tests/unit/cookie-names.test.ts` (production vs dev names,
  fallback order), `tests/unit/cookie-migration.test.ts` (route-level
  `__Host-` sets, legacy-name reads, logout clearing both names),
  `tests/unit/fetch-metadata.test.ts` (allow/deny matrix over every exempt
  route and near-misses); `tests/unit/csrf.test.ts` extended (constant-time
  helper is the comparator, production `__Host-` cookie set/read, legacy
  fallback, current-name preference) and `tests/unit/api-routes.test.ts`
  (verify-otp issues the `__Host-` session cookie in production while
  accepting the legacy CSRF cookie name). The full vitest suite passes.

### What was not verified

- Playwright, the Postgres e2e and `scripts/worker-smoke.mjs` do not run on
  this machine. The dev/e2e path relies on Next 16 running `src/proxy.ts`,
  and production on vinext running it plus the Worker-entry check; both use
  the same unit-tested helper, but the end-to-end behaviour was not exercised
  here. The worker smoke should be unaffected: it relays the Set-Cookie it
  receives instead of hardcoding cookie names, and its webhook, crawler and
  chat calls carry no Sec-Fetch-Site header, so the guard falls through.
- The 403 body is the API error code `cross_site_blocked`, like the existing
  `csrf_failed`; no user-facing sentence was added or changed, so there is
  nothing awaiting the owner's approval. No i18n keys were needed.

### Decisions made on this lane

- The Fetch Metadata guard runs in two places (`src/proxy.ts` and the Worker
  entry) on the one helper, so production enforcement never depends on the
  vinext app pipeline running the proxy first.
- `/api/csp-report` is listed as exempt although the route does not exist on
  this branch: it arrives with the CSP reporting work (WP46), and browsers
  send those reports cross-site with no cookies. Listing it early is harmless
  while the route is absent and keeps the merged tree working.
- `src/lib/client-csrf.ts` needed no change: it never reads the CSRF cookie
  (it is httpOnly); the token comes from the `GET /api/csrf` JSON body.
  Verified by grep over `document.cookie` users.
- In production the logout routes also set Secure on the legacy plain-name
  deletion, because a `__Host-` Set-Cookie is rejected without it.
