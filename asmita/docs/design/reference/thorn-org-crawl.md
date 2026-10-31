# thorn.org crawl — 2026-08-04

Source: Context connector (web-crawl + sitemap discovery). 11 sitemaps, 285 URLs found.

## Site structure

```
/                          home
/issue                     the problem framing
/about                     Who We Are
  /about/our-impact        + 2023, 2024, 2025 impact reports
/solutions                 hub
  /solutions/for-platforms         Safer (CSAM/CSE-text detection), consulting, AI red-teaming
  /solutions/victim-identification Thorn Detect (was CSAM Classifier)
  /solutions/for-parents           -> parents.thorn.org
  /solutions/for-youth             -> nofiltr.org
  /solutions/contact-sales
/research                  Research Center
  /research/library                ~40 published reports
  /research/child-sexual-abuse-material-csam
  /research/sexting-and-nonconsensual-sharing
  /research/grooming-and-sextortion
  /research/disclosure-and-reporting
/research-updates          researcher mailing list
/blog                      ~230 posts, faceted by category / topic / population /
                           data-collection-year / publication-year
/press-releases            ~20
/newsroom
/support                   builders-program, planned-giving, cause-community, more-ways-to-give
/pledge  /faqs  /careers  /contact  /accessibility  /privacy-policy  /sitemap
```

Off-domain properties: `safer.io` (product), `parents.thorn.org`, `nofiltr.org`,
`info.thorn.org` (HubSpot: donate, gated guides, PDFs), `get.safer.io` (gated reports).

## Page-copy patterns worth stealing

**Eyebrow → headline → one-paragraph promise → proof stats → CTA.** Every top page follows it.

- `/solutions`: "Define a safer online" / "Tomorrow doesn't become safer for children on its
  own. We must create it together."
- `/solutions/for-platforms`: eyebrow "SOLUTIONS FOR CONTENT-HOSTING PLATFORMS", H1
  "Prioritize child safety, mitigate risk."
- `/solutions/victim-identification`: "Here to help you find children faster" — opens with
  "Behind every file of child sexual abuse material (CSAM) is a child."
- `/about/our-impact`: "Technology is constantly evolving. And so are we."
- `/research`: "Our research drives child safety solutions"

**Audience split is the primary navigation axis**, not feature: platforms / law enforcement +
NGOs / parents / youth. Each audience gets its own page, its own stat set, its own CTA verb
("See Tech That Protects", "More on Victim ID", "Visit Thorn for Parents", "Explore NoFiltr").

**Stats are the trust device.** Repeated verbatim across pages:
- 992 billion total files processed since 2019
- 13.1M+ potential CSAM files flagged for removal
- 1,046 law enforcement agencies across 40 countries
- 32% average triage time saved (footnoted: "Based on 55 CSAM Classifier user responses to a
  2023 user survey")
- 12.3M conversations facilitated by NoFiltr
- 5,303,413 files detected in 2025; 318,593,302 lines of text processed

Note the footnote on the 32% figure. Small-sample claims are labelled, not hidden.

**Social proof by named quote, not logo wall alone.** GoDaddy Director of Infosec, OpenAI Child
Safety TPM, and an anonymous "Investigator, United States" ("The children you'll never see,
never meet, and sometimes never even know about are thankful for you."). Partner logos appear
but always alongside a named human quote.

**Ecosystem partnerships section** on the victim-ID page: INHOPE, INHOPE Global Standard
Project (shared CSAM ontology / Universal Classification Schema), INTERPOL Crimes Against
Children Unit. Framed as "we each have a unique role to play."

**Blog is a research distribution channel**, not marketing. Faceted by population studied
(9-12, 13-17, 18-20, 21+, caregivers), data collection year, and publication year — the
taxonomy of a research org, exposed as URL structure.

**Every page ends on a donate or contact CTA.** "Every dollar accelerates the speed of hope."

## Tech notes

WordPress. Yoast SEO (full JSON-LD @graph: WebPage + BreadcrumbList + WebSite + Organization,
with SearchAction). HubSpot for gated content and donations. Social share images at
1200x630 per page, named `socialshare-<page>-1200x630.jpg`. Logo is an SVG at 141x34.
Viewport allows `maximum-scale=2.0, user-scalable=yes` — deliberate accessibility choice.
There is a dedicated `/accessibility` page.

## Notable for Asmita

- Thorn never shows or implies media on the site. The hash/detection story is told entirely in
  numbers and outcomes. Same constraint Asmita has, solved by copy.
- Language: "child sexual abuse material (CSAM)" spelled out on first use, every page. They
  also have a blog post arguing against the term "child pornography"
  (`/blog/redefining-child-pornography`).
- Survivor voice is used but attributed by first name and framed as their own choice to speak
  (`/blog/lennon-torres-i-was-groomed-online...`, `/blog/pauline-stuart-i-want-parents-to-know...`).
- They publish an annual impact report as a page, not just a PDF, from 2023 onward. PDFs only
  for 2017-2022.
- `/faqs` exists as a top-level page.
