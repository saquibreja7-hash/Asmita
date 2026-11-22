# Asmita design

The single source for how the Meri Asmita site looks, reads and behaves. If a rule here and older code disagree, this file wins; fix the code. Owner decisions are marked **(owner)** and are not reopened without the owner.

Last updated: 2026-11-21.

## 1. Principles

- **The survivor comes first.** Our first audience is often a survivor on a cheap Android phone, in distress, with little patience for jargon. Calm, fast, obvious paths beat everything else. The site must still look credible to researchers, press, partners and platforms.
- **Calm authority, not alarm.** Serious and factual. No fear, urgency banners or dramatic language to push action.
- **Honest about limits.** Never overpromise (no "we will erase it from the whole internet"). Say what we can and cannot do. Never invent metrics, partners or endorsements.
- **Bilingual by default.** English and Hindi are equal. Every page works fully in both.

## 2. Colour

Use the semantic tokens in `src/app/foundation-styles.css`. Never hard-code colours in components.

| Token | Use |
|---|---|
| `--page` | Page background: plain white `#ffffff` **(owner, 2026-11-21)** |
| `--card` | Raised surfaces (white) |
| `--ink` | Headings and main text |
| `--text` | Body copy |
| `--text-muted` | Hints and captions only (never body paragraphs) |
| `--brand` | Deep teal `#0a5e5a`: links, accents, primary buttons |
| `--brand-strong` | Brand hover; brand text on `--brand-soft` |
| `--brand-soft` | Teal mist: tinted panels and bands |
| `--line` | Borders and dividers (light neutral `#e3e1df`) |
| `--coral`, `--coral-soft`, `--coral-ink` | The logo's warm orange. Fills and rules use `--coral`/`--coral-soft`; text and icons use `--coral-ink` (5:1 on white). Use it for ordered-step markers and warm highlights, never for buttons. |
| `--danger`, `--warning`, `--success` (+ `-soft`) | Status only, never decoration |

- Teal is the strong colour for actions. No second button colour. Orange is the warm secondary colour for markers and highlights.
- Gradients only where they carry warmth into a closing band (teal mist into orange soft); never on buttons or text.
- Old aliases (`--teal`, `--heading`, `--body`, `--muted` and so on) exist for old markup only; don't use them in new code.
- WCAG 2.1 AA contrast is the floor for every text and background pair. Small teal text on `--brand-soft` uses `--brand-strong`.
- Light mode only for now.

## 3. Typography

- **Noto Sans** for everything, **Noto Sans Devanagari** for Hindi. No italics anywhere.
- Headings are weight 600. Scale: `.hero-title` (home only), `.page-title`, `.page-title-sm` (case, filing and admin screens), `.section-title`, `.subsection-title`. Card titles are plain `h3` at 20px. The type sizes are the `--text-*` tokens.
- System monospace only for codes, fingerprints, reference numbers and raw links.
- **Hindi:** no negative letter-spacing (it breaks matras); `html[lang="hi"]` sets it to 0. Give Hindi headings taller line-height (about 1.35 to 1.45). Never add Latin-only tracking to a shared element without a Hindi override.
- Long text keeps a readable measure (about 68 characters). Use `text-wrap: pretty` for paragraphs where it helps. Longer text and legal headings stay in normal case.

## 4. Layout

- Content max width `--page-max-width` (1280px). Side margin `--gutter` grows from 20px to 96px.
- Editorial pages use `.page-hero` and `.section-pad`, and may open with an illustration that introduces the subject.
- Urgent help, filing and other task screens use a compact introduction so the first useful action is visible in the first screen on a phone.
- Prefer a list when several items share one purpose. Combine or remove labels that repeat a heading.
- Keep breadcrumbs, stage labels, meaningful timing and source or verification details clear.
- Check both languages at 320px and near the desktop navigation breakpoint.

## 5. Shape and surfaces

- One corner radius, `--radius-box` (12px), for every button, box, card, panel, input and menu, on every page including admin. Square-cornered design, no pill buttons. **(owner)** Only small chips, badges and step numbers stay round.
- Three surfaces: the page (parchment), cards (white with a hairline border), and tinted bands (`--brand-soft`: `.zone-sunset`, `.home-help-band`, `.filing-intro`).
- **No coloured left-border accent stripes** on cards or panels. **(owner)**

## 6. Components

- **Buttons:** two only. `.btn-primary` (teal fill, 12px corners, one per screen) and `.btn-secondary` (outline, teal tint on hover). `.btn-arrow` adds an arrow. Use the shared buttons for actions and plain links for navigation in running text.
- **Navigation:** groups with dropdowns, defined once in `src/components/layout/nav-config.ts` for both the desktop dropdowns and the phone menu. The group holding the open page is highlighted. The header switches to the compact Menu until the whole desktop menu and its actions fit, and keeps "File a complaint" visible beside Menu at middle widths.
- **Footer:** the brand column (logo, one-line description, language switch, newsletter) plus **three link columns**: Get help, The issue, Organization. Privacy, Sitemap and Status sit as small links in the bottom bar with the helplines and copyright. Don't add a fourth link column. **(owner)**
- **Forms:** clear label above each input, minimum 48px height. Errors sit next to the field they belong to, use text (never colour alone), and keep the next action visible.
- **Optional detail:** use native disclosure (`<details>`).
- **Overlays and modals:** keep focus inside while open, close on Escape, and return focus to the control that opened them.

## 7. Illustrations and imagery

- Line-art illustrations from `public/images/illustrations/`, through the `Illustration` component. Prompts for new ones: `docs/design/illustration-drafts/image-prompts.md`.
- Never on question or signing screens. Never a person on under-18 pages.
- Calm and human, never graphic. Never depict a victim, intimate content or the harm itself. No "head in hands" stock clichés.
- Icons: single-line style, rounded caps and joins, 20 to 24px.

## 8. Motion

- Restrained: hover and transitions 150 to 200ms; at most a subtle fade on entrance.
- No scroll-jacking, pinned scroll sequences, heavy parallax or custom cursors.
- Under `prefers-reduced-motion`, no transitions or animations run.

## 9. Accessibility (non-negotiable)

- WCAG 2.1 AA. Tap targets at least 48×48px. Visible keyboard focus on every interactive element.
- Semantic HTML, headings in order, labelled inputs, alt text on meaningful images.
- Never block zoom.
- The language switch keeps the visitor on the same page.

## 10. Content and voice

- Plain, human and specific. Short sentences. Explain any legal term you use.
- Titles and links in the survivor's own words ("Someone is threatening to share my photos"), with the formal term (NCII) second.
- Safety and helplines come before instructions: 112, then women's helpline 181, Childline 1098 for minors, then NCRP.
- Say what a notice can and cannot achieve before the survivor signs.
- Put safety limits inside the instruction they apply to, not on a separate page.
- Short content warning at the top of pages that discuss distressing material.
- Copy must translate cleanly into Hindi: no idioms. Banned: pity, "empowerment" clichés, marketing filler.
- When a route moves, add a redirect from the old path.

## 11. Owner decisions

- No Quick Exit button on public pages. **(owner)**
- No CSS cascade layers (`@layer`). **(owner)**
- Keep the `/start` page's original design. **(owner)**
- Nothing about donations yet: no donate buttons, donation asks, fundraising copy or "support us" money language anywhere on the site, until the owner decides otherwise. **(owner)**
- No coloured left-border accent stripes. **(owner)**
- Footer: brand plus three link columns. **(owner)**
