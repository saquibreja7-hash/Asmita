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

## WP42 — image and video fingerprinting off the main thread — 2026-11-19

Branch `perf/hash-worker`. Audit items P1, P2, P13 (performance): take image
and video PDQ fingerprinting off the page's main thread.

**What changed**

- P1: a module Web Worker (`src/lib/pdq/hash.worker.ts`) now does the PDQ
  hashing. The form hands the worker her chosen file; the worker decodes it
  (`createImageBitmap`), draws it to an `OffscreenCanvas` at the image's own
  size and reads the pixels — the same full-resolution path the main thread
  used, so hashes stay bit-identical (the unit tests pin the worker's
  message handler to the direct function on the Meta reference vectors).
  Only `{ hash, quality }` comes back.
- P2: the video sampler (`src/lib/pdq/vpdq.ts`) keeps its frame selection
  exactly (same seeks, same seconds, same keep pipeline) and hands each drawn
  frame to the same worker as a transferable `ImageBitmap`; the worker reads
  its pixels on an `OffscreenCanvas` and posts back only the hash and the
  quality. The page canvas, object URL and frame bitmaps are freed as before.
- P13: `SubmitForm` has no static import from the pdq modules any more (only
  type imports, which the compiler erases). It loads
  `src/lib/pdq/hash-file.ts` — the hashing entry, which also carries the
  worker client, PDQ and vPDQ — only when a file is chosen, and loads it
  again at draft time only when fingerprints exist. Verified in the builds:
  the submit page's chunk contains none of the hashing code; the worker is
  a separate file in the `next` build (Turbopack), the vinext/Cloudflare
  build (emitted as `dist/client/_next/static/workers/…`) and `next dev`.
- Fallback: where `Worker`, `OffscreenCanvas` or `createImageBitmap` is
  missing, or a worker fails to load (blocked or 404 — then it is not
  retried for the page's lifetime), the exact previous main-thread path
  runs: the image fallback in `hash-file.ts`, the frame fallback in the
  video sampler. A worker that answered once and later crashed is rebuilt on
  the next request. She never loses a fingerprint to a worker that cannot
  run.
- CSP: `worker-src 'self'` added to every policy (`src/lib/csp.ts`). No
  `blob:` — both bundlers emit the worker as a real same-origin file, in dev
  and in both production builds (verified by loading it in the e2e specs
  with a 200).
- One-line product fix found while verifying: the video entry now waits one
  macrotask before its "ready" line replaces the reading line, because the
  worker's async tail let React batch the final 100% progress tick (which
  WP40 A8 deliberately always keeps) with the completion update — the
  reading line never visibly reached 100% otherwise. Frame selection,
  hashes and the request bodies are unchanged.
- No user-facing string changed; nothing else in the UI moved.

**What was not verified**

- The full Playwright run is the separate verify step. The WP's own specs
  and the neighbouring ones that exercise the same page ran here against a
  throwaway local Postgres 17: `hash-flow.spec.ts` (5), `video-hash-flow.spec.ts`
  (3), `filing.spec.ts` (3) — all passed on chromium.
- No real phone and no real 12-megapixel photo were available; the offload is
  structural (decode + hash happen on the worker thread), but the
  milliseconds saved were not measured on real hardware.
- Safari and Firefox were not driven; their fallback paths are the previous
  main-thread code, covered by the unit tests and the source pins.
- The `/check-image` page (`ImageChecker.tsx`) was not touched — WP43 owns it.

**Sentences that need the owner's approval**

- None. No user-facing sentence changed.

**Decisions made on my own**

- The worker decodes her file itself (the audit allowed "createImageBitmap on
  the main thread (or in the worker from the File)"): decoding is the
  heaviest step for a 12-megapixel photo, so it moved too.
- The worker protocol has a third request kind, `pixels`, next to `file` and
  `bitmap`: it is the pure inner step both other kinds reduce to, and it is
  what lets the unit tests drive the real message handler with the Meta
  reference vectors in Node, where no DOM APIs exist. The page never posts
  it; the client posts only `file` and `bitmap`.
- Replies are validated strictly (known id, 64-lowercase-hex hash, integer
  quality 0..100, fixed error codes); a malformed reply or an unknown id
  terminates the worker and fails that request with a fixed code, which the
  callers treat as "hash on the main thread instead". No request hangs: the
  worker answers every well-formed message, including its own handler
  throwing, with a fixed refusal code.
- `review-sign` still carries `vpdq.ts` in its chunk (it imports
  `bestFrameQuality` statically, unchanged since WP18); P13 names the
  submit form, and shrinking another page's chunk was not in this package.
- Pre-existing e2e flake found and worked around in the specs, not the app:
  after `fill()` the links textarea keeps focus; if anything is clicked
  within the 600 ms debounce window (WP40 A7), the blur flushes the checks,
  which renders the checks list and removes the platform question — a large
  reflow that moves the page under the pointer mid-click, so the click
  misses the declaration checkbox. It reproduces at HEAD (verified with the
  WP42 changes stashed) and the worker makes it likelier by finishing
  hashing inside the same window. The specs now wait for the app's own
  `#url-checks` list before clicking (`hash-flow`, `video-hash-flow`,
  `filing`), and pin `prefers-reduced-motion: reduce` like the accessibility
  spec, which makes the site's smooth scrolling instant. No assertion was
  weakened. The underlying product edge — a real survivor clicking within
  600 ms of typing can have the page reflow under her pointer, and the
  missed click can land on whatever moved there — is left for the owner to
  schedule; it is WP40-era behaviour, not introduced here.
- Also pre-existing on this host and left as found (verified failing at
  HEAD, untouched by this WP): `forms-focus.spec.ts`'s alert assertion sees
  Next's own route announcer as a second `role=alert` (strict-mode
  violation), and its sign-form checkbox click has the same blur-reflow
  race on the review-sign page.
- `crawler/` needed nothing: it imports `pdq.ts` only, whose exports and
  `computePdqHash` are untouched; its contract test pins exactly that.
