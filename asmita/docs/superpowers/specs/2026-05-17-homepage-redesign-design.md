# Homepage Redesign — Design Spec

**Date:** 2026-05-17
**Author:** Drafted via Claude Code, using the `brainstorming` skill (`superpowers@claude-plugins-official`) workflow.
**File under change:** `src/app/(public)/page.tsx`
**Supporting file:** `src/app/globals.css`

## 1. Goal

Replace the current homepage with a clean, minimalistic, modern page that conveys Asmita's motto immediately and stays out of the user's way. Inspirations: Stripe (structural restraint), Notion (warmth), OpenAI / ChatGPT page (centered super-minimal hero, large quiet typography).

The current iteration suffers from two specific complaints raised during brainstorming:

1. Alternating section background colors made the page read as a series of disconnected panels rather than one continuous canvas.
2. The dark hero felt heavy and out-of-key with the rest of the page.

This spec resolves both by collapsing the page onto one continuous warm-paper canvas and reducing the body to a small number of large, quiet text blocks.

## 2. Non-goals

- No new routes, no changes to `/start`, `/how-it-works`, `/privacy`, `/faq`, `/minor-support`.
- No changes to the global `AppShell` (Header, Footer, SupportPanel).
- No new icon library, no stock photography (locked design decision).
- No new i18n keys — homepage marketing copy stays English-primary with a bilingual identity in the eyebrow, matching the current site.
- No product mockup or dashboard preview in the hero.

## 3. Locked design decisions inherited from the project

These come from the UX/UI design plan and prior brainstorming (memory: `project_asmita_docs`). They are not re-litigated here.

- Visual language: Stripe structure + Notion warmth.
- Background: `#fbfaf7` warm off-white (`--background`).
- Accent: `#0a5e5a` deep teal (`--teal`).
- Typography: Inter (Latin) + Noto Sans Devanagari, self-hosted.
- Tone: warm, human, trauma-informed — "You don't have to face this alone" register.
- No photography, no clinical/government aesthetic.

The previously locked `#0D1F1E` dark hero is **explicitly overridden** by this spec at the user's request. The dark-hero variant is removed from the codebase entirely.

## 4. Page structure

One continuous warm-paper canvas top-to-bottom. The page contains five vertical regions, separated only by whitespace (≈160px desktop / ≈96px mobile). No hairlines, no per-section background switches, no cards.

```
+---------------------------------------------------+
| Header (AppShell, unchanged)                      |
+---------------------------------------------------+
|                                                   |
|   1. HERO                                         |
|      eyebrow pill                                 |
|      huge centered headline (one gradient word)   |
|      short subhead                                |
|      [ Start a case ]                             |
|      Under 18? Find help →                        |
|      tiny privacy footnote                        |
|                                                   |
+---------------------------------------------------+
|                                                   |
|   2. BLOCK A — "Indian law gives you a right.     |
|      Asmita turns it into a flow."                |
|      short subhead → How notices route →          |
|                                                   |
+---------------------------------------------------+
|                                                   |
|   3. BLOCK B — "Privacy is the architecture,      |
|      not the marketing."                          |
|      short subhead → Read the privacy promise →   |
|                                                   |
+---------------------------------------------------+
|                                                   |
|   4. CLOSING — "Begin when you are ready."        |
|      short subhead                                |
|      [ Start a case ]  [ Read the FAQ ]           |
|                                                   |
+---------------------------------------------------+
| Footer (AppShell, unchanged)                      |
+---------------------------------------------------+
| SupportPanel (AppShell, unchanged)                |
+---------------------------------------------------+
```

Soft ambient mesh gradient (existing `.page-canvas::before`) sits behind all four blocks as a fixed underlayer. This is the only visual texture on the page besides type.

## 5. Components and tokens

### Reused (no change)

- `AppShell`, `Header`, `Footer`, `SupportPanel`, `LanguageToggle`.
- Global tokens: `--background`, `--foreground`, `--muted`, `--teal`, `--teal-dark`, `--saffron`, `--rose`, `--hairline`, `--radius`, `--shadow-soft`.
- Utility classes retained: `.page-canvas`, `.text-gradient`, `.pill`, `.dot`, `.cta-arrow`, `.link-underline`, `.eyebrow`, `.btn`, `.btn-primary`, `.btn-secondary`.

### Removed

The following CSS classes and tokens become unused after this redesign and should be deleted from `globals.css`:

