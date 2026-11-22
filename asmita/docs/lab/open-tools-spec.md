# AI Lab: Open tools and free stacks

Status: owner-approved for build, 22 November 2026 (Saquib). Branch `feat/lab-open-tools`. Work packages WP150 to WP155, built one after another. Progress goes in `asmita/docs/lab/open-tools-progress.md`, one entry per WP starting with the exact line `### WPnnn done`.

This spec is long on purpose. The person building it has not seen the conversation that produced it. Everything you need is here or in a file this spec names. Read all of it before you write code, and read it again before each WP.

---

## Part A — Context

### A1. Who we are

Meri Asmita (asmita in code) is an Indian organisation working against image-based abuse: intimate images shared without consent (NCII), morphed and AI-made sexual images, and sextortion. The website does several things: survivors file complaints and Asmita sends legally grounded takedown notices to platforms; survivors can make an image fingerprint on their phone so platforms can block re-uploads; a crawler (with permission) looks for copies; a voice and chat assistant helps people find their way. The **AI Lab** (`/lab`) is the research arm: experiments and beta tools across the whole problem. Read `asmita/docs/lab/charter.md`.

### A2. What this feature is, and why it sits in the Lab

The owner wants the Lab to publish a **directory of open trust-and-safety tools** and **practical "free stack" guides** that show other organisations how to use them. These tools are mostly **not** part of Asmita's own complaint workflow. They are for the wider ecosystem: Indian platforms (social apps, dating apps, forums, adult-content sites, hosting companies), companies building AI image and video editing features, helplines and NGOs, and researchers. The point is to make it cheap and obvious for an Indian platform to stop intimate images coming back, and for an AI app to stop "nudify" requests, using free, open, auditable tools.

Two pieces:

1. **Open tools** (`/lab/open-tools` and `/lab/open-tools/[slug]`): one page per tool. What it is, who made it, the licence, what problem it solves in trust and safety, how it works in plain words, where it fits in a platform's workflow, what it cannot do, how to start, and full credit to the original source. Asmita did not build these tools (except the ones marked "From Asmita"), and every page says so.
2. **Free stacks** (`/lab/stacks` and `/lab/stacks/[slug]`): step-by-step guides that combine tools into a working setup for a specific kind of organisation. Three stacks: a small Indian platform stopping re-uploads; an AI image or video app adding guardrails against nudify requests; a larger platform team doing rules and review at scale.

### A3. Who reads these pages

Write for a **busy technical or policy person at an Indian organisation** who has heard "we should do something about NCII" and has a week, not a quarter:

- the one engineer at a 20-person Indian social or dating app who has been told to "handle the IT Rules";
- the grievance officer or trust-and-safety lead who must explain options to a founder;
- a product manager at an AI photo-editing startup who just discovered users typing "remove her clothes";
- a helpline or NGO coordinator who wants to know what platforms can realistically do;
- a researcher or journalist checking what exists.

They are not survivors in distress. (Survivors are served elsewhere on the site; these pages link to `/get-help` once, in the footer of each page, and never ask a survivor to read technical material.) They know the word "API". They do not all know what a perceptual hash is. Explain each concept once, plainly, the first time it appears on a page, then use it.

### A4. What "not generic" means here

The owner rejects generic, filler, "AI slop" pages. Concretely:

- **Specific over broad.** "PDQ turns an image into a 256-bit code; two codes within 31 bits of each other are usually the same picture" beats "PDQ helps detect harmful content".
- **India-specific where it matters.** IT Rules 2021 timelines, grievance officers, WhatsApp-compressed images, Hindi and Hinglish text, low-cost hosting, small teams. Never invent Indian facts.
- **Honest limits on every page.** Every tool page has a "What it cannot do" section with real limits (from its own docs or from this spec). Every stack has "What this will not catch".
- **Effort and cost stated.** Every tool says how hard it is to run (people, infrastructure) in plain terms. Every stack has a time plan.
- **No marketing words.** Banned: "revolutionary", "cutting-edge", "seamless", "robust", "leverage", "empower", "harness", "game-changer", "unlock", "state-of-the-art", "comprehensive solution", "in today's digital landscape". No exclamation marks.
- **No invented facts.** Every factual claim about a tool comes from the tool facts in Part D or from the tool's own official README or docs, and the page's `sources` list names the URL it came from. If you cannot source it, leave it out. Never invent adopters, numbers, benchmarks, partnerships or endorsements. Never say a tool is "used by" anyone unless Part D or the tool's own README says so, and link that README.

### A5. Rules that apply

- This is **AI Lab work**. The survivor complaint-workflow constraints in root `CLAUDE.md` do not apply (see its "Scope of the constraints below" section). The Lab charter does: `ENABLE_LAB` gate, the ESLint boundary (lab code never imports complaint-workflow modules), the public repo rules.
- These pages are **static content**: no database tables, no API routes, no user input stored, no outbound fetches at runtime. Content lives in typed TypeScript modules in the repo.
- **Credit and trademarks.** Name each tool and its maintainer exactly as their repository does. Link the official repository and licence. Do **not** use other organisations' logos or brand marks; use Asmita's own line icons. Write our own descriptions; do not copy paragraphs from READMEs (short quoted phrases under 15 words, in quotation marks, with the source linked, are fine and should be rare). Say plainly on every tool page that Asmita did not build the tool and is not affiliated with its maintainer, unless Part D marks it "From Asmita".
- **Not legal advice.** The stack pages mention Indian law for orientation. Each such section ends with: "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer." Reuse the legal sentences that already exist on `/for-platforms` (the `laws` array in `src/app/(public)/for-platforms/page.tsx`) word for word rather than writing new legal claims. Do not add any other law, rule number or timeline.
- **The Lab never names or links a nudify service.** These pages must not either.

---

## Part B — The site today (read before building)

Read these files first. They are the patterns to follow.

- `src/app/(public)/lab/page.tsx` — the Lab hub. Hero, then (when `labEnabled()`) a grid of beta tool cards from `src/lib/lab/beta-tools.ts`, then experiments, numbers and safety. Every string goes through `t(locale, key)`.
- `src/lib/lab/flags.ts` — `labEnabled()`. Every Lab tool page calls `notFound()` when the Lab is off; check how `src/app/(public)/lab/detectors/page.tsx` does it and do the same.
- `src/lib/lab/beta-tools.ts` — how the hub lists tools (`LAB_BETA_TOOLS`, `LAB_HUB_KEYS`).
- `src/app/(public)/lab/detectors/page.tsx` and `DetectorPanel.tsx` — an existing Lab page with credits to third-party detectors. Match its credit style.
- `src/app/(public)/for-platforms/page.tsx` and `icons.tsx` — the page written for platform trust-and-safety teams: its tone, its `laws` copy, its icon approach and its `PartnerForm`. The stacks link here for "work with Asmita".
- `src/components/Icon.tsx` — the shared line icons (24px grid, 1.75 stroke, `currentColor`). Add icons here if you need new ones, in the same style.
- `src/components/layout/AppShell.tsx`, `src/components/layout/nav-config.ts`, `src/lib/site-map.ts` (and the `/sitemap` page) — page shell, navigation and the sitemap.
- `src/app/foundation-styles.css`, `src/app/globals.css` and any `*-styles.css` they import — tokens and shared classes (`.page-hero`, `.page-hero-split`, `.section-pad`, `.zone-white`, `.card`, `.card-icon`, `.eyebrow`, `.btn-primary`, `.btn-secondary`, `.text-link`, `.page-title`, `.section-title`).
- `src/i18n/en.json`, `src/i18n/hi.json`, `src/i18n/hi-review-status.json` — strings and the record of what is machine translated or English only.
- `asmita/DESIGN.md` and Part C below.
- `asmita/docs/product/partner-api.md` — Asmita's own fingerprint feed for platform partners (an "From Asmita" entry).

