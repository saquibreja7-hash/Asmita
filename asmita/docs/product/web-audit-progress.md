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
