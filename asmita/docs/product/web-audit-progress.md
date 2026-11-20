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
Owner-approved web best-practice audit of the site (20 November 2026, Saquib).
One section per work package, on the branch named in that section. Paths are
relative to `asmita/`.

## WP41 — leave nothing behind on a shared phone (branch `fix/signout-clear-site-data`)

**What changed**

- Both logout routes now send `Clear-Site-Data: "cache", "storage"` next to
  the Set-Cookie expiry (`src/app/api/auth/logout/route.ts`,
  `src/app/api/admin/auth/logout/route.ts`): with the session the browser
  drops the origin's HTTP cache and its storage — localStorage,
  sessionStorage, IndexedDB, service worker registrations.
- Quick exit, the idle sign-out (`src/components/QuickExit.tsx`) and Close
  Dashboard (`src/app/(victim)/CloseDashboardButton.tsx`) now clear the tab's
  sessionStorage before `location.replace` — new helper
  `src/lib/clear-tab-storage.ts` — because the keepalive logout request may
  never finish. That client-side clear is what actually guarantees the submit
  draft (`asmita_submit_draft`: typed URLs and hash metadata) and the
  eligibility answers (`asmita_eligibility`) are gone from the tab.
- Storage inventory, every key the app holds: sessionStorage
  `asmita_eligibility` and `asmita_submit_draft` (the survivor flow —
  cleared client-side on every quick exit, idle sign-out and dashboard close,
  and by both logout routes' Clear-Site-Data); localStorage
  `asmita-admin-shortcuts` (the admin keyboard-shortcut preference in
  `CaseTable.tsx` — cleared by the admin logout route's Clear-Site-Data).
  Cookies: `asmita_session` and `asmita_eligible` expire on survivor
  logout; `asmita_admin_session` expires at both paths it was ever set on
  admin logout.
- QuickExit also reloads the page on a back/forward-cache restore (pageshow
  with `persisted = true`): a bfcache restore puts a frozen, signed-out copy
  of a page back on screen with everything it held when it was left,
  including a filled form.
- S2: authenticated HTML pages — `/case/*`, `/my-cases`, `/review-sign`,
  `/submit`, `/track`, `/admin/*` — are served with `Cache-Control:
  no-store` (`next.config.ts` headers; `scripts/worker-smoke.mjs` asserts the
  Worker honours the override on `/submit`).
- S10: the `asmita_eligible` cookie is now a session cookie with no Max-Age
  (`src/lib/eligibility.ts`). It used to last 24 hours, which let a shared
  phone reopen `/submit` a day later without the age questions; it still
  lasts the whole browser session, and everything else about it is
  unchanged.

**Tests**

- New `tests/unit/logout-clear-site-data.test.ts`: both routes send the
  header and expire the cookies; a forged logout clears nothing; the
  eligibility cookie carries no Max-Age.
- `tests/e2e/quick-exit.spec.ts`, two new tests: quick exit from a filled
  `/submit` leaves sessionStorage empty and `page.goBack()` brings no form or
  case data back; a simulated bfcache restore (pageshow, `persisted = true`)
  reloads the page, an ordinary pageshow (`persisted = false`) does not.
- `scripts/worker-smoke.mjs`: asserts no-store on `/submit` and Clear-Site-Data
  plus cookie expiry on both logout routes, on the production Worker bundle.

**Decisions made on my own**

- The WP puts the pageshow listener "in the victim layout"; it lives in
  QuickExit instead — the component the victim layout renders on every
  signed-in page — because `/submit`, `/register` and `/track` sit in the
  `(auth)` route group and can hold a filled form behind the same restore;
  one implementation covers every page that has quick exit.
- `asmita_lang` (the one-year language preference) stays persistent: it is a
  UI preference, not case data or signed-in state, and clearing it would
  flip the site's language for the next visitor of a shared phone.
- `/register` keeps its default caching: it is not in the WP's page list and
  is a pre-session page.
- The admin sign-out button clears nothing client-side: the WP asks for
  client-side clears on QuickExit, CloseDashboardButton and the idle sign-out
  only; the admin logout route's Clear-Site-Data covers the admin UI's
  storage.

**What was not verified**

- The full Playwright suite runs in a separate verify step. Here the three
  specs that share the changed paths (quick-exit, filing, reporting-audit)
  ran to green on both projects (20 passed) against the Node dev server, and
  the worker smoke drove the production Worker bundle in workerd.
- A real back/forward-cache restore is not deterministic in a test runner;
  the bfcache test simulates it with a synthetic persisted pageshow event
  (constructible in Chromium, checked).
- Clear-Site-Data is processed only on secure origins; production and
  staging are HTTPS. The client-side clears do not depend on it.

**User-facing sentences needing the owner's approval**

None — no user-facing string changed (`en.json` and `hi.json` untouched).

## WP53 — the deletion request could leave without its CSRF token (branch `fix/signout-clear-site-data`)

The branch's full verify run failed one Playwright test (`tests/e2e/smoke.spec.ts:80`,
"adult dashboard supports add URL, manual resolve, and deletion request, with no
broken tools"): after "Schedule deletion" the POST to `/api/account/delete` came
back not-ok, and the failure snapshot shows the form's own error line ("Please
sign in again, then try once more.") — the request reached the app and was
refused, with no server-side error anywhere in the run log. That means a silent
403 `csrf_failed` or 401; the 401 is excluded because the page had just rendered
from the same cookie jar and nothing in the flow removes the session cookie.

**What changed**

- `src/lib/client-csrf.ts` (`csrfFetch`, used by every mutating client call)
  no longer trusts every `/api/csrf` response. A non-OK answer, or a 200 body
  without a token, used to leave `token` undefined and the POST still went out
  with the literal header `x-csrf-token: undefined` — which the server rightly
  refused with 403 `csrf_failed` while nothing looked wrong in any log, exactly
  the signature the failing run left. A bad mint is retried once; only when
  both attempts fail does `csrfFetch` reject, without sending anything.
- `csrfFetch` also mints one token at a time per tab. Two overlapping calls
  used to race: the second mint's `Set-Cookie` could land between the first
  mint and the first POST, so that POST left with a token the cookie no longer
  matched — the same silent 403. The queue holds the turn until `fetch()` has
  started, the moment the browser attaches the cookie to the request; the
  POSTs themselves may still overlap.
- `src/app/(victim)/delete-account/DeleteAccountForm.tsx` catches a rejected
  mint and shows the form's existing error line, instead of leaving the button
  stuck on "Scheduling…" with no message.

**What was not verified**

- The original failure did not reproduce. Eight further full-suite runs on this
  branch's exact code (one traced, three warm, four with a cold `.next`, plus
  a standalone instrumented twin of the failing test — roughly 1600 token mints
  logged, every mint/POST pair matched) all passed. The fix addresses the two
  mechanisms that can physically produce the observed signature; which of them
  fired in the failing run cannot be proven after the fact.
- The task's premise that WP41 broke this test could not be confirmed: none of
  WP41's changes can reach this request in the e2e environment. In `next dev`
  every response already carries `Cache-Control: no-store` (checked with curl
  against the running dev server), so the header list changes nothing the e2e
  can observe; the test never logs out, restores a bfcache page or clears
  storage, so Clear-Site-Data, the sessionStorage clears and the pageshow
  reload never fire; the `asmita_eligible` cookie only gates `/submit`, which
  the test passes signed in. Every WP41 protection is untouched and its own
  tests pass.
- The full Playwright suite runs in a separate verify step; this lane ran
  `smoke.spec.ts` and `quick-exit.spec.ts` (14 passed, including the
  previously failing test and every test WP41 added).

**User-facing sentences needing the owner's approval**

None — no new user-facing string; the failed-mint case reuses the existing
`delete.form.error` line. `en.json` and `hi.json` untouched.

**Decisions made on my own**

- Fixed the CSRF mint path rather than any WP41 protection: with every WP41
  route to this request excluded, the only reachable causes were the mint
  defects, and both are fixed and unit-tested.
- One retry on a bad mint, then a clean rejection (no request sent) rather
  than a silent garbage POST.
- No server-side `csrf_failed` logging added to `/api/account/delete` (routes
  are inconsistent about this today); kept the change minimal.
- The instrumentation and the temporary debug spec used during the
  investigation were removed before the commit; the committed tree carries no
  debug code.
