# Asmita Design System

Status: in use. Section 0 is what the code implements; sections 1 onward are the August 2026 draft and are kept for history.
Owner: Saquib
Last updated: 2026-11-04
Builds on: `01-brand-brief.md`, `02-information-architecture.md`.

Direction chosen: **clean modern platform** (white background, deep teal as the
single strong color, generous whitespace) with **modern neutral sans** typography
(Inter Tight, paired with Noto Sans Devanagari for Hindi). Reads as a serious tech
platform, not a charity. This is document 3 of 4. Values are concrete so document
4 (page templates) can implement directly. Token names map to the existing
`globals.css` variables where possible, so this is an evolution, not a rewrite.

## 0. The system as built (November 2026)

All values live in `src/app/globals.css`. Use these, not raw values.

**Colour roles.** `--ink` (headings, main text), `--text` (body), `--text-muted`
(hints), `--brand` (#0a5e5a: links, accents, primary buttons), `--brand-strong`
(hover, brand text on tint), `--brand-soft` (teal mist: tinted panels), `--line`
(borders), `--page` (parchment background), `--card` (white), plus `--danger`,
`--warning`, `--success` and their `-soft` tints. Older names (`--teal`,
`--heading`, `--body`, `--muted` and so on) are aliases kept for old markup;
don't use them in new code.

**Type.** Noto Sans for everything (Noto Sans Devanagari for Hindi), no italics
anywhere. Headings are weight 600. Scale: `.hero-title` (home only),
`.page-title`, `.page-title-sm` (case, filing and admin screens), `.section-title`,
`.subsection-title`; card titles are plain `h3` at 20px. The system monospace is
for codes, hashes, reference numbers and raw links only.

**Labels.** One style, `.eyebrow`: 13px, 600, uppercase, 0.08em tracking, brand
teal. Used above titles, for section labels and table heads.

**Shape.** One corner radius, `--radius-box` (12px), for every box, card, panel,
input and menu. Buttons, chips and step numbers stay fully round.

**Layout.** Content max width 1280px; side margin `--gutter` grows from 20px to
96px. Page headers use `.page-hero` spacing; sections use `.section-pad`.

**Buttons.** Two only: `.btn-primary` (teal fill, one per screen) and
`.btn-secondary` (outline, teal tint on hover). `.btn-arrow` adds an arrow.

**Surfaces.** Three: the page (parchment), cards (white with a hairline), and
tinted bands (`--brand-soft`: `.zone-sunset` closing bands, `.home-help-band`,
`.filing-intro`).

**Navigation.** Five groups (The issue, Who we help, Support, Resources, About),
each opening a dropdown of every page in it; the group holding the open page is
highlighted. Defined once in `src/components/layout/nav-config.ts` for both the
desktop dropdowns and the phone menu.

**Illustrations.** Line art from `public/images/illustrations/`, through the
`Illustration` component. Prompts for new ones: `docs/design/illustration-drafts/image-prompts.md`.
Never on question or signing screens; never a person on under-18 pages.

## 1. Color

Palette is disciplined: white surfaces, near-black ink, one strong brand color
(teal), and one warm accent used sparingly. No second button color, no rainbow.

### Brand

| Token | Hex | Use |
|---|---|---|
| `--teal` | `#0a5e5a` | Primary brand. Buttons, links, active states. |
| `--teal-dark` | `#084c49` | Button/link hover. |
| `--teal-soft` | `#e6f3f1` | Tint backgrounds, badges, quiet highlights. |
| `--accent` | `#e2673f` | Warm coral. ONE highlighted word or small emphasis only. Never a second button. |
| `--accent-soft` | `#fdeee7` | Tint behind accent emphasis. |

### Neutrals (ink on white)

| Token | Hex | Use |
|---|---|---|
| `--surface` | `#ffffff` | Primary background and cards. |
| `--surface-muted` | `#f6f7f7` | Alternating section background, subtle. |
| `--background` | `#ffffff` | Page background (was warm cream; now clean white). |
| `--foreground` | `#111827` | Headings, strong text. |
| `--body` | `#374151` | Body copy. |
| `--muted` | `#6b7280` | Secondary text, captions, eyebrows on dark. |
| `--border` | `#e5e7eb` | Card and input borders. |
| `--hairline` | `#eef0f2` | Dividers. |

### Status (functional, not decorative)

| Token | Hex | Use |
|---|---|---|
| `--success` | `#12805c` | Confirmed, signed, verified. |
| `--warning` | `#b45309` | Caution, "detected", needs attention. |
| `--danger` | `#b42318` | Errors, emergency (sextortion "do not pay"). |

### Contrast rules (WCAG AA is the floor)

- Body text and headings on white: use `--foreground`/`--body`, both pass AA.
- Teal `#0a5e5a` with white text on buttons: passes AA. Do not put teal text
  smaller than 16px on `--teal-soft`; use `--teal-dark` for small teal text.
- `--muted` is for 14px+ secondary text only, never for body paragraphs.
- Accent coral is for emphasis, never for body text or long runs.

## 2. Typography

One typeface does everything: **Noto Sans** (weights 400, 500, 600), chosen
because it pairs with **Noto Sans Devanagari** for Hindi. The system monospace
stack is used only for technical strings (hashes, reference numbers).

### Families

```
--font-sans:    "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif
--font-display: same as sans (headings are weight + size, not a different face)
--font-mono:    ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
```

### Scale (rem, 16px base). Headings use clamp() for responsive hero.

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Display (hero H1) | clamp(2.5rem, 6vw, 4.5rem) | 800 | 1.05 | -0.03em |
| H2 (section) | clamp(1.75rem, 4vw, 2.75rem) | 700 | 1.12 | -0.02em |
| H3 | 1.375rem | 700 | 1.2 | -0.015em |
| H4 | 1.125rem | 600 | 1.3 | -0.01em |
| Lead paragraph | 1.125rem | 400 | 1.7 | 0 |
| Body | 1rem | 400 | 1.65 | 0 |
| Small / caption | 0.875rem | 500 | 1.5 | 0 |
| Eyebrow | 0.75rem | 600 | 1.4 | 0.14em, uppercase |
| Mono label | 0.6875rem | 600 | 1.4 | 0.04em |

### Devanagari handling (carried from current site, keep it)

- No negative letter-spacing on Hindi (it collapses matras). `html[lang="hi"]`
  sets `letter-spacing: 0`.
- Taller line-height for Hindi headings (~1.35 to 1.45) for stacked diacritics.
- Never hard-code Latin-only tracking on a shared element without a Hindi override.

## 3. Spacing, layout, radius, shadow

### Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120` px. Use these only.

### Layout

- Content container: `min(1200px, 100% - 40px)`, centered.
- Reading measure for long text: max ~68 characters (`max-width: 42rem`).
- Section vertical rhythm: 80px mobile, 120px desktop between major sections.
- Generous whitespace is a feature, not empty space. Do not crowd.

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius` | 12px | Inputs, small elements. |
| `--radius-lg` | 18px | Cards, media, large panels. |
| Buttons | 999px (pill) | All buttons are pills. |

### Shadow (soft, sparing)

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(17,24,39,0.05)` | Inputs, resting cards. |
| `--shadow-soft` | `0 16px 45px rgba(17,24,39,0.07)` | Raised cards, popovers. |

## 4. Components

### Buttons (all pills)

- **Primary**: teal fill `--teal`, white text, weight 600, hover `--teal-dark`.
  Min height 48px, padding 0 24px. This is the "Get help" button.
- **Secondary**: white fill, 1px `--border`, `--foreground` text, hover
  `--surface-muted`. For "Learn more" style actions.
- **Ghost/link**: no fill, teal text, underline on hover. Inline actions.
- One primary button per view. Never two filled buttons competing.

### Header (fixed, must stack above content)

- White background, 1px `--hairline` bottom border, subtle blur optional.
- `position: relative; z-index: 50` on the header so dropdowns paint above the
  page (this was a real bug before; bake the fix into the system).
- Logo left; nav links; **Get Help** primary button; language toggle.
- Mobile: hamburger that toggles to X, dropdown panel with `z-index` above content,
  closes on link tap / outside tap / Escape (keep the working MobileMenu behavior).

### Cards

- White, 1px `--border`, `--radius-lg`, `--shadow-sm` at rest.
- Hover (interactive cards only): lift to `--shadow-soft`, 150ms ease.
- Internal padding 24px (mobile) to 32px (desktop).

### Eyebrow

- Uppercase, 0.75rem, 600, `letter-spacing: 0.14em`, color `--teal`. Optional
  short leading rule. Opens most sections (the Thorn rhythm).

### Badge / pill (informational)

- `--teal-soft` background, `--teal-dark` text, pill, 0.75rem. For small tags,
  language notes, "supported by" credits.

### Forms

- Inputs: min height 48px, 1px `--border`, `--radius`, white, clear label above.
- Focus: 3px teal-tinted outline, `outline-offset: 3px` (keep current focus style).
- Error state uses `--danger` text and border, never color alone (include text).

### Section pattern (the reusable rhythm)

Every content section follows: **eyebrow, headline (H2), one-paragraph promise,
content (grid/list/media), single closing CTA.** This consistency is what makes
the site read as one authored platform.

### Trust strip (honest, replaces Thorn's big-number wall)

Row of 3 to 4 tiles, each a short capability fact, not an invented metric:
"Your image never leaves your device", "Grounded in the IT Rules and MeitY SOP",
"English and Hindi", "Built by JAMSAQ Studio, independent". When real numbers
exist, add them with a footnote on small samples.

## 5. Iconography and imagery

- **Icons**: single-line style, 1.75px stroke, rounded caps and joins, 20 to 24px.
  Consistent set (the current SVGs already follow this; keep it).
- **Imagery**: calm and human, never graphic, and never depicting a victim or
  intimate content (a hard brief rule). Prefer restrained abstract shapes, soft
  gradients, or respectful everyday imagery (a hand with a phone, a calm room).
  No stock "distressed person head-in-hands" cliches, that reads as charity.
- **No image ever implies the harm itself.** The story is told in words and calm
  visuals, the same constraint Thorn solves with copy.

## 6. Motion

- Restrained. Entrance: subtle fade + 12 to 16px rise, 400 to 500ms, ease-out,
  once. Hover/transitions: 150 to 200ms.
- No scroll-jacking, no pinned scroll sequences, no heavy parallax, no custom
  cursors. These hurt survivors on slow phones and were why the template redesign
  was rejected.
- Respect `prefers-reduced-motion`: disable non-essential motion entirely.

## 7. Accessibility (non-negotiable)

- WCAG 2.1 AA contrast minimum, checked for every text/background pair.
- Tap targets 48x48px minimum.
- Visible keyboard focus on every interactive element (teal outline).
- Semantic HTML, real headings order, labelled inputs, alt text on meaningful images.
- Do not block zoom (allow user scaling, like Thorn does).
- Every page fully usable in English and Hindi; language toggle preserves the page.
- Plan for the survivor-safety layer (Quick Exit, neutral titles, noindex on any
  future dashboards) as components are built.

## 8. Out of scope for now

- Dark mode (light only for launch; tokens are structured so it can be added later).
- Motion-heavy showpiece animations (deliberately excluded).

## 9. Token migration map (for document 4 / implementation)

Existing `globals.css` variables to update: `--background` (cream to white),
`--foreground`, `--muted`, `--border`, `--hairline`, `--teal*` (keep),
`--radius`, `--radius-lg`, `--shadow-soft`. Add: `--surface-muted`, `--body`,
`--accent`, `--accent-soft`, `--success`, `--warning`, `--danger`, `--shadow-sm`.
Replace serif display font with Inter Tight (remove Instrument Serif). Buttons
move to pill radius and teal fill. Header gets `z-index: 50`.
