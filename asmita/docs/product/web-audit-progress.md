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
Owner-approved work packages from the web best-practice audit of the site
(accessibility, forms, performance, security headers), approved 20 November 2026
by Saquib. One section per work package, appended when its lane branch lands.

## WP44 — signed-notice preview link, and two small markup fixes (branch fix/notice-preview-link)

### What changed

- A2, notice preview link. Android Chrome does not render a PDF inside an
  `<iframe>`, so a survivor could reach the signing step of a document she
  cannot read. Both sign screens — the review-sign flow
  (`src/app/(victim)/review-sign/ReviewSignForm.tsx`) and the case sign page
  (`src/app/(victim)/case/[caseId]/sign/SignNoticeForm.tsx`) — now show a
  visible "Open the notice (PDF)" link in the preview card header, beside the
  frame. The link uses exactly the same URL variable as the iframe `src`
  (same `urlId` and `templateRef` parameters), opens in a new tab with
  `rel="noopener noreferrer"`, and is styled with the existing
  `link-underline` pattern. Nothing else about the preview, the PDF content,
  or the signing flow changed: the route still refuses a stale `templateRef`,
  so the link opens the same document the signature covers.
- A2, header checks and coverage. Both preview routes
  (`src/app/api/cases/[caseId]/preview-notice`,
  `src/app/api/cases/[caseId]/preview-hash-advisory`) already serve
  `Content-Disposition: inline` and `Cache-Control: no-store`; the framing
  exception (`X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`)
  stays scoped to exactly those two routes in `next.config.ts`, and every
  other response keeps `frame-ancestors 'none'` / `X-Frame-Options: DENY`.
  New vitest coverage (`tests/unit/notice-preview-headers.test.ts`) pins the
  inline and no-store headers on both routes and the framable-only-by-self
  header rules for those two sources.
- A2, i18n. New key `review.sign.openNotice` added to
  `src/i18n/en.json` ("Open the notice (PDF)") and `src/i18n/hi.json`
  ("सूचना खोलें (PDF)"), listed as machine translated in
  `src/i18n/hi-review-status.json`.
- A21, chat log semantics. The home chat transcript
  (`src/app/(public)/HomeChat.tsx`) used `<ol role="log">`, which strips the
  list semantics it claims; it is now a `<div role="log">` whose children are
  plain `<p>` elements, and the redundant `aria-live="polite"` is dropped
  (`role="log"` already implies polite). No visual change.
- A25, home page landmark labels. Removed the four redundant `aria-label`s on
  the home page (`src/app/(public)/page.tsx`): "Introduction" on the hero,
  "How a report moves" on the pipeline section, the same label repeated on
  the pipeline `role="list"` (which repeated its section's), and "Get help" on
  the closing section (which duplicates the visible "Get help" button). All
  visible headings are unchanged; only the duplicate labels are gone, so
  screen readers stop announcing the same name twice per landmark.

### New tests

- `tests/unit/notice-preview-headers.test.ts` (vitest): preview routes serve
  the PDF inline and unstored; `next.config.ts` keeps framing relaxed for
  exactly the two preview routes.
- `tests/e2e/notice-preview-link.spec.ts` (Playwright): registers a survivor,
  files one synthetic WhatsApp link, and asserts on both the review-sign
  screen and the case sign page that the "Open the notice (PDF)" link is
  visible, opens in a new tab with `noopener noreferrer`, and that its `href`
  equals the iframe `src`.

### Not verified here

- The Playwright spec above was NOT run on this machine (Playwright, the
  Postgres e2e and the worker smoke run on another machine). It follows the
  existing `tests/e2e/notice-integrity.spec.ts` journey (same register and
  report helpers, same chromium-only skip) but is unexecuted here.
- `npm run build` result on this machine is recorded in the WP44 commit
  message; the check harness on this machine runs lint, type-check and vitest
  only.
- The visual result of the link in the preview card header was checked by
  code review against the existing `link-underline` pattern, not in a browser.

### Needs the owner's approval

- The new user-facing sentence "Open the notice (PDF)" (Hindi:
  "सूचना खोलें (PDF)") appears on both sign screens next to the preview
  frame. The Hindi is machine translated and listed as such in
  `hi-review-status.json`.

### Decisions made on my own

- One i18n key (`review.sign.openNotice`) is shared by both sign components
  rather than a separate `sign.*` key for the case sign page: the string is
  identical and the components already share `review.sign.*` keys.
- The link sits in the preview card's header bar (label on the left, link on
  the right) rather than under the frame: it is "next to the frame", needs no
  new layout, and matches the existing card chrome.
- The A25 reading of "section aria-labels that duplicate the visible
  headings" covers all four labels the audit located (hero, pipeline section,
  pipeline list, closing section); the pipeline section has no visible
  heading of its own, and with the label removed it is no longer announced as
  a duplicate landmark — the pipeline nodes themselves are unchanged.
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
