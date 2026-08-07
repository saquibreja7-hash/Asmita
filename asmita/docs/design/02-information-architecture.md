# Asmita Information Architecture (Sitemap)

Status: draft for alignment
Owner: Saquib
Last updated: 2026-08-04
Builds on: `01-brand-brief.md`. Reference: `reference/thorn-org-crawl.md`.

This is document 2 of 4. It defines the site's structure: navigation, page list,
audience segmentation, and page templates. It turns Asmita from a single
complaint flow into a multi-section platform. No visual decisions here yet.

## Four patterns we take from Thorn (and one we deliberately change)

1. **Audience is a primary navigation axis, not features.** Thorn splits by
   platforms / law enforcement+NGO / parents / youth. We split by survivors /
   parents & families / young people / platforms & partners.
2. **Every top page follows one shape:** eyebrow, headline, one-paragraph
   promise, proof, then a single clear call to action. We keep this rhythm.
3. **Research is a first-class section**, exposed as a real library with a
   taxonomy, not a marketing blog. It is the backbone of "we are a serious
   organization, not a charity."
4. **Terminology is spelled out on first use, every page**, and collected in a
   glossary. "Non-consensual intimate imagery (NCII)" written in full, then the
   short form.

**The one we change: the trust device.** Thorn's proof is huge numbers (992
billion files processed). We do not have those numbers and the brief forbids
inventing any. So our proof is different and honest:
   - Capability statements ("fingerprints are computed on your device; our server
     never sees your image").
   - Real legal grounding (the actual IT Rules and MeitY NCII SOP pathways).
   - Radical transparency about what we can and cannot do.
   - A named, real team and named real partners (Cloudflare for Startups, stated
     as fact, not endorsement).
   - Our own published research and reports.
   When we do earn real metrics, we add them, with honest footnotes on small
   samples the way Thorn labels its 32% figure.

## Primary navigation (recommended)

Five links, one prominent action button, and the language toggle. This mirrors
Thorn's weight (nav links + a standout button) but our button is help, not money.

```
[Asmita logo]   The Issue   Who We Help   What We Do   Research   About     [Get Help]  [EN / हिं]
```

- **The Issue** — understand the harms. Education and authority. Holds the glossary.
- **Who We Help** — the audience split (dropdown/mega-menu). The parents / children
  / women / platforms breadth.
- **What We Do** — our capabilities and tools. The "tech-led platform" proof.
- **Research** — research center, reports library, newsletter signup.
- **About** — who we are, team, partners, impact, newsroom. The not-a-nonprofit statement.
- **Get Help** (button, primary CTA everywhere) — the help hub and the report flow.

Secondary tier (footer + contextual links, not in the top bar): Resources hub,
FAQ, Contact, Newsroom, Newsletter, Privacy, Accessibility, Terms.

Open decision: five top links is already a lot on mobile. We may demote "What We
Do" or "Research" into a "More" menu. Resolve when we build the header.

## Full page tree

```
/                              Home (help-first hero + platform overview + audience cards)

/issue                         The Issue (hub: what this harm is, why it matters)
  /issue/ncii                  What is non-consensual intimate imagery (NCII)
  /issue/deepfakes             AI-generated and deepfake intimate images
  /issue/sextortion            Sextortion and blackmail
  /issue/morphing              Morphed and face-swapped images
  /issue/doxxing               Doxxing and impersonation
  /glossary                    Glossary of terms (spelled-out definitions, EN + HI)
  /glossary/[term]             Single term (optional; can be anchors on /glossary)

/who-we-help                   Audience hub
  /for-survivors               Adults / women facing image-based abuse (leads to Get Help)
  /for-parents                 Parents & families: signs, how to help, safe routing
  /for-young-people            Under-18 guidance: info + routing to child-protection ONLY
  /for-platforms               Platforms & partners: how we work with you, the technical story

/what-we-do                    Capabilities hub (the platform, not a form)
  /what-we-do/takedown         Takedown notice generation and routing
  /what-we-do/fingerprinting   On-device fingerprint blocking (no image leaves the device)
  /what-we-do/ai-check         AI / deepfake image check
  /what-we-do/monitoring       Resurfacing monitoring (roadmap; label as upcoming)

/get-help                      Help hub (situation triage) — PRIMARY CTA target
  /start                       The report / takedown flow (existing tool)
  /check-image                 AI / deepfake check tool (existing)
  /minor-support               Under-18 routing (existing; child-protection channels)
  /sextortion                  Sextortion emergency guidance (fast, do-not-pay first)

/research                      Research Center
  /research/library            Filterable reports library (topic, year, audience)
  /research/[report-slug]      A single report (as a PAGE, plus optional PDF)
  /research/[topic]            Topic landing (e.g. deepfakes, sextortion)

/resources                     Resources hub
  /resources/guides            Practical guides (secure your accounts, collect evidence)
  /resources/directory         Verified support directory (helplines, OSCs, legal aid)
  /resources/legal             Your legal rights in India (IT Rules, MeitY SOP, NCRP, GAC)

/about                         Who We Are (not a nonprofit statement, mission)
  /about/team                  The team (real, named)
  /about/impact                What we have done (honest, no invented numbers)
  /about/partners              Partners and infrastructure (Cloudflare, etc., factual)

/newsroom                      Press releases and announcements
/newsletter                    Newsletter signup + past issues
/faq                           FAQ (top-level, like Thorn's /faqs)
/contact                       Contact
/privacy  /terms  /accessibility  /sitemap    Standard footer pages
```

## Audience segmentation detail (the parents / children / women / platforms breadth)

Each audience page follows the same shape (eyebrow, headline, promise, proof,
CTA) but with its own framing, its own facts, and its own action verb.

- **For survivors** (adults, primarily women). Verb: "Get help now." Routes into
  the report flow, the AI check, evidence and account-security guidance. Calm,
  plain, crisis-aware.
- **For parents & families.** Verb: "Learn how to help." Signs to watch for, how
  to support without blame, and safe next steps. If the person is under 18, this
  page routes to child-protection channels and never invites uploading a child's
  image.
- **For young people** (under 18). Verb: "Find the right support." Age-appropriate,
  reassuring, and strictly information plus routing to Childline (1098), Take It
  Down (NCMEC), and cybercrime channels. No intake, no upload, no case flow. This
  enforces the platform rule that minors never enter the adult case flow.
- **For platforms & partners.** Verb: "Work with us." The technical and trust
  story: how notices arrive, fingerprint blocking, the no-media architecture,
  legal basis. Establishes us as a credible technical counterpart.

## Child-safety guardrail (non-negotiable)

Anywhere a minor could appear, the site offers information and routing only. No
page in `/for-young-people`, `/for-parents`, or `/minor-support` may present an
image upload, a case-creation step, or anything that pulls a minor toward the
adult flow. This is a legal obligation (POCSO), not a preference.

## Page templates (feeds documents 3 and 4)

Nine templates cover the whole site. Building these nine, well, builds everything.

1. **Home** — help-first hero, platform overview, audience cards, research teaser,
   trust strip (honest), newsletter block.
2. **Section hub** — The Issue, Who We Help, What We Do, Research, Resources.
   (eyebrow, headline, promise, a grid of child pages, a closing CTA.)
3. **Audience landing** — For survivors / parents / young people / platforms.
4. **Education article** — long-form explainer (What is NCII, deepfakes, etc.),
   readable, with a glossary-linked terminology, ends in a Get Help CTA.
5. **Action / tool page** — the report flow, check-image, sextortion. Focused,
   low-distraction, the tool is the page.
6. **Research library** — filterable list (topic, year, audience).
7. **Article / report / post** — a single research report, newsletter issue, or
   attributed survivor story (first name, their choice to speak).
8. **Glossary** — term list with in-page definitions, EN + HI.
9. **Simple content** — About, Team, FAQ, Contact, Privacy, Terms, Accessibility.

## Bilingual and access requirements (carried into every template)

- Every page exists in English and Hindi; language toggle never loses the page.
- Terminology spelled out on first use in both languages.
- Text-first, works on slow connections and old Android. No mandatory video or
  heavy scroll animation (the reason the earlier template redesign was rejected).
- Keep the survivor-safety basics on the roadmap (Quick Exit, neutral titles,
  noindex on any future dashboards) in mind as templates are built.

## What moves, what stays (migration note)

The existing tools do not get rebuilt, they get re-homed and re-skinned:
- `/start` (report flow), `/check-image`, `/minor-support` keep working; they move
  under `/get-help` and adopt the new design system.
- `/how-it-works`, `/resources`, `/faq`, `/privacy` content is re-slotted into the
  new tree (How We Help / What We Do / Resources / FAQ).
Nothing in the backend, case logic, or notice pipeline changes for this redesign.

## Open decisions

- Final top-nav count (5 links may trim to 4 + a "More" menu on mobile).
- Whether "Get Help" is a nav item, a button, or both.
- Glossary as one page with anchors vs a page per term.
- Whether reports live at `/research/[slug]` or `/research/library/[slug]`.
- Lead wordmark: "Asmita" vs "Meri Asmita" (carried from the brief).