---

## Part C — Design and UX

### C1. Design rules (binding)

The site's design is being refreshed in parallel on another branch. Your branch is cut from `master`, whose tokens may look slightly older (for example a parchment page instead of white). **Build only with semantic tokens and shared classes, never raw colours**, so your pages pick up the refresh automatically when it merges. The target rules, which win over anything older:

- **Colour.** Page background `var(--page)` (becoming plain white). Cards `var(--card)` with a 1px `var(--line)` border. Headings `var(--ink)`, body `var(--text)`, captions only `var(--text-muted)`. **Teal** (`var(--brand)`, hover `var(--brand-strong)`, tint `var(--brand-soft)`) is the only action colour: links, primary buttons, focus. **Orange** is the warm secondary colour for markers and highlights only: fills and rules `var(--coral)` / `var(--coral-soft)`, orange text and icons `var(--coral-ink, #b4461f)` (use exactly this fallback form; `--coral-ink` arrives with the refresh). Never an orange button. Status colours (`--danger`, `--warning`, `--success`) only for status. One gradient is allowed, in the closing call-to-action band of a page: `linear-gradient(110deg, var(--brand-soft) 0%, var(--brand-soft) 35%, var(--coral-soft) 100%)`. Never a gradient on buttons, text or cards.
- **Shape.** One corner radius, `var(--radius-box)` (12px), for every button, card, panel, input, code block and menu. Square-cornered design: **no pill buttons**. Only small chips, badges and step numbers are round.
- **No coloured left-border accent stripes** on anything. This is an owner rule; reviewers reject it on sight. Do not use `border-left` with a colour for emphasis.
- **Type.** Noto Sans for everything (Noto Sans Devanagari for Hindi), headings weight 600, no italics anywhere. Classes: `.page-title` for the page h1, `.section-title` for h2, card titles plain `h3` at 20px. Monospace only for code, hashes and file names. Paragraph measure about 68 characters (`max-width: 68ch`). No label or eyebrow above section headings except the single `.eyebrow` in the page hero.
- **Layout.** Content max width `var(--page-max-width)`, side margin `var(--gutter)`. Use `.section-pad` for vertical rhythm. Alternate plain and `.zone-white` sections only where it helps separate content.
- **Icons.** Single-line style from `src/components/Icon.tsx`, 20 to 24px, `currentColor`, rounded caps. Decorative icons are `aria-hidden`. One icon per card at most. Icons in coloured tiles use a soft tint background with the matching ink (teal tile: `--brand-soft` + `--brand-strong`; orange tile: `--coral-soft` + `--coral-ink`), 40px square tile with 12px corners.
- **Illustrations.** None needed. Never stock photos, never people, never anything depicting abuse, never AI-generated art. Diagrams are inline SVG (C4).
- **Motion.** Transitions 150 to 200ms on hover and focus only. No entrance animations. Under `prefers-reduced-motion`, none.
- **Accessibility.** WCAG 2.1 AA. Tap targets 48×48px. Visible focus (2px teal outline, 2px offset). Headings in order. Filter controls are real buttons with `aria-pressed` and a live region announcing "N tools shown". Never colour alone to carry meaning (badges have text).
- **Buttons.** Two only: `.btn-primary` (teal fill, one per screen at most) and `.btn-secondary` (outline). Links in running text use `.text-link`. External links open in the same tab, carry a small "external" icon and visually hidden text "(opens the official site)".
- **CSS location.** Put page-specific styles in a new file `src/app/lab-open-tools.css`, imported where the other `*-styles.css` files are imported. Prefix every class with `ot-`. Do not use `@layer` (owner rule). Plain CSS beats Tailwind utilities in this codebase: if you set `margin` in a class, a Tailwind `mt-*` on the same element is ignored, so put spacing on a wrapper.
- **Check with the impeccable skill** (shot at 1280×900 and 390×844, full page) for every page you build, fix what it flags, and say in progress.md that you did.

### C2. Information architecture

```
/lab                               existing hub: add two cards (Open tools, Free stacks) at the top of the tools grid
/lab/open-tools                    directory
/lab/open-tools/[slug]             one page per tool (Part D)
/lab/open-tools/how-we-choose      method: what "open" means here, how we pick and check tools, how to suggest one
/lab/stacks                        index of the three stacks
/lab/stacks/stop-reuploads         Stack 1
/lab/stacks/ai-app-guardrails      Stack 2
/lab/stacks/rules-and-review       Stack 3
```

All of them call `notFound()` when `labEnabled()` is false, like the other Lab pages, and are listed in `src/lib/site-map.ts` under the AI Lab group only when the Lab is on (follow how the existing Lab entries are listed). Add the two section entries ("Open tools", "Free stacks") to the AI Lab hub; do not add them to the top navigation.

### C3. Page designs

#### `/lab/open-tools` — the directory

1. **Hero** (`.page-hero`, left aligned, not centred): eyebrow "Asmita AI Lab", h1 "Open tools for trust and safety", one lede of at most two sentences: "Free, open-source tools that platforms, AI companies and NGOs can use to stop intimate images being shared without consent. We did not build most of them; we explain what each one does, where it fits and how to start." Then two plain links side by side: "See the free stacks →" (to `/lab/stacks`) and "How we choose tools" (to `/lab/open-tools/how-we-choose`).
2. **The workflow strip.** A single horizontal band directly under the hero showing the five stages of a trust-and-safety workflow as connected steps: **Prevent → Detect → Review → Act → Share**. Each stage is a button (filter) with its own one-line meaning shown under it on desktop:
   - Prevent: stop harmful content being made or uploaded.
   - Detect: find content that matches something known, or looks manipulated.
   - Review: let a trained person decide, with context.
   - Act: remove, block, label or report, and record it.
   - Share: exchange signals with other platforms and helplines.
   Draw the connectors as thin `var(--line)` rules with small orange (`--coral`) dots at each stage; the active stage gets a teal outline and `aria-pressed="true"`. On phones the strip becomes a horizontally scrollable row of the same buttons with the meaning hidden (the cards below already say it). "All" is first and selected by default.
