# Web audit progress

One entry per audit work package (best-practice audit of the site, 20 November
2026, owner-approved). Each entry records what changed, what was not verified,
any sentence that needs the owner's approval, and any decision the implementer
made alone.

## WP40 — forms, errors and focus in the survivor flow — 2026-11-20

Branch `fix/forms-focus`. All items are audit findings A3, A4, A7–A13, A23,
A27 and S12.

**What changed**

- A3: the registration code entry is one single box (`RegisterForm.tsx`):
  `type=text`, `inputmode=numeric`, `autocomplete=one-time-code`,
  `maxlength=6`, `pattern=[0-9]{6}`, letter-spaced styling, visible label
  ("6-digit code"). Typed digits, pasted codes and the browser's one-time-code
  autofill all land in it. The six per-digit boxes, their per-digit labels and
  the hard-coded "Verification code digits" group name are gone. The admin
  sign-in already used a single box and does not share the component, so
  nothing changed there.
- A4: one shared `src/components/FormError.tsx` (`role="alert"`, optional `id`
  and extra classes) now carries the failure messages of `SubmitForm`,
  `ReviewSignForm` (sign step), `SignNoticeForm`, `DeleteAccountForm` and
  `CaseDashboardActions` (the success line stays a polite `role="status"`).
  `RegisterForm`'s former local copy is the component that was promoted.
  ImageChecker is untouched (WP43).
- A7: the per-line link checks no longer sit in an `aria-live` list. The
  checks recompute after a short pause (600 ms) or when the links box loses
  focus, not on every keystroke; the draft itself is always parsed fresh at
  submit time, so a quick submit sends what was typed. One summary
  ("Links ready to file: N. Lines that will be left out: M.") is announced in
  a `role="status"` span.
