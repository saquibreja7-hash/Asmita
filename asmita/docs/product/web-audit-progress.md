# Web best-practice audit — progress

Each work package from the web best-practice audit (accessibility, forms,
performance, security headers) records here what changed, what was not
verified, any user-facing sentence that needs the owner's approval, and any
decision the implementer made on their own. The audit items were owner-approved
on 20 November 2026 (Saquib).

## WP46 — Security headers (branch feat/csp-reporting-headers)

Items: S4 ('report-sample'), S5 (CSP violation reporting), S6 (QR SVG without
dangerouslySetInnerHTML + report-only Trusted Types), S7 (Permissions-Policy
extension), S8 (COOP/CORP).

### What changed

- S4 — `src/lib/csp.ts` now appends `'report-sample'` to `script-src` and
  `style-src` in every environment. `'strict-dynamic'` is still absent (the
  Sarvam voice worklet on /talk needs the current blob: source list); the test
  suite pins both facts.
- S5 — the CSP carries `report-uri /api/csp-report` and
  `report-to csp-endpoint`; `next.config.ts` sends
  `Reporting-Endpoints: csp-endpoint="/api/csp-report"` with it. New route
  `src/app/api/csp-report/route.ts` (logic in `src/lib/csp-report.ts`)
  accepts only `application/csp-report` and `application/reports+json`,
  caps the body at 8 KB (declared content-length refused first, then the read
  body measured — the same shape as the crawler routes' caps), throttles per
  network with the existing shared Postgres rate-limit buckets (60 per 10
  minutes), reduces every URL to an origin or a path (query and fragment
  stripped), logs only `directive`, `blockedOrigin` and `documentPath`, and
  answers 204. Anything that is not a CSP report gets 415 (wrong content
  type) or 400 (wrong shape). Reports are console-logged only, never stored
  in the database.
- S6 — the admin MFA enrolment QR (`src/app/admin/setup-mfa/EnrolMfa.tsx`) is
  now an `<img src="data:image/svg+xml,...">` (encodeURIComponent) instead of
  dangerouslySetInnerHTML; this was the only usage in the repo. The existing
  `img-src 'self' data:` already allows data: images on that page, so no CSP
  change was needed. A separate `Content-Security-Policy-Report-Only` header
  carries `require-trusted-types-for 'script'`; the enforced CSP never does,
  so nothing is blocked yet.
- S7 — Permissions-Policy denies `payment`, `usb`, `serial`, `bluetooth`,
  `accelerometer`, `gyroscope`, `magnetometer`, `display-capture` and
  `browsing-topics`. The camera/geolocation rules are unchanged and /talk
  keeps `microphone=(self)` exactly, on both the catch-all and the /talk
  override.
- S8 — `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-origin` are sent from the catch-all
  header list, so pages, /api and static assets all carry them. No COEP. The
  /talk voice flow was checked: it uses a WebSocket and a same-origin blob
  worklet, never a cross-origin window (no window.open/opener anywhere in
  src).
- Production consistency: production pages get their CSP from the Worker
  entry via the same `buildCsp`, so the Worker needed no separate edit; all
  other headers come from `next.config.ts`, which also drives the vinext
  Worker build.

Tests: `tests/unit/csp.test.ts` extended (report-sample, report-uri/report-to,
endpoint-name consistency, Trusted Types report-only separation, updated exact
policy strings); new `tests/unit/csp-report-route.test.ts` (content types,
8 KB cap, per-network rate limit, URL stripping and log hygiene);
`scripts/worker-smoke.mjs` extended to assert the new headers on /, /talk and
/api/health, and to POST both report formats (204) plus a non-report (415).

### Not verified here

- The Playwright suite and the Postgres e2e were not run on this machine (they
  run in the separate verify step). No new Playwright spec was required for
  this WP.
- `scripts/worker-smoke.mjs` (workerd, Postgres) was not run on this machine;
  its new assertions were written to match the behaviour verified locally
  with `npm run dev` (all headers present on /, /talk and /api/health; the
  report endpoint answered 204/415/400/405/413 as designed) and `npm run
  build`.
- Browser-side reporting itself (an actual violation arriving at the endpoint)
  can only be confirmed in production, where the reports now start flowing.

### User-facing text needing owner approval

- New alt text on the admin MFA QR image: "Authenticator setup QR code"
  (screen readers only; visible layout unchanged).

### Decisions made on my own

- Reports are logged with `console.info` only, not `logSecurityEvent`:
  SecurityEventLog is for security-relevant admin-visible events, and CSP
  reports are high-volume, untrusted telemetry.
- The Report-Only Trusted Types policy also carries the reporting directives,
  so its violations reach the same endpoint and can be measured before any
  enforcement decision.
- Rate limit 60 reports per 10 minutes per network: reports are best-effort;
  dropping surplus ones costs nothing, and the bucket is shared per network as
  the other public routes are.
- The QR alt text is English-only, like the rest of the admin workspace (the
  admin section does not use the i18n dictionary; no new en.json/hi.json
  keys were added).
- COOP and CORP are sent on the catch-all list, so static assets carry CORP
  too (stops other sites embedding them; nothing on this site loads its own
  resources cross-origin).
- The body cap follows the repo's existing pattern (declared content-length
  pre-check, then `request.text()` measured against the cap) rather than a
  stream reader, which the repo's lint rules forbid (`request.body` access).