3. **Second filter row: "I am…"** chips: "a platform", "an AI app", "an NGO or helpline", "a researcher". Combined with the stage filter (AND). Each tool's `audiences` decides.
4. **Search box** (label "Search tools", placeholder "PDQ, video, review…") filtering by name, maintainer and tags, client side.
5. **Results** grouped by category heading (h2), in this order: Matching and hashing; Review and rules; Detection models; Provenance; Free services (not open source); From Asmita; Directories. Within a group, cards in a grid (3 columns ≥1024px, 2 at ≥640px, 1 below). A group with no visible cards is hidden; when nothing matches, show "No tool matches those filters." with a "Clear filters" button.
6. **Card anatomy** (the whole card is not a link; the title is):
   - top row: a 40px icon tile (category icon, teal or orange tint per C1) and, right aligned, the **licence chip** (round, small, monospace text such as `BSD-3-Clause`, neutral `--line` border) and, if relevant, a **"From Asmita"** chip (teal tint) or **"Not open source"** chip (neutral, with the text);
   - h3 tool name as a `.text-link` to its page;
   - one line "by {maintainer}" in `--text-muted`;
   - the one-sentence `summary` (at most 22 words);
   - bottom row: the stage chips this tool covers (small, neutral) and an **effort** marker: "Effort: low / medium / high" as text with three small squares filled to match (filled squares `--coral`, empty `--line`), never colour alone.
7. **Closing band** (the one gradient allowed): h2 "Know a tool we should add?", one sentence, and a `.btn-secondary` "Suggest a tool" linking to the site's existing feedback page `/feedback` (check it exists and what it collects; if it cannot carry a free-text suggestion, link to `/for-platforms` and record the decision).
8. Footer line above the site footer, small: "Tool names belong to their owners. Asmita is not affiliated with these projects unless marked From Asmita." and "If you need help with images of you, go to Get help." linking `/get-help`.

The filtering is a small client component (`OpenToolsDirectory.tsx`) that receives the catalogue as props from the server page. The page must be fully usable without JavaScript: without JS all cards show and the filters are hidden (render the filter UI only after hydration, or use `<noscript>` styles).

#### `/lab/open-tools/[slug]` — a tool page

`generateStaticParams` from the catalogue. Unknown slug → `notFound()`. Layout: a two-column body at ≥1024px (main 2/3, sticky aside 1/3), one column below.

1. **Breadcrumb:** AI Lab › Open tools › {name}.
2. **Header:** h1 `{name}`; under it "by {maintainer}" linking the maintainer's repository or site; the chips row (licence, category, "Not open source" / "From Asmita" when relevant).
3. **Aside, "At a glance"** (a `.card`, sticky top 96px on desktop, placed after the header on phones):
   - What it is (one line, `kind`);
   - Licence (name, linked to the licence file);
   - Runs on (`runsOn`);
   - Effort (low/medium/high with the three squares and one sentence `effortNote`);
   - Stages (chips);
   - Official links (repository, docs) as a list;
   - "Last checked {checkedAt}" in `--text-muted`.
4. **Main sections, in this order, each an h2:**
   1. **What it does** — two or three short paragraphs: the problem, in trust-and-safety terms, and what the tool does about it. Start from the problem ("When a platform removes an image, the same image is often uploaded again within hours…"), not from the tool.
   2. **How it works** — a numbered list of 3 to 6 plain steps (`howItWorks`), each one sentence, plus the stage diagram (C4) for its kind. Define technical terms inline the first time (e.g. "Hamming distance: the number of bits that differ between two codes").
   3. **Where it fits in a workflow** — the five-stage strip from the directory, read-only, with this tool's stages highlighted, and two to four bullets `fitsWhere` that say concretely where a platform plugs it in ("On upload, before a post goes live", "In the review queue, as a signal next to each report").
   4. **What you get** — the features list (`features`, 4 to 8 bullets, each starting with a noun or verb, no fluff).
   5. **What it cannot do** — the limits (`limits`, 2 to 6 bullets). Never empty.
   6. **How to start** — numbered steps (`gettingStarted`), with prerequisites first. Code snippets only where Part D gives one or the official README shows the exact command; use a `<pre><code>` block with a copy button (12px corners, monospace, `--surface-muted` background) and never invent flags or versions. End with a link to the official docs.
   7. **How Asmita uses it** — only if Part D gives `asmitaUse`; otherwise omit the section entirely (do not write "We don't use it").
   8. **Credit** — a quiet `.card`: "{name} is made by {maintainer} and released under the {licence} licence. Asmita did not build it and is not affiliated with {maintainer}. This page is our own summary; the official repository is the source of truth." plus the repository link and, where Part D gives one, the paper citation in plain text. For "From Asmita" entries, the credit card names what Asmita built on (e.g. "builds on Meta's ThreatExchange, BSD").
   9. **Related tools** — up to three cards (same anatomy as the directory) from `related`.
   10. **Sources** — a small ordered list of every URL used for the facts on the page (`sources`).
5. **Closing band:** "See it in a stack" with links to the stacks that use this tool (computed from the stacks data), or, if none, a link back to the directory.

#### `/lab/open-tools/how-we-choose`

Short editorial page, one column, `max-width: 68ch`:
- What "open" means here: source code or model weights anyone can download, under a licence that allows use by a commercial platform or a public NGO service; no paid tier required for the core function. "Free services" are listed separately and marked "Not open source".
- What we check before listing: licence (we read it), maintenance (a release or commit in the last 18 months, or a stated reason it is stable), whether it fits a stage of the workflow, whether it can run without sending images to a third party (we say when it cannot), known limits and bias notes from the maintainers.
- What we do not list: tools whose licence forbids commercial use for the core function, tools that require sending intimate images to an unknown third party, anything that generates sexual content.
- How to suggest a tool or report an error (same link as the directory band).
- Credit: "Our list draws on ROOST's awesome-safety-tools directory (CC BY 4.0) and the ROOST Model Community." with links.

#### `/lab/stacks` — index

Hero: eyebrow "Asmita AI Lab", h1 "Free stacks", lede: "Ready-made combinations of open tools for a specific job, with the order to set them up in and what each step costs." Then three large cards, one per stack, each with: who it is for (one line, bold), the job (h3), the tools it uses as small chips, the effort and time ("About 2 to 4 weeks for one engineer"), and a `.btn-secondary` "Read the stack". Closing band linking to `/lab/open-tools`.

#### `/lab/stacks/[slug]` — a stack page (shared template)

1. Breadcrumb: AI Lab › Free stacks › {title}.
2. **Header:** h1 the job in plain words; "For:" line (who); a short lede (2 sentences); a facts row of three small boxes: **Time** (e.g. "2 to 4 weeks"), **People** (e.g. "1 engineer, 1 reviewer"), **Cost** (e.g. "Free software; a small server"). Never invent money figures; describe resources instead of prices.
3. **The pipeline diagram** (C4, the stack variant): the steps of this stack left to right on desktop, top to bottom on phones, each step a box with the step number in a round orange marker (`--coral-soft` fill, `--coral-ink` number), the step name, and the tool names under it as links. Arrows are thin `--line` strokes. This is the visual centrepiece.
4. **Steps** — one h2 per step, matching the diagram numbers: what happens at this step and why, which tool does it (linked to its tool page), what you need, a "Done when…" line (a concrete check), and common mistakes (1 to 3 bullets). Steps come from Part E.
5. **Plan** — a three-column timeline "Week 1 / Weeks 2–3 / Month 2" (stacked on phones), each a short checklist.
6. **What this will not catch** — honest gaps (Part E).
7. **India notes** — the specific Indian context for this stack (Part E), with the legal sentences reused from `/for-platforms` and the "not legal advice" line.
8. **Work with Asmita** — what Asmita can offer this kind of organisation (from Part E only), linking `/for-platforms` for platforms. No donations language. No promises.
9. **Closing band** (gradient): "All tools in this stack" as small cards, and a link to the other stacks.

