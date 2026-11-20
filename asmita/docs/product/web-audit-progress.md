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