# Web best-practice audit — progress log

Work packages WP39–WP43 come from a web best-practice audit of the site
(accessibility, forms, performance, security headers), owner-approved on
20 November 2026 (Saquib). Each WP runs on its own branch; this file records,
per WP, what changed, what was not verified, any user-facing sentence that
needs the owner's approval, and any decision the implementing agent made on
its own. The engineering log with test totals lives in
`crawler/docs/v2-progress.md` under "Web best-practice audit".

## WP43 — Accessibility of the "Is this image AI-made?" page

Branch `feat/ai-image-copy` (after WP38), 2026-11-20. Scope: the page's own
states and what WP38 added to it (`src/app/(public)/check-image/ImageChecker.tsx`).

**What changed**

- The result of the on-device check is announced: when the reading finishes,
  focus moves to the "What we found" heading, which is now a real `<h2>`
  (was a `<span>` with the same classes) with `tabIndex={-1}`, so a screen
  reader reads the new state. This happens on every check, including a second
  image picked after a first result.
- The "Reading credentials on your device..." line (and the deeper check's
  "Checking with OpenAI..." line) are polite `role="status"` paragraphs.
- Every error message on the page is a `role="alert"`: the "We could not read
  this file" card and the deeper check's "could not be completed" line.
- The hidden file input is never a tab stop (`tabIndex={-1}` at all times; it
  previously joined the tab order after the age gate) and now carries
  `aria-label` "Choose an image to check", so the visible "Choose image"
  button is the only tab stop. It stays `sr-only` and disabled behind the age
  gate.
- The deeper check's result title also receives focus when it arrives.
- Tests: `tests/unit/check-image-a11y.test.ts` (8 tests) pins the roles, the
  focus wiring and the input's attributes; `tests/e2e/check-image-a11y.spec.ts`
  (chromium + mobile) asserts the announcements end to end. The existing
  `/check-image` assertions in `hash-flow.spec.ts` are unchanged.
- No wording changed: no string in `en.json`, `hi.json` or
  `hi-review-status.json` was added or edited (WP35 and WP38 copy is
  untouched). No crawler file changed.

**What was not verified**

- No real screen reader (NVDA, VoiceOver) was run; the assertions cover the
  standard mechanisms (roles, programmatic focus), not a live screen-reader
  session.
- The deeper check's announcements cannot be reached in the e2e environment
  (no OpenAI key configured, so the page shows "temporarily unavailable");
  they are covered by the unit tests only.
- The "We could not read this file" card is a defensive branch — both
  on-device readers resolve instead of throwing — so its `role="alert"` is
  pinned by the unit test, not exercised by a live run.
- The new e2e spec ran alone (both Playwright projects, green); the full
  Playwright suite is the audit's separate verify step.

**User-facing sentences that need the owner's approval**

- None. No new user-facing sentence was added; the one accessible name the WP
  adds reuses the existing `check.upload.label` ("Choose an image to check")
  that is already on the page in both languages.

**Decisions made on the agent's own**

- A5 offered a `role="status"` wrapper or a focused result heading; the
  focused heading was chosen (the pattern EligibilityWizard, HomeChat and
  CasePeek already use) so a screen reader hears one line, not the whole
  result card replayed politely.
- The result heading changed from `<span>` to `<h2>` with the same classes:
  identical rendering (the class styles win the cascade), a real heading for
  screen-reader navigation and a proper focus target.
- The hidden input's accessible name reuses `check.upload.label` rather than a
  new key: the audit's en/hi rule for new strings then adds nothing.