### C4. Diagrams

Inline SVG components in `src/app/(public)/lab/open-tools/diagrams/`. Style: line art, 1.75px strokes, rounded caps, `--brand` for primary strokes, `--line` for connectors, `--coral` for markers and the one "attention" element, `--brand-soft` and `--coral-soft` as quiet fills, text in `--ink`/`--text` at 14px+ (rem units). Every diagram has a `<title>` and a text alternative: the numbered steps next to it say the same thing, so the SVG is `aria-hidden` and the list carries the meaning. No animation. Build these reusable diagrams, then use them per tool kind:

- `HashMatchDiagram`: image → code (a small grid of squares) → compare with a bank (stacked rows of monospace codes) → "match within distance" marker. For PDQ, vPDQ, TMK+PDQF, StopNCII, Take It Down, Asmita feed.
- `SimilarityDiagram`: two images (abstract rectangles with a simple mountain-and-sun motif, never a person) → vectors → similarity score. For SSCD.
- `ReviewQueueDiagram`: incoming items → rules → queues → reviewer → decision → record. For Coop, Osprey, Altitude.
- `ClassifierDiagram`: input (text prompt or image) → model → score bands (low / review / block). For NCII Prompt Guard, gpt-oss-safeguard, GenD, YuNet.
- `ProvenanceDiagram`: camera or app signs → file carries a credential → anyone verifies → "missing does not mean fake". For C2PA.
- `PipelineDiagram`: generic numbered steps for stacks (C3).

### C5. Content style

- British spelling (organisation, licence as a noun, license as a verb), as the rest of the site.
- Short sentences. One idea per paragraph. Second person for instructions ("Hash each image on upload").
- Explain every acronym on first use per page: NCII (intimate images shared without consent), PDQ, CSAM is not used on these pages except where a tool's own scope requires naming it (then say "child sexual abuse material").
- Numbers as digits. Dates as "22 November 2026".
- No emoji. No exclamation marks. No rhetorical questions in body copy.
- Each tool page's text (all sections together) is 350 to 900 words. Each stack page is 1200 to 2500 words.

### C6. Languages

These pages are written for professionals, like `/for-platforms`, which is English only by owner decision. Follow that precedent with one addition:

- **Hindi too:** the hub cards on `/lab`, the directory hero, filter labels, category headings and card summaries, the stacks index hero and stack card text, breadcrumbs and all UI chrome. Machine translate in the site's formal register and add the keys to the `machineTranslated` record in `hi-review-status.json`.
- **English only:** the body of tool pages, the body of stack pages and `how-we-choose`. When the locale is Hindi, show a one-line notice at the top of these pages, translated: "This page is in English because it is written for technical teams." Add the routes to `excludedFromTranslation` with that reason.
- Keys go in both `en.json` and `hi.json` (key parity is tested). Long English-only bodies live in the catalogue modules, not in `en.json`.

---

## Part D — Tool facts (the only allowed source besides the tools' own docs)

Catalogue file: `src/lib/lab/open-tools/catalogue.ts`, typed:

```ts
type Stage = "prevent" | "detect" | "review" | "act" | "share";
type Audience = "platform" | "ai-app" | "ngo" | "researcher";
type Category = "matching" | "review" | "models" | "provenance" | "services" | "asmita" | "directories";
type Effort = "low" | "medium" | "high";
type DiagramKind = "hash" | "similarity" | "review" | "classifier" | "provenance" | "none";

interface OpenTool {
  slug: string; name: string; maintainer: string; maintainerUrl: string;
  category: Category; kind: string; licence: string; licenceUrl: string; openSource: boolean; fromAsmita: boolean;
  repoUrl?: string; docsUrl?: string; paper?: string;
  stages: Stage[]; audiences: Audience[]; tags: string[];
  runsOn: string; effort: Effort; effortNote: string;
  summary: { en: string; hi: string };        // ≤ 22 words
  whatItDoes: string[];                         // paragraphs, English
  howItWorks: string[]; fitsWhere: string[]; features: string[]; limits: string[];
  gettingStarted: { step: string; code?: string }[];
  asmitaUse?: string; related: string[]; sources: string[]; checkedAt: string; diagram: DiagramKind;
}
```

A unit test validates the catalogue: every field present and non-empty where required, `summary.en` ≤ 22 words, `limits` non-empty, every `related` slug exists, every URL is `https://`, `sources` non-empty and each tool's `repoUrl`/`docsUrl` appears in its `sources`, no banned marketing word (A4) in any string, `checkedAt` is an ISO date. A second test checks every stack step references existing tool slugs.

Write each tool's text from the facts below, expanded only with facts from the listed official sources (read them; the machine has internet). Facts were checked on 22 November 2026. Use `checkedAt: "2026-11-22"` unless you re-check a page.

### Matching and hashing

