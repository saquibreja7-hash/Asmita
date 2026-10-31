# Asmita Design System

Status: draft for alignment
Owner: Saquib
Last updated: 2026-08-05
Builds on: `01-brand-brief.md`, `02-information-architecture.md`.

Direction chosen: **clean modern platform** (white background, deep teal as the
single strong color, generous whitespace) with **modern neutral sans** typography
(Inter Tight, paired with Noto Sans Devanagari for Hindi). Reads as a serious tech
platform, not a charity. This is document 3 of 4. Values are concrete so document
4 (page templates) can implement directly. Token names map to the existing
`globals.css` variables where possible, so this is an evolution, not a rewrite.

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

One typeface does everything: **Inter Tight** (weights 400, 500, 600, 700, 800).
Hindi uses **Noto Sans Devanagari**. Optional **Geist Mono** for small technical
labels (hash strings, reference numbers) only.

### Families

```
--font-sans:    "Inter Tight", "Noto Sans Devanagari", system-ui, sans-serif
--font-display: same as sans (headings are weight + size, not a different face)
--font-mono:    "Geist Mono", ui-monospace, monospace
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
