# Web audit progress

Accessibility, forms, performance and security-header fixes from the web
best-practice audit (owner-approved 20 November 2026, Saquib). One section per
work package, appended when its checks pass. The work packages themselves are
not in the crawler spec; they are defined in the audit brief. Paths are
relative to `asmita/`.

## WP39 — site chrome, navigation, target sizes and CSS accessibility (branch `fix/a11y-chrome-css`)

**What changed**

- A1: a "Skip to main content" link is now the first focusable element of the
  page chrome (`src/components/layout/Header.tsx`, rendered first inside
  `AppShell`), visually hidden until focused; `<main>` gained `id="main"` and
  `tabIndex={-1}`. English and Hindi.
- A14: the mobile menu button no longer overrides its name with
  `aria-label="Menu"` while showing "×"; closed it reads "Menu", open it shows
  the × glyph (aria-hidden) with a visually hidden "Close menu".
- A15: closing the mobile menu with Escape or an outside tap returns focus to
  the menu button; the nested `details/summary` submenus became
  `button aria-expanded aria-controls` toggles.
- A16: the footer language toggle buttons are at least 44px tall, wrapped in a
  labelled `role="group"`, with `lang="hi"` on "हिंदी". Segmented look kept.
- A18: pages that render the Quick Exit pill get bottom clearance
  (`html:has(.quick-exit) body { padding-bottom }` and
  `scroll-padding-bottom`), so nothing focusable sits under the fixed pill.
- A19: the CopyDraft copy button is 44px tall and its live region moved
  outside the button.
- A20: the eligibility Back button is 44px tall; the question heading is
  focused on every index change, including going back to question 1 (not on
  first render).
- A22: the FAQ chevron uses `content: "↓" / ""` so the glyph is not read aloud.
- A24: hard-coded English accessible names in FlowProgress, MobileMenu, Header
  and Footer moved to i18n keys (`nav.primary`, `nav.mobile`, `nav.home`,
  `nav.language`, `flow.progress`), added to `en.json` and `hi.json` (listed as
  machine translated in `hi-review-status.json`).
- A26: `.field:focus-visible`/`.input:focus-visible` show a 2px brand focus
  ring (the token is `var(--brand)`).
- P6: `.field`/`.input` and `.filing-input` draw their full 1px border in
  smoke (`var(--color-smoke)`, ~5.7:1 on parchment) instead of ash (~1.5:1) or
  transparent.
- P7: `html { font-size: 16px }` removed; every px font size in globals.css
  (tokens and rules, clamp bounds included) converted to rem; the
  `<meta name="text-scale" content="scale">` added through Next `metadata.other`.
- P9: `text-wrap: pretty` on prose (`.reading-body p`, `.faq-answer`), scoped;
  `overflow-wrap: anywhere` on `.reading-body` and chat bubbles.
- P10: the hover lifts on `.link-card` and `.home-help-tile` moved inside
  `@media (prefers-reduced-motion: no-preference)`.
- P12: `color-scheme: light` on `:root`.
- Home axe flake: `tests/e2e/accessibility.spec.ts` now emulates reduced
  motion, awaits `document.fonts.ready`, scans /eligibility, /track,
  /check-image, /start and /get-help, and gained tests for the skip link as
  first Tab stop, the 44px language toggle (mobile project) and the wizard
  heading focus. A global `prefers-reduced-motion: reduce` rule now turns off
  all transitions and animations.

**What was not verified**

- The full Playwright suite runs in the separate verify step. The hardened
  accessibility spec itself was run here against a throwaway local Postgres 17
  with both Playwright projects: 29 passed, 1 skipped (the 44px toggle test is
  mobile-project-only), 24 axe scans of the 12 routes, no flake.
- Full checks (Node 22): crawler lint/type-check/tests/build and asmita
  lint/type-check/prisma validate/tests all pass; asmita 145 test files,
  1206 tests.
- The optional second commit (Tailwind `text-[Npx]` classes in tsx to rem) was
  not done; globals.css is fully rem, the tsx arbitrary classes still pin px by
  design and can follow later.
- Visual regression beyond code review: the output is pixel-identical at
  default settings by construction (rem = px/16 at a 16px root, borders and
  target sizes excepted as required by the audit items), but no screenshot
  diff was run.

**Needs the owner's approval**

- None of the new strings are user-visible prose beyond navigation labels
  ("Skip to main content", "Close menu", and the aria-labels "Primary",
  "Mobile", "Asmita home", "Language", "Progress"); their Hindi translations
  are machine translated and listed in `hi-review-status.json`.

**Decisions made on my own**

- The Quick Exit clearance is scoped with `html:has(.quick-exit)` in CSS
  rather than editing every page: the pill renders both inside `main` (auth
  pages) and outside the shell (victim layout), so a structural class per page
  would not cover both.
- The skip link lives in `Header.tsx` (the WP named both AppShell and Header):
  Header is the first child of the page shell, sync, and unit-testable.
- Under `prefers-reduced-motion: reduce` all transitions and animations are
  disabled globally (`*`), which subsumes the previous per-selector list.