- A8: video hashing shows a native `<progress>` element; the React progress
  updates are throttled to about four a second (first and final ticks always
  land). The file list is no longer a live region; the start
  ("Your video is not uploaded.") and finish ("Video fingerprint created on
  this device.") sentences are polite statuses.
- A9: `SubmitForm`, `ReviewSignForm` (sign step), `SignNoticeForm` and
  `FeedbackForm` wrap their fields in a real `<form>` with a `type=submit`
  button, so Enter submits. The buttons are disabled only while submitting;
  validation happens on submit and focuses the first problem (links box,
  platform question, declaration box; name, contact, confirmation). The
  request bodies, the notice-signing behaviour, the signed text and the
  fingerprint annex logic are untouched.
- A10: the contact email on both sign forms is checked on blur, marks
  `aria-invalid`, links its error and its existing hint through
  `aria-describedby`, clears the error on input, and gets
  `autocapitalize=none autocorrect=off spellcheck=false`.
- A11: focus moves to the new step's heading (`tabIndex=-1`) on every step
  change — registration age → email → code (and the track-mode "no case for
  this email" screen), review → sign, and the helpline call start. After a
  wrong code, focus returns to the code box itself.
- A12: the registration age radios are one `fieldset` with a legend (visually
  hidden; the visible heading already asks the question) and share the
  `name=ageNow` radio name; the second question's radios share `ageThen`.
- A13: the platform checkboxes on the submit form are a `fieldset` with the
  existing question as its `legend`; the fieldset takes the focus when a
  hash-only submission has no platform chosen.
- A23: every `FeedbackForm` field is described by its hint
  (`aria-describedby`).
- A27: after the account deletion request, the done screen's message is a
  `role="status"` and focus moves to its heading.
- S12: the submit form's links textarea gets `autocomplete=off
  autocorrect=off autocapitalize=off`.
- New strings (en + hi, machine translated, listed in
  `src/i18n/hi-review-status.json`): the link summary, the sign forms' three
  field errors (name, contact, confirmation, for both the review-sign and
  case-sign wordings), and the helpline call heading.

**Not verified**

- The full Playwright run happens in the separate verify step and was not run
  here (no local throwaway Postgres 17 on the E2E port on this host). The new
  and changed specs are written and type-checked with the rest of the app.
- The Hindi sentences were drafted by machine (Hermes/GLM), not read by a
  native speaker; they are flagged in `hi-review-status.json`.
- Screen-reader announcements were reasoned from ARIA semantics, not listened
  to with a running screen reader.

**Sentences that need the owner's approval**

- "Links ready to file: {ready}. Lines that will be left out: {skipped}." —
  the new spoken summary of the link checks.
- "Please type your full name. Your full name is your signature." and "Please
  enter a valid email address, like you@example.com." and "Please tick the
  confirmation above to sign." — the new inline sign-form errors (both
  languages).
- "Helpline call" — the hidden heading the call screen is announced under.

**Decisions made on my own**

- The per-line checks lag 600 ms behind typing (the audit asked for "blur or a
  short pause"); the submit path never lags, so nothing typed is ever lost.
- The video progress keeps its visible "Reading your video on this device:
  N%" text next to the new progress bar; the audit's complaint was the
  announcement, which the removed live region and the throttle fix.
- The throttled progress still always renders 0% and 100%, so the committed
  e2e's recorded progress (at least two distinct values, ending at 100)
  keeps holding.
- The age radios' legend is the existing "How old are you now?" string,
  visually hidden; no new sentence was added for it.
- The registration Continue buttons keep their disabled-while-loading and
  until-6-digits gating: A9 names only the submit, review-sign, sign and
  feedback forms, so their "never disabled to block validation" rule was not
  extended to the code entry.
- "Focus the first error" on the submit form focuses, in order: the links
  box, the platform fieldset, the declaration checkbox — matching the order
  of the existing status hints.

## WP49 — the survivor can tick the boxes, and our alerts are found — 2026-11-20

Branch `fix/forms-focus`. Fixes the Playwright failures of this branch's
full verify run (`logs/verify-forms-focus/e2e.log`: 10 failures — two
`getByRole("alert")` strict-mode violations, eight "Clicking the checkbox
did not change its state").

**What changed**

- The declaration checkbox on `/submit` was silently un-tickable whenever a
  click raced a render that committed between its mousedown and mouseup: the
  checkbox moved out from under the pointer, the browser handed the click to
  whatever took its place, and the tick never landed (focused but unchecked).
  Two commits on this form did that, both fixed in
  `src/app/(auth)/submit/SubmitForm.tsx`:
  - The links box's `onBlur` committed the pending per-line checks. That blur
    fires at the mousedown of the very click that blurs the box, so the
    commit always landed inside the click it caused — the "I declare" tick
    right after typing a link failed every time. The blur commit is gone;
    the 600 ms pause (WP40 A7) alone settles the checks, and the draft is
    still parsed fresh at submit, so nothing typed is lost.
  - The platform question (`hashedFiles.length > 0 && ...`) was asked from
    the settled checks. While a fingerprint is made the settled checks lag
    behind what she typed, so the question appeared when hashing finished
    and vanished when the checks settled (the debounce timer is pinned
    behind the main-thread hashing and fires right after the "fingerprint
    ready" text — exactly when a tick is invited), moving everything below
    it twice by hundreds of pixels. It is now asked from the links as they
    stand (`liveParsedUrls`), matching what `canSubmit` and the submit path
    already used: it renders once, at hash completion, and only for a real
    hash-only submission.
- The two failing alert assertions (`forms-focus.spec.ts`,
  `reporting-journey-polish.spec.ts`) are scoped with
  `getByRole("alert").filter({ hasText: ... })`: Next.js renders its own
  route announcer with `role="alert"`, so the unscoped locator resolved to
  two elements. The assertions still require our message to be `role=alert`,
  and the focus checks are untouched. The already-scoped `main`/chat alert
  locators (which pass) were left alone.
- New e2e (`forms-focus.spec.ts`): "the declaration can be ticked right
  after typing a link" fills a link and ticks with no wait for the checks —
  the exact sequence that used to fail every time.
- New vitest pins (`tests/unit/forms-focus.test.ts`): the checks settle on
  the pause with no blur commit, and the platform question is asked from
  the links as they stand.

**How the cause was found**

The failures were reproduced outside the harness by driving the dev server
with Playwright Chromium through the exact failing sequences (typing, an
image fingerprint, a 6-second video), with document-level pointer-event
tracing in the page. The traces show the eaten click: pointerdown on the
input, the blur/debounce commit moving it hundreds of pixels, pointerup on
the footer, the click event on a page-level div, and no toggle. With the
fix the same sequences pass (24/24 typing and image runs, 3/4 video runs —
the one failure was the video read missing a 60 s text-wait on the
memory-backed dev server, before any click).

**Not verified**

- The specs named by the work package run through `e2e-some.sh` on chromium
  only; the mobile project of the full verify run is not exercised here.
  The chromium run passed: 27/27 tests across the nine spec files
  (forms-focus, reporting-journey-polish, hash-flow, notice-integrity,
  reporting-audit, crawler-journey, escalation-ladder, filing,
  video-hash-flow), and the full check printed ALL CHECKS PASSED
  (crawler 350, asmita 1267 including the two new pins).
- Screen-reader behaviour is reasoned from the ARIA semantics, not listened
  to with a running screen reader.
- A razor-thin window remains on any dynamic page: a render that commits
  exactly between a tick's mousedown and mouseup can still move a control.
  The self-inflicted commits — the one the click itself caused and the
  appear-then-vanish question — are gone; the remaining ones (the checks
  list settling on its pause, ~45 px) shift less than the label's height,
  so a click that races one still lands on the label and activates the
  checkbox.

**Sentences that need the owner's approval**

- None: no user-facing string changed.

**Decisions made on my own**

- WP40 A7's "or when the links box loses focus" half is withdrawn (the
  pause half stays): the blur commit is what ate the tick. Worst case for
  a survivor, the checks now appear up to 600 ms after her last keystroke
  instead of at the moment she leaves the box; nothing she can do is gated
  on the settled checks.
- The platform question now follows the live links, which also means it
  disappears the moment she types a link while it is showing — that is the
  correct question state, and it matches what submitting actually requires.
- The sign forms keep their contact-email blur validation (WP40 A10): the
  error it inserts is ~24 px, absorbed by the tall confirmation label, and
  no failing spec or known survivor path is affected. Not in this work
  package's log, so not touched.
- The two `filing.spec.ts` failures (URL stayed on `/submit`) were the same
  checkbox bug through the label-text click, not a navigation bug: no
  test logic changed there.
- Machine-level, outside the repo: the first full check failed 15 crawler
  browser tests (WP7) with zero renders — the shared Playwright browser
  cache had been rebuilt that morning without the system libraries the
  bare Node 22 container needs, and no harness script consumes the
  `system-libs` set the cache ships for exactly this. The crawler's
  Chromium now resolves those libraries through a
  `00-asmita-pw-system-libs.conf` linker entry baked into the shared
  `node:22-bookworm` image (rollback: `docker tag e13726ca6041
  node:22-bookworm`). No crawler source, test or config changed; the same
  15 tests then passed in the re-run.
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