- The deeper check (WP38's addition) received the same announcements as the
  main flow, although the brief names the page's main states.
- `/check-image` was not added to the axe route list in
  `tests/e2e/accessibility.spec.ts`; that change belongs to WP39's lane and
  duplicating it would collide at merge.
# Web audit progress

Owner-approved web best-practice audit (20 November 2026, Saquib). One section
per work package, appended by the lane that delivered it. Line numbers refer to
master 92d8e82 and may have moved.

## WP45 — page-load speed on slow phones (branch perf/lcp-fonts)

Delivered: P3, P4, P5, P8.

### What changed

- P3 — footer grain. `.site-footer::after` (globals.css) now tiles
  `public/images/textures/grain.svg`, a 1 KB procedural `feTurbulence` tile,
  instead of the 480 KB `grain-big.jpg` (~469 KB fewer bytes on every page).
  The tile keeps the same CSS (`center / 700px auto repeat`, `opacity: 0.5`,
  `mix-blend-mode: soft-light`) and was tuned to the JPEG's measured
  statistics at its 700 px display size (luma mean 193.1 vs 193.8, std 9.15
  vs 9.16); the composited result over parchment differs by 0.23/255 mean
  (3/255 max) per pixel, measured in Chromium — visually the same grain.
  `baseFrequency` is 0.4 on purpose: values at or above 1.0 rasterize flat
  in Chrome (checked in 156). `grain-big.jpg` is deleted; a repo-wide grep
  found no other reference. The CSP `img-src 'self'` already covers the
  same-origin tile; no CSP change was needed.
- P4 — hero priority. `Illustration` sets `fetchPriority="high"` when
  `eager` (React 19 also emits a matching `<link rel="preload" as="image">`).
  Checked every page that passes `eager`: each passes it exactly once except
  the home page, which passed it twice (hero `Illustration` and
  `SupporterLogos`). The supporters strip is far below the fold, so its
  `eager` is removed; the hero stays the page's single eager image. A test
  now scans every `page.tsx` and fails if any page passes `eager` twice.
- P5 — Devanagari shift. `font-size-adjust: from-font` on `body`
  (globals.css) keeps the fallback font's metrics matched to Noto Sans
  Devanagari while the webfont loads; ignored by older browsers. The layout
  now preloads the regular-weight Devanagari woff2 on Hindi pages only
  (cookie `asmita_lang=hi`), with `crossorigin="anonymous"` so the CSS font
  fetch can reuse the preload. The URL comes from importing the same
  `@fontsource` woff2 the `@font-face` uses, so both references hash to one
  build asset. Not done: consolidating the three Devanagari weights into one
  variable font. That needs a different package
  (`@fontsource-variable/noto-sans-devanagari`, new dependency + lockfile)
  with a different family name, so it is not the "small change" the audit
  allowed; the three static weights stay. Nothing user-facing to translate:
  this WP adds no visible strings, so en.json/hi.json are unchanged.
- P8 — sticky header. `backdrop-filter: blur(12px)` removed from
  `.site-header`; the background is now solid `var(--color-parchment)`
  (#f6f3f1 — the same colour the translucent paint sampled), keeping the
  header's look without the per-scroll-frame reraster.

Tests added (vitest): `tests/unit/page-load-weight.test.ts` (grain tile +
JPEG gone + soft-light/opacity kept + feTurbulence tile, body
`font-size-adjust`, header without blur, no page passes `eager` twice),
`tests/unit/illustration-fetch-priority.test.ts`,
`tests/unit/devanagari-font-preload.test.ts` (hi preload with crossorigin,
en none). No Playwright spec was required for this WP.

### Not verified here

- This machine ran lint, type-check, vitest and both builds (`npm run build`
  and, additionally, `npm run build:vinext`). Playwright, the Postgres e2e
  and the worker smoke (`scripts/worker-smoke.mjs`) run later on another
  machine and were NOT run here.
- The preload was verified on the Node production build (`next build` +
  `next start`): the Hindi page emits the preload link, and the woff2 request
  arrives with initiatorType "link" while the English page fetches no
  Devanagari file at all. The vinext Worker build compiles and its CSS and
  worker entry reference the same hashed woff2, but the runtime worker smoke
  still runs elsewhere.
- The grain tile's look was verified numerically in desktop Chromium
  (Windows, Chrome 156) only — not on Android Chrome, and not in Safari/Firefox.
- Operational note for later lanes: `npm run build:vinext` overwrites the
  gitignored `.next/types` with its own generated route validator, which
  `tsc --noEmit` then rejects. This is a tool quirk, not a code error;
  re-running `npm run build` (Next) regenerates compatible types, and the
  final check run here passed after doing exactly that.
- No user-facing sentence needs the owner's approval; no visible copy changed.

### Decisions made on my own

- Kept the footer grain's light-gray bias (luma mean ~194) rather than
  neutral mid-gray: the soft-light blend over parchment reads the same as
  before, which the audit's "same soft-light look" asked for.
- Left the second Devanagari preload (600 weight) out: body text (400) is
  the LCP-relevant mass; headings are few, and the audit named only the
  regular weight.
- The supporters strip `eager` removal (home page) is a loading-behaviour
  change only; the logos still render, now lazily like on /about.
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
