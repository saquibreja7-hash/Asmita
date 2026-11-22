---
name: Meri Asmita
description: Warm parchment editorial system with a single teal action, hairline structure, and pill buttons — calm record-keeping for a survivor-support organization.
colors:
  parchment: "#f6f3f1"
  brand-teal: "#0a5e5a"
  brand-strong: "#08443f"
  teal-mist: "#d4e9e6"
  teal-sky: "#9fcac4"
  mint: "#a7fccd"
  coral: "#ff9473"
  crimson: "#f37a0a"
  gold: "#ecda98"
  off-black: "#242424"
  graphite: "#4e4d4d"
  smoke: "#625f5e"
  ash: "#cecac8"
  card-white: "#ffffff"
  surface-muted: "#efebe8"
  danger: "#b42318"
  danger-soft: "#f8e1de"
  success: "#176b42"
  success-soft: "#dff5ea"
  warning: "#9a5b00"
  warning-soft: "#f3ead0"
typography:
  display:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.01em"
    lineHeight: 1.2
  body:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "13px"
    letterSpacing: "0.08em"
  reading-body:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "17px"
    lineHeight: 1.75
rounded:
  box: "12px"
  cards: "40px"
  buttons: "100px"
  pills: "9999px"
spacing:
  unit: "8px"
  gutter: "clamp(20px, 6vw, 96px)"
  section-gap: "64px"
  card-padding: "40px"
  element-gap: "16px"
components:
  button-primary:
    backgroundColor: "{colors.brand-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.buttons}"
    padding: "14px 32px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brand-strong}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.off-black}"
    rounded: "{rounded.buttons}"
    padding: "14px 32px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.teal-mist}"
    textColor: "{colors.brand-strong}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.box}"
    padding: "40px"
  card-elevated:
    backgroundColor: "{colors.teal-mist}"
    textColor: "{colors.off-black}"
    rounded: "{rounded.box}"
  input:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.off-black}"
    rounded: "{rounded.box}"
    padding: "12px 16px"
    height: "48px"
  pill:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.off-black}"
    rounded: "{rounded.pills}"
    padding: "10px 18px"
---

# Design System: Meri Asmita

## Overview

**Creative North Star: "The Calm Ledger"**

Asmita is a survivor-support organization, and the site reads like a carefully kept public record printed on warm paper: a parchment canvas that is never pure white, structure carried entirely by 1px Ash hairlines and type, and exactly one decisive voice per screen — the brand teal fill of a single primary button. Nothing shouts. Pastels (mint, coral, gold, sky) exist only as soft atmospheric washes blurred behind heroes and as one tinted card; they never carry information.

Density is airy and generous (section padding clamps from 64px to 120px), type is a humanist sans (Noto Sans, with Noto Sans Devanagari for Hindi) at weight 600 for headings and 400 for body, and every corner is either a soft 12px box, a 40px card, or a full pill button. The result feels official without feeling governmental, warm without being soft about a hard subject.

**Key Characteristics:**
- Parchment canvas (`#f6f3f1`), cards white, one tinted teal-mist band or elevated card per page.
- One primary action per screen: brand teal pill; secondary is an ink outline.
- Hairline Ash borders instead of shadows; depth comes from tone, not elevation.
- Eyebrow labels (13px, uppercase, 0.08em tracking, teal) sit above every page title and section.
- Hindi drops letter-spacing and uppercase transforms, gains taller line-height (1.35).
- Illustrations are flat, friendly webp scenes in `/images/illustrations/`, decorative and aria-hidden.

## Colors

One accent carries every action; pastels are atmosphere only.

