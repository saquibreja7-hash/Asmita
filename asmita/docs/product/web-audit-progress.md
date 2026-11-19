# Web best-practice audit — progress

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