- `.hero-dark`, `.hero-mesh`, `.hero-bleed-bottom`, `.btn-ghost-light`, `.glass`, `.bento`, `.b-wide`, `.b-tall`, `.b-half`, `.b-third`, `.timeline`, `.timeline-rail`, `.numchip`, `.card-soft`, `.card-quiet`, `.mono-label`, `.kbd`.
- Dark-mode tokens: `--ink-deep`, `--ink-deep-2`, `--on-dark`, `--on-dark-muted`, `--on-dark-border`.

Removing these reduces the stylesheet surface area meaningfully and makes future iteration easier.

### Hero-specific ambient accent

The new hero does not need its own background class. The `.page-canvas` ambient mesh provides all the visual texture the page needs. No new CSS classes are introduced by this redesign — the change is strictly subtractive on the stylesheet side.

## 6. Typography

| Element | Mobile size | Desktop size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| Hero `h1` | 44px | 88px | medium | tight | 0.98 |
| Block `h2` | 36px | 64px | medium | tight | 1.05 |
| Subhead | 17px | 20px | regular | normal | relaxed |
| Body / muted | 16px | 16px | regular | normal | 1.7 |
| Eyebrow pill | 12px | 12px | semibold | 0.04em | normal |
| Footnote | 13px | 14px | regular | normal | 1.6 |

`tracking-tight` ≈ `-0.02em`. All `<h1>` / `<h2>` use `font-medium` rather than `font-black` — the modern register from OpenAI / Vercel / Stripe / Linear 2025–2026.

## 7. Copy

Final copy strings are listed once here so the implementation is unambiguous.

- Hero eyebrow: `· Asmita · अस्मिता · for women in India ·`
- Hero h1: `You don't have to face this alone.` — the word `alone` wraps in `<span className="text-gradient">`.
- Hero subhead: `Free, confidential, and built around your dignity.`
- Hero primary CTA label: `Start a case` → `/start`
- Hero safety link: `Under 18? Find help →` → `/minor-support`
- Hero footnote: `We never fetch, view, download, or store the content at any link you share.`
- Block A h2: `Indian law gives you a right. Asmita turns it into a flow.`
- Block A subhead: `Platforms must act on takedown notices within 24 hours. Most people don't know that — we make it usable.`
- Block A link: `How notices route →` → `/how-it-works`
- Block B h2: `Privacy is the architecture, not the marketing.`
- Block B subhead: `URLs are text tokens only. Servers never fetch the pages. Personal data is encrypted per-case.`
- Block B link: `Read the privacy promise →` → `/privacy`
- Closing h2: `Begin when you are ready.`
- Closing subhead: `There is no clock running. You can start, stop, and come back.`
- Closing primary CTA: `Start a case` → `/start`
- Closing secondary CTA: `Read the FAQ` → `/faq`

## 8. Interaction and accessibility

- All CTAs are `<Link>` components rendering anchor elements; min-height 48px from `.btn`.
- Visible focus ring is already configured globally (`:where(a, button, ...) :focus-visible`).
- The minor-safety link is placed immediately below the primary CTA so it stays above the fold on common mobile viewports.
- The page is centered using `text-align: center` on each region. CTAs use `flex justify-center` to stay axis-aligned.
- No JS interactivity is added by this page; existing client components inside `AppShell` (e.g. `LanguageToggle`) are unaffected.
- Gradient text on the word `alone` has a `color` fallback (the teal) for browsers that don't render `background-clip: text` — already handled by `.text-gradient`.

## 9. What gets dropped from the homepage

Each removed element is justified to ensure motto-conveyance is preserved.

| Removed element | Where it lives now |
|---|---|
| 4-step timeline | `/how-it-works` (already exists; linked from Block A) |
| Bento privacy/legal/support/partners grid | `/how-it-works` and `/privacy` and `/faq` |
| Audience-fork cards (adult vs minor) | Hero safety link covers minors; adults default to the primary CTA |
| 4-item trust strip | Hero footnote restates the strongest claim; partners credit moves to `/privacy` |
| Dedicated support block | `SupportPanel` widget is already always visible site-wide |
| Floating glass pill / dark hero / hero-bleed | Removed entirely |

## 10. Risk register and mitigations

| Risk | Mitigation |
|---|---|
| Minor pathway becomes less visible | `Under 18? Find help →` sits directly under the primary CTA, above the fold |
| Page feels too sparse for first-time visitors | Two inline links inside Block A and Block B route to depth pages without busying up the homepage |
| Centered text reads as cold without warmth | Soft ambient mesh, warm paper background, single gradient accent on `alone`, and the eyebrow pill collectively carry the Notion warmth |
| Hindi readers lose signal | Bilingual identity sits in the hero eyebrow; `LanguageToggle` in the header switches the rest of the site copy |
| CSS cleanup risk (removing utilities other pages depend on) | Verify no other route references the removed classes before deletion; `grep -r` step is part of the implementation plan |