**1. PDQ** — slug `pdq`. Maintainer: Meta (in the ThreatExchange repository). Licence: BSD (repository `LICENSE`, "BSD License for ThreatExchange software"). Repo `https://github.com/meta/ThreatExchange/tree/main/pdq`; licence `https://github.com/meta/ThreatExchange/blob/main/LICENSE`. Kind: perceptual image hash. Runs on: C++, Python, Java, PHP and other implementations in the repo; small CPU cost. Effort: low.
Facts: turns an image into a 256-bit code written as 64 hexadecimal characters plus a quality score from 0 to 100; similar-looking images get codes that differ in few bits; compare codes by Hamming distance; a distance of 31 or less is the commonly used match threshold (HMA's default); resizing, re-compression and small edits usually keep the code close; low-quality images (very plain, tiny) give unreliable codes, so many systems ignore codes with quality below 50; it does not survive heavy crops, mirroring or large overlays; the hash cannot be turned back into the image in practice, but treat codes of intimate images as sensitive data anyway. Stages: detect, share. Audiences: platform, ngo, researcher. Diagram: hash.
asmitaUse: "Survivors who use Asmita make PDQ codes of their images on their own phone; only the 64-character code reaches Asmita. With the survivor's consent, Asmita shares these codes with partner platforms." Related: vpdq, hma, stopncii.

**2. vPDQ** — slug `vpdq`. Maintainer: Meta (ThreatExchange). Licence: BSD (`vpdq/LICENSE.txt`). Repo `https://github.com/meta/ThreatExchange/tree/main/vpdq`. Kind: video hash built on PDQ. Effort: low to medium (needs ffmpeg). Runs on: C++ with Python bindings.
Facts: samples frames from a video (typically one per second), makes a PDQ code for each frame, and compares two videos by the share of frames that match in each direction; works across re-encodes and resizes; a clip cut from a longer video can still match on the shared frames; it costs more storage than one image hash. Stages: detect, share. asmitaUse: "Asmita's survivor fingerprint flow makes vPDQ codes for videos on the device." Related: pdq, tmk-pdqf, hma.

**3. TMK+PDQF** — slug `tmk-pdqf`. Maintainer: Meta (ThreatExchange). Licence: BSD (`tmk/LICENSE.txt`). Repo `https://github.com/meta/ThreatExchange/tree/main/tmk`. Kind: video similarity (temporal match kernel over per-frame PDQ-style features). Effort: medium. Facts: produces one compact signature per video and compares whole videos quickly; better for whole-video near-duplicates than for short clips; older than vPDQ; read the repo README for current status before choosing it over vPDQ. Stages: detect. Related: vpdq, pdq.

**4. Hasher-Matcher-Actioner (HMA)** — slug `hma`. Maintainer: Meta (ThreatExchange). Licence: BSD. Repo `https://github.com/meta/ThreatExchange/tree/main/hasher-matcher-actioner`. Kind: self-hosted hash-matching service. Runs on: Python (Flask) with Postgres, Docker images published by the project. Effort: medium.
Facts: keeps "banks" of known hashes, hashes new media you send it (PDQ for images; other signal types such as video hashes can be enabled), returns matches through an HTTP API, and can pull hashes from outside "exchanges" on a schedule through Python plugins (the project includes exchanges for sources such as NCMEC, StopNCII and ThreatExchange; credentials come from those programmes); it does not decide what to do with a match: your system or a reviewer does; adding a new outside source means installing a Python plugin in your HMA image. Stages: detect, share, act. Audiences: platform. asmitaUse: "Asmita is building an HMA exchange plugin so partner platforms can pull survivor-consented fingerprints from Asmita into an HMA bank." Related: pdq, coop, asmita-fingerprint-feed. Diagram: hash.

**5. SSCD (Self-Supervised Copy Detection)** — slug `sscd`. Maintainer: Meta AI Research (facebookresearch). Licence: MIT (repository licence; check the model-weights note in the README before use). Repo `https://github.com/facebookresearch/sscd-copy-detection` — **archived (read-only)**, say so. Paper: Pizzi, E. et al., "A Self-Supervised Descriptor for Image Copy Detection", CVPR 2022. Kind: image copy-detection model that produces a vector per image. Runs on: PyTorch (TorchScript models), GPU helpful, CPU possible. Effort: medium to high.
Facts: catches copies that hashes miss, such as crops, colour filters, overlays and screenshots; compares images by the similarity of their vectors rather than bit differences; needs more compute and a vector index for search; a high similarity is a lead for a person to review, not proof; archived means no new fixes. Stages: detect. Audiences: platform, researcher. asmitaUse: "Asmita's crawler uses SSCD as a second layer after PDQ, so a crop or filtered copy can still be found; a person confirms every match." Related: pdq, hma. Diagram: similarity.

### Review and rules

**6. Coop** — slug `coop`. Maintainer: ROOST. Licence: Apache-2.0. Repo `https://github.com/roostorg/coop`; docs `https://roostorg.github.io/coop/latest`. Kind: review and moderation console. Runs on: Docker; React front end, Node.js back end, PostgreSQL, Scylla, ClickHouse and Redis (from its architecture doc). Effort: high (several databases to run).
Facts: review queues with routing rules, a review screen for human decisions, automated enforcement rules, bulk actions, appeals, user strikes, metrics, a REST and GraphQL API for sending items and reports; integrates with HMA for hash banks (including exchanges such as StopNCII), with child-safety reporting to NCMEC (a US body) and with several classifier services; built-in reviewer wellness settings (blur, greyscale, mute video by default, per-reviewer overrides); its README lists production users Kyodo, Notion, Musubi and UpScrolled (link the README as the source); the platform owns its policy and Coop is "the plumbing". Stages: review, act. Audiences: platform. Related: hma, osprey, altitude. Diagram: review.

**7. Osprey** — slug `osprey`. Maintainer: ROOST (originally built at Discord). Licence: Apache-2.0. Repo `https://github.com/roostorg/osprey`; docs `https://roostorg.github.io/osprey/latest/`. Kind: real-time rules engine and investigation console. Runs on: Python, Docker. Effort: high.
Facts: your platform streams events (sign-ups, posts, messages) to it; rules written in its own rule language (SML) with user-defined functions evaluate each event and can label entities, take actions or send verdicts back to your systems; analysts query and chart past events to find patterns and turn them into new rules; its README lists Bluesky, Discord and Matrix.org as users; built for event volumes of larger platforms, more than a small app needs. Stages: detect, act. Audiences: platform. Related: coop. Diagram: review.

**8. Altitude** — slug `altitude`. Maintainer: Jigsaw (Google), with Tech Against Terrorism. Licence: Apache-2.0. Repo `https://github.com/Jigsaw-Code/altitude`. Kind: review tool for terrorist and violent extremist content flagged by outside sources. Effort: medium. Facts: a web application for triaging and deciding on content flagged by counter-terrorism databases; it connects to the Terrorist Content Analytics Platform and the GIFCT Hash-Sharing Database (login credentials from those programmes are needed); it is part of Tech Against Terrorism, which offers free onboarding support to platforms; read `docs/overview.md` in its repo for how it works before writing. Its scope is terrorist content, not intimate images: it is listed as an example of a free, ready-made review tool for a small platform, and the page must say clearly that it is not built for NCII. Do not say it is built on HMA unless its docs say so. Stages: review. Audiences: platform. Related: hma, coop. Diagram: review.

### Detection models

**9. NCII Prompt Guard** — slug `ncii-prompt-guard`. Maintainer: Hugging Face (ML & Society team). Licence: MIT. Collection `https://huggingface.co/collections/hfmlsoc/ncii-prompt-guard`; models `https://huggingface.co/hfmlsoc/ncii-prompt-guard-3c` and `https://huggingface.co/hfmlsoc/ncii-prompt-guard-5c`; ROOST notes `https://github.com/roostorg/model-community/tree/main/ncii-prompt-guard`. Kind: text classifier for image and video editing prompts. Runs on: CPU, standard `transformers` text-classification pipeline; about 268 million parameters (fine-tuned from `microsoft/harrier-oss-v1-270m`). Effort: low.
Facts: scores a user's editing prompt for NCII risk (for example "nudification" requests) before the prompt reaches the image model; two versions: 3-class (`low` / `review` / `block`, about 0.90 block recall at 0.93 block precision on its test split) and 5-class (`safe`, `suggestive-ambiguous`, `sexualizing-exposure`, `intimate-exposure`, `explicit-sexual-activity`); the deployer chooses the thresholds; it only sees the prompt text, so it cannot know whether the person in the image consented, and it is meant to reduce an app's usefulness for abuse, not to catch every case; trained mainly on English (say plainly that Hindi, Hinglish and other Indian languages are not covered and must be tested); the training dataset is gated (access on request). Code snippet allowed (standard pipeline usage; use the 3-class model id exactly):
```python
from transformers import pipeline
guard = pipeline("text-classification", model="hfmlsoc/ncii-prompt-guard-3c", top_k=None)
scores = guard("make her outfit transparent")
```
Stages: prevent. Audiences: ai-app, researcher. Related: gpt-oss-safeguard, c2pa. Diagram: classifier.

**10. gpt-oss-safeguard** — slug `gpt-oss-safeguard`. Maintainer: OpenAI. Licence: Apache-2.0. Repo `https://github.com/openai/gpt-oss-safeguard`; ROOST notes `https://github.com/roostorg/model-community/tree/main/gpt-oss-safeguard`. Kind: open-weight safety reasoning model that follows a policy you write ("bring your own policy"). Effort: high (large model; needs a GPU server). Facts: you give it your written policy and the content; it returns a classification with its reasoning; useful when your rules are specific to your platform and change often; slower and costlier than a small classifier, so use it for harder cases or review support rather than every upload; read the repo and model cards for sizes and hardware before writing those details. Stages: detect, review. Audiences: platform, ai-app. Related: ncii-prompt-guard, coop. Diagram: classifier.

**11. GenD** — slug `gend`. Maintainer: Yermakov, Čech, Matas and Fritz (authors; repository by `yermandy`). Licence: MIT (code and weights as tagged on Hugging Face). Repo `https://github.com/yermandy/GenD`. Paper: "Deepfake Detection that Generalizes Across Benchmarks", WACV 2026 (arXiv 2508.06248). Kind: face-swap and reenactment (deepfake) detector. Runs on: PyTorch; GPU helpful. Effort: medium.
Facts: trained on face-swap and reenactment video; reports good results across many benchmark datasets; needs a detectable face (face detection and alignment first); it is not a general "is this image AI-made" detector; the authors note failure cases across demographics, and independent research shows heavy JPEG compression and low resolution hurt deepfake detectors in general, which matters for WhatsApp-forwarded images; the default face detector in its repo comes from InsightFace, whose pretrained models are non-commercial only, so a public service should swap in a permissively licensed detector such as YuNet. asmitaUse: "The Asmita AI Lab is adding GenD to its detector panel with the YuNet face detector." Stages: detect. Audiences: platform, researcher. Related: yunet, c2pa. Diagram: classifier.

**12. YuNet** — slug `yunet`. Maintainer: Shiqi Yu and contributors, distributed in the OpenCV Model Zoo. Licence: MIT (model folder `LICENSE`; the zoo repository is Apache-2.0). Repo `https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet`. Kind: lightweight face detector (box plus five landmarks). Runs on: OpenCV DNN, CPU. Effort: low. Facts: small and fast; gives the face box and eye, nose and mouth points other models need for alignment; a building block, not a safety decision by itself. Stages: detect. Audiences: researcher, platform. Related: gend. Diagram: classifier.

### Provenance

**13. C2PA and Content Credentials** — slug `c2pa`. Maintainer: the Coalition for Content Provenance and Authenticity (standard) and the Content Authenticity Initiative (open-source SDKs). Licence: the `c2pa-rs` Rust SDK is dual MIT / Apache-2.0; `c2pa-js` is MIT. Repos `https://github.com/contentauth/c2pa-rs`, `https://github.com/contentauth/c2pa-js`; standard `https://c2pa.org`; public verify tool `https://contentcredentials.org/verify`. Kind: open standard and SDKs for signed content provenance. Effort: low to verify, medium to sign. Facts: a camera, editing app or AI generator can attach a signed record ("Content Credential") saying how a file was made or edited; anyone can verify the signature; many platforms and messaging apps strip this metadata when files are uploaded or forwarded, so a missing credential proves nothing; a present, valid credential from an AI tool is strong evidence the file was AI-made or edited by that tool. For AI apps: sign everything you generate. asmitaUse: "Asmita's AI-made image check reads Content Credentials in the visitor's browser." Stages: prevent, detect. Audiences: ai-app, platform, ngo. Related: ncii-prompt-guard, gend. Diagram: provenance.

### Free services (not open source) — `openSource: false`, chip "Not open source"

**14. StopNCII.org** — slug `stopncii`. Operator: SWGfL (a UK charity), in partnership with industry. Licence field: "Free service". Site `https://stopncii.org`. Kind: free hash-sharing service for adults' intimate images. Effort for a platform: medium (join, then match). Facts (keep to these and the site): an adult who fears an intimate image will be shared creates hashes on their own device on stopncii.org (the image does not leave the device); participating platforms receive the hashes and check uploads against them; HMA includes a StopNCII exchange, so a platform running HMA can connect with credentials from StopNCII; check the site for the current partner list and how to join (do not list partners). Stages: share, detect. Audiences: platform, ngo. Related: hma, pdq, take-it-down. Diagram: hash.

**15. Take It Down** — slug `take-it-down`. Operator: NCMEC (the US National Center for Missing & Exploited Children). Licence field: "Free service". Site `https://takeitdown.ncmec.org`. Kind: free hash-sharing service for images of people under 18. Facts: for images taken when the person was under 18; hashes made on the device; participating platforms use them to find and remove copies; Asmita never puts minors into its adult flow, and these pages should point a platform to Take It Down for anything involving a minor rather than to adult tools. Stages: share, detect. Audiences: platform, ngo. Related: stopncii, pdq. Diagram: hash.

### From Asmita — `fromAsmita: true`

**16. Asmita fingerprint feed for platforms** — slug `asmita-fingerprint-feed`. Maintainer: Meri Asmita. Licence field: "Free for approved partners" (`openSource: false`). Docs: link the site's own `/for-platforms` page; describe only what `asmita/docs/product/partner-api.md` and `/for-platforms` already say: approved partner platforms receive PDQ and vPDQ fingerprints from survivors' cases when the survivor has agreed to share them, through an authenticated API with additions and withdrawals, and can report outcomes back. An HMA plugin is being built (say "in development", no dates). Stages: share. Audiences: platform. Related: hma, pdq, vpdq. Diagram: hash. `sources`: the two repo docs paths as `https://github.com/saquibreja7-hash/Asmita/blob/master/asmita/docs/product/partner-api.md` and the `/for-platforms` page URL path.

### Directories

**17. ROOST awesome-safety-tools** — slug `awesome-safety-tools`. Maintainer: ROOST. Licence: CC-BY-4.0. Repo `https://github.com/roostorg/awesome-safety-tools`. Kind: community directory of open trust-and-safety tools. Effort: none. Facts: a maintained list grouped by job (hash matching, classifiers, review tools and more); a good place to look beyond our list. Stages: all five. Audiences: all. Diagram: none.

**18. ROOST Model Community** — slug `roost-model-community`. Maintainer: ROOST. Licence: CC-BY-4.0. Repo `https://github.com/roostorg/model-community`. Kind: community and resources for open safety AI models. Facts: lists partner models (including NCII Prompt Guard and gpt-oss-safeguard), a guide to using open safety models across detection, investigation, review and enforcement, policy prompt packs and office hours; ROOST prefers models without non-commercial or output restrictions. Stages: detect, review. Audiences: platform, ai-app, researcher. Diagram: none.

Do not add other tools in this build. If you think one is missing, write it in progress.md under "Suggested additions" with its licence and repository.

---

## Part E — The three stacks

Data file: `src/lib/lab/open-tools/stacks.ts`, typed (`slug`, `title`, `forWho`, `lede`, `time`, `people`, `resources`, `steps[] { name, tools: slug[], what, why, need, doneWhen, mistakes[] }`, `plan { week1[], weeks2to3[], month2[] }`, `wontCatch[]`, `indiaNotes[]`, `withAsmita[]`). Write the prose from the outlines below; keep every fact inside Part D.

### Stack 1 — `stop-reuploads`: "Stop intimate images coming back to your platform"

For: a small or medium Indian platform (social, dating, forum, file or image hosting, adult content) with one or two engineers. Time: 2 to 4 weeks. People: 1 engineer, 1 trained reviewer. Resources: free software; one small server or container for HMA and its Postgres.

Steps:
1. **Write down what you will do with a match.** Policy first: block the upload, hide it pending review, or remove and notify. Name the reviewer. Decide how fast (link the 24-hour rule from the reused legal copy). Done when: a one-page written policy exists. Mistake: auto-deleting on any match without review.
2. **Hash every image and video on upload** with PDQ and vPDQ (tools: pdq, vpdq). Store the code and quality next to the media record; ignore quality below 50. Done when: every new upload has a stored code. Mistakes: hashing a thumbnail instead of the original; forgetting videos.
3. **Run a matcher** (tool: hma): one bank for content you have removed yourself, more banks for outside sources. Done when: an image you removed, uploaded again, comes back as a match in HMA.
4. **Connect outside sources** (tools: stopncii, asmita-fingerprint-feed, take-it-down): join StopNCII for adults' images; apply to Asmita's partner programme for survivor-consented fingerprints from India; for minors, Take It Down. Done when: at least one external bank is syncing. Mistake: mixing minor-related hashes into the adult review flow.
5. **Review matches** (tools: coop, or your existing admin tool): send each match to a queue with context; the reviewer confirms and acts. A match within distance 31 is a strong lead, not proof. Done when: matches land in a queue and every decision is recorded with who and when.
6. **Catch edited copies (optional, later)** (tool: sscd): add a vector-similarity check for crops and filters, for reported content or high-risk areas. Done when: a cropped copy of a removed image is flagged in a test.
7. **Record outcomes and report back** (tools: asmita-fingerprint-feed): log what you removed and when; if you are an Asmita partner, report outcomes through the API so survivors see results. Done when: you can say how many re-uploads you blocked last month.

Plan: Week 1 — policy, hashing on upload, HMA running locally. Weeks 2–3 — banks, outside sources, review queue, staff training. Month 2 — tune thresholds, add SSCD for reported content, monthly numbers.

What this will not catch: images never reported or hashed anywhere; heavily edited, cropped or mirrored copies (hashes miss them; SSCD helps but is not complete); new AI-made images of a real person that do not copy an existing image; content shared in private messages you do not scan; links to other sites.

India notes: reuse the three `laws` items from `/for-platforms` verbatim; add: "Images in India are often forwarded through WhatsApp, which re-compresses them. PDQ usually survives this; test with your own re-compressed samples." Then the not-legal-advice line.

With Asmita: the partner programme on `/for-platforms` (fingerprint alerts, crawler monitoring by agreement, one takedown channel, stay-down checks) — summarise from that page, link it.

### Stack 2 — `ai-app-guardrails`: "Stop your AI image or video tool being used to undress people"

For: a team adding image or video editing or generation to an app. Time: 1 to 2 weeks for the first guardrails. People: 1 engineer, 1 person for review and policy. Resources: free models; a CPU is enough for the prompt classifier; a GPU only if you add a large policy model.

Steps:
1. **Write the rule.** No sexualised edits of real people without proof of consent; no undressing; nothing involving minors, ever. Done when: the rule is in your terms and in your product, not only in a document.
2. **Classify every editing prompt before it runs** (tool: ncii-prompt-guard): use the 3-class model; block `block`, send `review` to a person or ask the user to rephrase, allow `low`. Set thresholds on your own test prompts. Done when: a test set of harmful and harmless prompts gives the block rate you chose. Mistake: trusting it for Hindi or Hinglish prompts without testing; add your own test prompts in the languages your users type.
3. **Handle prompts the classifier is unsure about** (tool: gpt-oss-safeguard, optional): a policy-following model for the `review` band, if you have the hardware. Done when: review-band prompts get a decision with a reason.
4. **Check input images for real faces** (tools: yunet, and your policy): if the input contains a real person's face and the edit is sexual, refuse. Done when: the refusal path is tested.
5. **Sign what you generate** (tool: c2pa): attach Content Credentials to every output. Done when: an output verifies at contentcredentials.org/verify.
6. **Log and review refusals.** Keep counts of blocked and reviewed prompts (no need to keep the prompts longer than your privacy policy allows) and review samples weekly to tune thresholds. Done when: there is a weekly number.
7. **Give a way to report misuse** that reaches a person, and link survivors to help (Asmita's `/get-help` for India). Done when: the report link is visible on every generated result page.

Plan: Week 1 — rule, prompt classifier, thresholds. Week 2 — face check, signing, report link. Month 2 — multilingual test set, policy model for the review band if needed.

What this will not catch: harmful requests phrased innocently; edits done step by step across many prompts; images produced elsewhere and only hosted on your app; users who strip Content Credentials; languages the classifier was not trained on.

India notes: users type in Hindi, Hinglish (Hindi in Latin script) and other Indian languages; the prompt classifier is trained mainly on English, so build a test set in the languages your users use before trusting it; reuse the `/for-platforms` legal lines only if relevant to hosting content (the 24-hour and 2-hour items), then the not-legal-advice line.

With Asmita: the AI Lab welcomes test prompts and results in Indian languages (contact link); Asmita can tell an app when a survivor reports content made with it (only say "contact us to discuss"; promise nothing more).

### Stack 3 — `rules-and-review`: "Run rules and human review at scale"

For: a platform with a trust-and-safety team and an engineering team, or one growing fast. Time: 1 to 3 months. People: 2+ engineers, a review team. Resources: several servers (Coop needs Postgres, Scylla, ClickHouse and Redis; Osprey needs its own stack).

Steps:
1. **Policies and queues first**: write policies with examples; design queues by harm type and urgency (NCII gets its own queue, minors go to a separate restricted path). Done when: every report type maps to one queue.
2. **Hash matching as a signal** (tools: hma, pdq, vpdq, stopncii, asmita-fingerprint-feed). Done when: matches arrive as signals in review.
3. **Review console** (tool: coop): routing rules, review screen, reasons, appeals, reviewer wellness settings on by default. Done when: reviewers work from queues with recorded decisions.
4. **Real-time rules** (tool: osprey): stream sign-up, post and message events; write rules for patterns (new accounts mass-uploading, repeat uploaders of removed content). Done when: a rule labels a test pattern within seconds.
5. **Models as signals, not judges** (tools: gpt-oss-safeguard, ncii-prompt-guard if you have AI features, gend for reported deepfakes, sscd for edited copies). Done when: model scores appear next to items in review, with thresholds documented.
6. **Measure**: time to first review, handle time, re-upload blocks, appeal overturn rate. Done when: a weekly report exists.

Plan: Weeks 1–2 — policies, queues, HMA. Weeks 3–6 — Coop with routing and wellness settings, training. Months 2–3 — Osprey rules, model signals, metrics.

What this will not catch: anything outside the events you send; new abuse patterns until someone writes a rule; model blind spots in Indian languages and on compressed images.

India notes: as Stack 1, plus "Significant social media intermediaries have further duties under the IT Rules; check them with your lawyer." Then the not-legal-advice line. (No rule numbers beyond the reused `/for-platforms` copy.)

With Asmita: the partner programme, as Stack 1.

---

## Part F — Rules for every WP

1. **Read first:** this whole spec; root `CLAUDE.md` ("Scope of the constraints below"); `asmita/AGENTS.md`; `asmita/DESIGN.md`; `asmita/docs/lab/charter.md`; the files in Part B your WP touches; `asmita/docs/lab/open-tools-progress.md` for what earlier WPs did and decided. Consult `asmita/node_modules/next/dist/docs/` before framework code (this Next.js differs from older versions: check `generateStaticParams`, `notFound`, metadata APIs there).
2. **Implement exactly your WP.** Do not start the next one.
3. **Public repo.** No secrets, no real abuse URLs, no nudify services, no real people. Tool facts only from Part D and official sources.
4. **Tests.** Vitest for the catalogue and stacks validation, the filter logic (stage AND audience AND search), slug pages (every slug renders, unknown slug 404s, Lab off 404s), i18n key parity, and the English-only notice in Hindi. Playwright specs for: filtering the directory, opening a tool page, opening a stack, the Lab-off 404, Hindi chrome. Never weaken, skip or delete an existing test. Lint, type-check and the unit suite must pass. Run the WP's Playwright specs where Playwright is available and say whether you did.
5. **Design check.** Use the impeccable skill on every page you build or change, at 1280px and 390px; fix what it flags; never add coloured left-border stripes.
6. **Commits:** clear messages ending with `Co-Authored-By: Hermes (GLM 5.3) <noreply@example.invalid>`. Do not push from inside the session; the lane pushes after checks pass.
7. **Never ask the user anything.** When something is unclear, choose what best fits this spec, carry on, and record the decision in progress.md.
8. **Progress entry** in `asmita/docs/lab/open-tools-progress.md`, starting with the exact line `### WPnnn done`: what you built, what you verified and how, what you could not verify, every user-facing sentence the owner should approve (list new headings and ledes), decisions you made, and suggested additions.

---

## Part G — Work packages

### WP150 — Catalogue, stacks data and validation (no pages)

- Create `src/lib/lab/open-tools/catalogue.ts` with all 18 tools from Part D, fully written (English bodies; `summary.hi` machine translated, formal register).
- Create `src/lib/lab/open-tools/stacks.ts` with the three stacks from Part E, fully written.
- Create `src/lib/lab/open-tools/types.ts` (the types in Part D and E) and `filters.ts` (pure functions: filter by stage, audience, search; group by category in the Part C order).
- Tests for everything in Part D's validation list and the filter functions.
- Add `asmita/docs/lab/open-tools-sources.md`: per tool, the URLs you read and the date, and any fact you could not confirm (and therefore left out).
- No UI in this WP.

### WP151 — The directory page and the Lab hub entries

- `/lab/open-tools` exactly as C3 describes, with `OpenToolsDirectory.tsx` (client) and the workflow strip as its own component `WorkflowStrip.tsx` (reused read-only on tool pages).
- The two new cards at the top of the `/lab` tools grid ("Open tools", "Free stacks"), using the same card style as the beta tools but without the Beta badge; shown only when the Lab is on, like the beta tools.
- `lab-open-tools.css`, Icon additions if needed (category icons: matching = fingerprint-like grid, review = clipboard/checklist, models = layered nodes, provenance = seal/stamp, services = handshake-free neutral "link" or "shield", asmita = the site's existing brand-neutral icon, directories = book/list).
- Sitemap entries, i18n keys (en + hi), `hi-review-status.json` updates.
- Tests and Playwright spec for filtering; impeccable check.

### WP152 — Tool pages and diagrams

- `/lab/open-tools/[slug]` template exactly as C3, the diagrams from C4, and all 18 pages rendering from the catalogue.
- The English-only notice for the Hindi locale; metadata (title "{name} — Open tools — Asmita AI Lab", description = `summary.en`).
- Tests (every slug renders its required sections; "How Asmita uses it" only when `asmitaUse` exists; credit card text includes maintainer and licence; unknown slug 404). Impeccable check of at least `pdq`, `coop`, `ncii-prompt-guard`, `stopncii` and `asmita-fingerprint-feed` at both widths.

### WP153 — Stacks index and Stack 1

- `/lab/stacks` index and the `/lab/stacks/[slug]` template exactly as C3, with `PipelineDiagram`, rendering `stop-reuploads` fully. Stacks 2 and 3 exist in data but their pages may render only after WP154 (until then, their index cards show "Coming next" without a link).
- Tool pages' closing band "See it in a stack" now links to the stacks that use the tool.
- Tests, Playwright spec, impeccable check.

### WP154 — Stacks 2 and 3

- Render `ai-app-guardrails` and `rules-and-review` fully; remove "Coming next".
- Review all three stacks against Part A4 (specific, honest, no banned words) and Part E; fix.
- Tests, impeccable check.

### WP155 — How we choose, polish and audit

- `/lab/open-tools/how-we-choose` as C3.
- A full pass over every page built: headings order, focus order, tap targets, keyboard use of filters, no-JS rendering, reduced motion, Hindi chrome at 320px (no clipped Devanagari), link text, external link labels, the "Not open source" and "From Asmita" chips, the credit line on every tool page, and the banned-word test.
- Add a Playwright spec that walks: Lab hub → Open tools → filter "Prevent" + "an AI app" → NCII Prompt Guard → its stack → back.
- Update `asmita/docs/lab/open-tools-progress.md` with a final summary for the owner: the list of pages, what to review first (the India notes and the "With Asmita" sections), and the sentences that need owner approval.

---

## Part H — Not in scope

- An interactive prompt checker or any model running on Asmita's servers (a possible later Lab beta tool).
- Logos of other organisations, partner claims, testimonials, adoption numbers we have not sourced.
- Changes to the complaint workflow, `/for-platforms` copy, or the partner API.
- Donation or "support us" language of any kind.