### Primary
- **Brand Teal** (#0a5e5a, from the logo): links, accents, the primary button, eyebrow labels, focus rings. Hover state is Brand Strong (#08443f).
- **Teal Mist** (#d4e9e6): the soft tint for callouts, tinted bands (`.zone-sunset`), icon tiles, table headers, and the one elevated card.

### Secondary
- **Coral** (#ff9473) and **Crimson** (#f37a0a): decorative washes only (hero blur blobs); never text or actions.
- **Mint** (#a7fccd) and **Gold** (#ecda98): decorative washes and small accents on dark surfaces.

### Neutral
- **Parchment** (#f6f3f1): the page background, never pure white.
- **Off-Black** (#242424): headings and main text (the `--ink` role).
- **Graphite** (#4e4d4d): body copy (the `--text` role).
- **Smoke** (#625f5e): hints and captions.
- **Ash** (#cecac8): every border, divider, and hairline.
- **Card White** (#ffffff): raised surfaces only (cards, panels, tables).

### Named Rules
**The One Voice Rule.** Brand teal fills at most one primary button per screen. Its rarity is the point; secondary actions are ink outlines.
**The No-Shadow Rule.** `--shadow-sm` and `--shadow-soft` are `none`. Structure comes from 1px Ash hairlines and tonal steps, never from drop shadows.

## Typography

**Display Font:** Noto Sans (with Noto Sans Devanagari)
**Body Font:** Noto Sans (with Noto Sans Devanagari)

**Character:** A single humanist sans does everything; hierarchy is made of weight (400 body / 600 headings), size, and tracking, not family contrast. Devanagari resets negative tracking to 0 and raises heading line-height to 1.35.

### Hierarchy
- **Hero title** (600, clamp 40px→72px, lh 1.06): home page only.
- **Page title** (600, clamp 34px→56px, lh 1.1, -0.015em): one per page, under an eyebrow.
- **Section title** (600, clamp 26px→40px, lh 1.15): major sections.
- **Subsection title** (600, clamp 20px→24px, lh 1.25): card groups and Reading sections.
- **Card title** (600, 20px, lh 1.2): plain `h3` inside cards.
- **Body** (400, 16px, lh 1.5; long-form 17px, lh 1.75, ~68ch max): everything else.
- **Label / eyebrow** (600, 13px, uppercase, 0.08em tracking, teal): the one label style for section markers, table heads, and admin field labels.

### Named Rules
**The Single Label Rule.** There is one label style — the teal uppercase eyebrow. Do not invent competing label styles.
**No Italics Rule.** `text-wrap: balance` on headings, no italic anywhere on the site.

## Layout

Container: `min(1280px, 100% - 2 × gutter)`, gutter `clamp(20px, 6vw, 96px)`, centred. Vertical rhythm is the `.section-pad` clamp (64px→120px top and bottom); the page hero uses slightly less bottom (`.page-hero`). Pages stack zones: `.hero` (parchment + optional blurred wash), alternating `.zone-white` / `.transform-section` zones that stay parchment — rhythm comes from hairlines and type, not colored bands — and close with a teal-mist `.zone-sunset` band. The reading layout (`Reading.tsx`) is a 46rem centred column with a sticky 14rem contents rail on wide screens. The admin console is a single centred column of `.a-card` panels on a 36-char sidebar. Breakpoints follow Tailwind defaults (sm 640, md 768, lg 1024); phones get one column and stacked cards, checked at 360px.

## Elevation & Depth

Flat by doctrine. `--shadow-sm: none`, `--shadow-soft: none`; cards are white-on-parchment with an Ash hairline. The only permitted depth cues are tonal (white cards on parchment, teal-mist bands, the dark inverted `.module-dark` card) and one soft filing-card shadow (`0 24px 60px -36px rgba(10,94,90,0.35)`) used on the complaint-filing form card. Atmospheric depth comes from large blurred gradient washes (`.wash`, blur 70px, opacity 0.8) behind hero content, never above it.

## Shapes

Two radii for structure and one for action: boxes, cards, panels, inputs, and images all use the soft 12px box radius (`.card-elevated` scenes may use 40px); buttons and pills are fully round (100px). Tags and filter chips are 9999px pills with an Ash hairline and parchment fill, 12px uppercase text. Focus is a 2px brand-teal outline with a 3px offset on every interactive element. There are no left-border accent stripes on cards or callouts — a callout is a teal-mist rounded box with an icon.

## Components

### Buttons
- **Shape:** full pill (100px radius), min-height 48px.
- **Primary:** brand teal fill, white text, 14px 32px padding; hover deepens to #08443f. One per screen.
- **Secondary:** transparent with 1px ink outline; hover tints teal-mist with brand-strong text.
- **Link style:** `.btn-link` / `.text-link` underline with ash decoration that colours on hover; `.arrow-link` is a 14px uppercase link with a trailing → that nudges right on hover.

### Chips (pills / tags)
- **Style:** parchment fill, 1px ash border, 12px uppercase text with -0.033em tracking, 10px 18px padding, fully round; an optional 6px teal dot leads the text.

### Cards / Containers
- **Corner:** 12px (`--radius-box`), 1px ash border, white fill, 40px internal padding.
- **Elevated card:** the one coloured surface — teal-mist fill, transparent border, optional blurred wash art in the top-right corner.
- **Dark card:** off-black fill, parchment text, mint accents — used sparingly for inverted feature panels.

### Inputs / Fields
- **Style:** 48px min-height, 1px ash border, parchment fill, 12px radius, 16px text; placeholder in smoke. Focus shifts the border to off-black (filing form uses teal + 4px teal-mist ring). Errors use the `--danger` text colour with field-level messages.

### Navigation
- Header: wordmark left, eyebrow-style uppercase group links with hover teal-mist tint; on phones a sheet menu. Admin: a dark sidebar of small-caps sections filtered by permission, `.a-card` content panels, teal `a-count` badges.
- Footer: parchment, hairline top, wordmark + 3 link columns + language toggle, helpline numbers in the bottom bar.

### Illustration
- Flat friendly webp scenes from `/images/illustrations/` via the `Illustration` component (sized table, aria-hidden, lazy); heroes put the scene right of the copy on wide screens via `.page-hero-split`, under it on phones. Existing set: `page-*` scenes per section, `issue-*`, `audience-*`, `home-hero`, `done-relief`, etc.

## Do's and Don'ts

### Do:
- **Do** reuse AppShell, the eyebrow → page-title → lede hero pattern, `.section-pad` zones, `.card`, `.data-table`, `Reading.tsx` blocks, and existing `Illustration` scenes before inventing anything new.
- **Do** keep exactly one `.btn-primary` per screen; make every other action `btn-secondary` or a text link.
- **Do** use the teal eyebrow for every section label, and `.pill` / `.tag` for filter chips and status marks.
- **Do** show honest empty states in a bordered `surface-muted` panel with one useful next action, as /research does.
- **Do** verify 360px phone width: one column, buttons full-width where needed, no horizontal scroll; and keep Hindi labels from wrapping badly (no negative tracking in Devanagari).

### Don't:
- **Don't** add drop shadows to cards, coloured left-border accent stripes on cards or callouts, or new accent colours.
- **Don't** use pure white (`#fff`) as a page background, gradients on buttons, or uppercase transforms in Hindi.
- **Don't** redesign /start or any complaint-workflow screen; org pages are refinements inside this world.
- **Don't** load a third-party icon set or illustration style; extend `Icon.tsx` (Lucide paths) and `Illustration.tsx` (the `/images/illustrations` set) instead.

---

# Asmita design system

## Colors

Use semantic tokens from `src/app/foundation-styles.css`. Parchment `#f6f3f1` is the page background, white `#ffffff` is a raised surface, and deep teal `#0a5e5a` is reserved for actions and links.

## Typography

Use Noto Sans with Noto Sans Devanagari for Hindi. Use monospace for codes, fingerprints and technical references. Give Hindi headings room to breathe and use regular character spacing.

## Layout

Editorial pages can use Asmita’s illustrations to introduce a subject. Urgent help and forms place the first useful action above the fold on a small screen. Prefer a list when several elements share one purpose. Use distinct, descriptive actions on help and task screens. Keep breadcrumbs, stage labels, meaningful timing and source information clear. Combine or remove labels that repeat a heading.

## Interaction

Support keyboard navigation, visible focus and reduced motion. Use native disclosure controls for optional detail. If an overlay covers other controls, keep focus inside it while it is open and restore focus on dismissal. Verify both languages at 320 px and near the desktop navigation breakpoint.

## Components

Use the shared buttons for actions, lists for grouped options and plain links for navigation in running text. Use the standard 12 px corner radius for panels and inputs. Pair form errors with their affected control and keep the next action visible.

See [the full design system](docs/design/03-design-system.md) for maintained component guidance.