## 11. Files to change

- `src/app/(public)/page.tsx` — full rewrite to the new structure and copy.
- `src/app/globals.css` — delete unused utilities and dark tokens. No additions.

No other files change.

## 12. Definition of done

- The new homepage renders on the dev server at `http://localhost:3000` with the structure and copy above.
- `tsc --noEmit` and `eslint` pass for the changed files.
- `grep` confirms no other page references the removed utilities.
- The page renders correctly at 360px, 768px, and 1280px widths.
- The motto headline is the largest visual element on the page.
- The `Under 18? Find help →` link is visible without scrolling on a 667px-tall viewport.
- No new dependencies are added.

## 13. Out of scope (deferred, not forgotten)

- Animating the gradient text or eyebrow pill (a small idle pulse) — deliberately omitted, but easy to add later if the page feels static.
- A Hindi marketing-copy variant — the i18n surface for the homepage is unchanged. Hindi expansion would be a follow-up.
- A logo lockup or wordmark refresh — Asmita-as-text is sufficient for now.

## 14. Amendments since v0.1

This section tracks changes the homepage and the wider public surface received after the initial spec was approved on 2026-05-17. Each amendment is additive — none of them reopens a decision recorded above.

### 14.1 StopNCII-inspired additions to the homepage (2026-05-17)

After comparing notes against `stopncii.org`, five small additions were folded into the homepage:

1. **Bilingual nudge under the hero pill** — a 12px muted line "Available in English and हिंदी" that quietly signals the language toggle exists.
2. **Validation block between hero and Block A** — a single serif sentence "What you're feeling is valid. None of this is your fault." rendered in `font-display` at 20/24px with no heading and no CTA. Establishes the trauma-informed register before the practical content.
3. **Block A rewritten as a question** — "Did you know Indian law requires platforms to act in 24 hours?" mirrors the StopNCII pattern of meeting visitors where they are.
4. **Block B (privacy) split into three concrete commitments** — each line opens with a bolded "We never X." statement. Reads faster than the prior run-on subhead.
5. **Muted partner-credit line under the closing CTA** — "Notice templates reviewed by Internet Freedom Foundation and SFLC.in." in 13px muted text.

CTA repetition was deliberately not added. The hero CTA + closing CTA pattern is unchanged.

### 14.2 Typography upgrade (2026-05-17)

The hero text felt cramped at the initially specified sizes. Three changes were made:

1. **Wired `next/font` properly.** Inter, Geist Mono, and Instrument Serif are loaded via `next/font/google` with `display: "swap"`. `--font-sans`, `--font-mono`, and `--font-display` reference the next/font variables rather than name strings.
2. **Added Instrument Serif.** A modern editorial serif applied to every `<h1>` / `<h2>` via a new `.font-display` utility — the pairing used by Vercel, Stripe Press, and similar editorial-leaning product sites.
3. **Inter humanist stylistic sets.** `font-feature-settings: "ss01", "cv11", "kern"` applied globally; gives Inter the single-storey `a`, rounder `g`, and smaller `t` — the trick that makes Inter feel like Söhne.
4. **Calibrated sizes and leading.** Hero `h1` dropped 88px → 68px desktop; block `h2`s 64px → 52px; subheads 20px → 18px. Leading loosened in matching ratio (`0.98` → `1.06` on the hero, `1.05` → `1.12` on block h2s, body subheads to `1.7`–`1.75`).

### 14.3 Design system applied to the rest of the public site (2026-05-17)

The same canvas / pill / serif-headline / mono-label / gradient-accent / closing-CTA system has been applied page-by-page to every other public route, with adaptations described per page:

| Route | Adaptation |
|---|---|
| `/how-it-works` | Sequential quiet step blocks with mono `Step 01`–`04` labels; tier and timeline content rendered as text-led blocks rather than panel cards. |
| `/resources` | Grouped into five categories. Phone numbers and URLs rendered in Geist Mono at 28/40px as the focal element of each block. Emergency contacts placed first. Source lines replaced with a single verified-date mono label in the hero. |
| `/faq` | Each FAQ as a stacked centered block. English question/answer in `font-display`/muted, Hindi follows with `lang="hi"` and looser leading (`1.85`) to accommodate Devanagari. |
| `/privacy` | Long-form policy — kept hero centered but **left-aligned the body of each numbered section** within the same column, since centered prose is hard to read at length. 16 numbered sections with a TOC, anchor IDs, `scroll-mt-20`. Substantive content drafted against `asmita/docs/legal/dpdp-rules-check-2026-05-12.md` and the actual `src/lib/` modules. |
| `/contact` | Five named contact channels with `Channel 01`–`05` mono labels and Geist Mono email addresses. Response-times block pins concrete SLAs to the DPDP Act. |
| `/terms` (and `/legal` re-export) | Same long-form pattern as Privacy. 16 numbered sections covering eligibility, declaration + BNS 199 consequences, acceptable use, rate limits, NGO vouching, IP, termination, indemnity, limitation, governing law (India, Delhi courts). |
| `/feedback` | `AppShell` wrapper added. Form rendered as three labeled rows (no panel). Rating select rewritten with descriptive labels ("5 · Felt supported"). Success state moved to serif `font-display`. |
| `/start` | Age-gate redesigned as two centered "Path 01" / "Path 02" blocks. Adult path → `/register`. Minor path → `/start/minor`. Safety note + 112 reminder before the closing. |
| `/minor-support` | Validation line + three grouped sections (emergency / removal services / reporting). TakeItDown and StopNCII named explicitly. POCSO context explained as "why Asmita does not handle this directly." |
| `/offline` | Single quiet centered block under `.page-canvas`. Pill eyebrow + serif h1 + offline reassurance. |
| `/not-found` | 404 reframed: pill "Page not found · 404", serif h1 "This page isn't here.", three CTAs (Start / Resources / How it works). |

### 14.4 CSS surface

Beyond what section 5 listed for the homepage, no further `globals.css` changes were needed for any of the follow-on pages. They reuse `.page-canvas`, `.pill`, `.dot`, `.font-display`, `.text-gradient`, `.cta-arrow`, `.link-underline`, `.btn`, `.btn-primary`, `.btn-secondary`, `.muted`, `.field`, plus Tailwind utilities. The single stylesheet remains the source of truth across every redesigned page.

### 14.5 Outstanding (post-spec)

- Hindi marketing-copy variants on the redesigned pages.
- Production legal-entity name + Grievance Officer email replacing the `grievance@meriasmita.org` placeholder used in Privacy and Contact.
- Design-system pass on the signed-in surface (`(auth)`, `(victim)`, `(admin)`).
- WCAG 2.2 AA accessibility audit on the redesigned public surface.

### 14.6 Technical decisions locked on 2026-05-17

| Concern | Decision | Implication |
|---|---|---|
| App hosting | **Vercel**, Mumbai region (`bom1`) | `vercel.json` already pins region. Long-lived workers (BullMQ) need to migrate to Vercel Cron + DB-backed schedule before launch — see `docs/infra/vercel-azure-deploy.md` §5. |
| Database | **Azure Database for PostgreSQL Flexible Server**, free tier, Central India | Connection string requires `?sslmode=require`. `.env.example` updated with Azure shape. Firewall must be narrowed from "all Azure services" to Vercel egress IP ranges before launch. |
| Email | **Resend** (kept) | No code change. Production needs verified `meriasmita.org` domain + SPF/DKIM/DMARC. DMARC ramp `p=quarantine` → `p=reject` after 2 weeks of clean send. |
| Identity verification | **Email OTP only**. No Aadhaar, no PAN, no KYC documents | UI rewritten: `/identity` page now explains email is the sole identity. Privacy section 03 drops the "Identity data (optional)" entry. Section 04 reframes "Aadhaar, PAN, or any government ID" as a positive non-collection commitment. Section 05 drops the Aadhaar purpose row. `/delete-account` deletion list drops the Aadhaar bundle row. `notice-generator.ts` keeps `aadhaar` in its `forbiddenNoticeVariables` set as defence in depth. |
| Hindi UI strings | **AI-drafted**, flagged for native review | `src/i18n/hi.json` has 100% key parity with `en.json`. `hi-review-status.json` records the audit date and a scope note: the redesigned marketing pages render English-primary copy directly in JSX and do not currently pull from this dictionary. Native-speaker review and marketing-copy translation are tracked as separate items. |
| Devanagari font on Vercel | `outputFileTracingIncludes` added to `next.config.ts` for the case-export routes | Otherwise Next's static file tracing would not bundle the woff into the serverless function output, and the FIR PDF generator would fail at runtime on Vercel. |
| Deployment guide | New file: `asmita/docs/infra/vercel-azure-deploy.md` | Step-by-step runbook covering Azure provisioning, Vercel project setup, Resend domain verification, Redis options, cron migration, and pre-launch security gates. |
