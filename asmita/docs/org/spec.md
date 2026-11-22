# Meri Asmita organization pages: spec

Owner-approved scope (20 November 2026): sections 3 (Partnerships), 4 (Community and outreach) and 5 (Advocacy and research). Sections 1 (trust and legitimacy), 2 (funding) and 6 (more languages) are out of scope for now.

The site belongs to Meri Asmita, an organization. These pages present the organization: how to work with it, join it, learn from it and follow its advocacy. None of this is part of the survivor complaint filing workflow, so the complaint-workflow Safety Principles in root CLAUDE.md do not apply here (read its 'Scope of the constraints below' section). The one exception is the platform scorecard in WP58, which reads complaint data. It reads only and publishes only aggregates, and changes nothing in the complaint workflow.

## 0. How to build: shared rules for WP56, WP57 and WP58

### Design (impeccable)
- The `impeccable` skill is installed for you. Use it. Run its setup (`scripts/impeccable context`) at the start of the WP.
- In WP56 only: if `asmita/DESIGN.md` does not exist, run `impeccable document` first to capture the current design system from the code (tokens in globals.css, AppShell, page-canvas / hero / zone-white / section-pad patterns, Illustration, Icon, eyebrow / page-title / section-title type). Commit it. Later WPs read it.
- Each new page is **refinement inside the existing visual world**, not a redesign. Reuse AppShell, the hero pattern from /research and /what-we-do, existing tokens, components and illustrations. Mode is Persuade for hubs (/partners, /get-involved), Read for posts, policy and research, and Operate for admin pages and forms.
- Before finishing each WP, run `impeccable audit` and `impeccable polish` on the pages you built, and fix what they find. Check phone width (360px), dark mode if the site has it, keyboard focus and contrast.
- Never add coloured left-border accent stripes on cards or callouts. Do not touch /start's design.

### Content and copy
- Plain, warm, direct English. No jargon. Short sentences.
- Every public string goes in `asmita/src/i18n/en.json` and `hi.json` (or the existing `say(en, hi)` pattern where the page already uses it; prefer the JSON files for new pages). List new Hindi keys as machine translated in `hi-review-status.json`. Admin pages are English only.
- **Never invent organizational facts**: partner names, people, numbers, prices, dates, registrations, addresses or quotes. Where a real fact is needed, put a clearly visible placeholder `<TO_FILL: what is needed>` in the content. List every placeholder in the WP's progress section so the owner can supply them.
- Honest empty states. When a list is empty (no jobs, no events, no posts, no published scorecard), say so plainly and offer the next useful action, as /research does today.

### Forms (one shared pipeline, built in WP56)
Every public form follows the pattern of `src/app/api/partners/route.ts` (the /for-platforms sign-up):
- CSRF (`verifyCsrfRequest`), body size cap, strict Zod schema, rate limit per IP (`shared: true`) and per email, hidden honeypot field, `logSecurityEvent` on refusals.
- Personal fields (name, email, phone, message) are encrypted at rest with `encryptField` / `decryptField` from `src/lib/encryption.ts`. Store an email hash for dedup and rate limits.
- On submit, notify the organization inbox through the existing email sender (Resend), using a new env var `ORG_INBOX_EMAIL` (document it in `.env.example`; unset in dev means log instead of send). Send the applicant a short acknowledgement email.
- Audit-log every admin action on submissions with its own event names (`ORG_*`).
- Retention: the maintenance cron (`/api/cron/maintenance`) deletes closed or rejected submissions 12 months after closing and unconfirmed newsletter sign-ups after 7 days. Add tests.
- Each form has a clear success state, field-level errors, and works without JavaScript errors on phones.

### Admin
- New permissions in the existing admin permission system: `content:manage` (posts, jobs, events, org partners, scorecard publishing) and `outreach:manage` (submissions, newsletter list export). SUPER_ADMIN gets both. Wire them like existing permissions, including role defaults and tests.
- One admin section, `/admin/org`, with sub-pages per area (listed in each WP), added to the admin navigation. Lists are sortable and filterable by status. Each record has a detail view with status changes and internal notes.
- All admin API routes: admin auth plus the right permission, CSRF on mutations, Zod validation, rate limiter.

### Data
- Prisma migrations for new tables. Models below are guidance; adjust field names to house style, but keep the meaning.
- Kysely types are generated; never hand-write `src/generated/`.
- Work on both the database path (`case-ops`-style Prisma/Kysely) and, where the site has a memory fallback for dev without `DATABASE_URL`, a memory fallback, following how the partner sign-up does it.

### Testing
- Vitest for every API route (validation, auth, permission, CSRF, rate limit, honeypot), the markdown renderer (XSS cases), the newsletter token flow, retention and the scorecard aggregation.
- One Playwright spec per WP (chromium), listed in each WP. Write them carefully: the full Playwright run happens in a separate verify step on another machine.
- Never weaken an existing test.

### Navigation
- Header: add a group **'Get involved'** (`/get-involved` overview, Partner with us, Volunteer, Careers, Training and workshops, Newsletter). Extend the existing Resources/Research area with **News**, **Policy and advocacy**, **Research** and **Platform scorecard** (only once a scorecard is published).
- Footer: add links to Get involved, Partner with us, Careers, News, Policy, Research, Newsletter signup (inline email field).
- Update `/sitemap` (the page) and the XML sitemap if there is one.

---

## WP56: foundation plus Community and outreach (section 4)

### 56.1 Content system (used by WP57 and WP58 too)
Model `OrgPost`:
- `slug` (unique), `kind`: `NEWS | CASE_STUDY | POLICY | CAMPAIGN | RESEARCH | LAB_NOTE | PRESS`
- `titleEn`, `titleHi?`, `summaryEn`, `summaryHi?`, `bodyEn` (markdown), `bodyHi?` (markdown)
- `coverIllustration?` (name of an existing Illustration) or `coverImagePath?` (a file under `public/`)
- `attachmentUrl?` and `attachmentLabel?` (for a PDF submission or report)
- `ctaLabel?`, `ctaUrl?` (for campaigns)
- `tags String[]`, `authorDisplayName`, `status`: `DRAFT | PUBLISHED | ARCHIVED`, `publishedAt?`, timestamps
- For `CASE_STUDY` only: `consentRecorded Boolean`, `anonymised Boolean`. Publishing a case study is refused unless both are true, and the admin form says why.

Rendering:
- A safe markdown renderer: headings, paragraphs, lists, links, emphasis, blockquotes, tables, images from the site's own paths only. No raw HTML. External links get `rel='noopener noreferrer'`. Choose a small maintained library that works on Cloudflare Workers, or write a minimal renderer. Record the choice. XSS tests are required.
- Reading layout using the existing `Reading` / `ReadingTime` components.
- Hindi falls back to English per field, with a small 'Not yet available in Hindi' note.

Admin `/admin/org/posts`:
- List, create, edit (markdown editor with live preview), publish, unpublish, archive and delete a draft.
- Slug is auto-generated from the title and editable. Setting it to an existing slug is refused.

Public:
- `/news`: all published posts, newest first, filter chips by kind, paginated (12 per page).
- `/news/[slug]`: the post, with an OpenGraph image and meta, share links (copy link, WhatsApp, X, LinkedIn, email; plain links, no third-party scripts) and related posts with the same kind.
- `/news/rss.xml`: an RSS feed.

### 56.2 Shared forms pipeline
- Model `OrgSubmission`: `kind` (`VOLUNTEER | TRAINING_REQUEST | PARTNER_INQUIRY`, extended in WP57), `status` (`NEW | IN_REVIEW | ACCEPTED | DECLINED | CLOSED`), encrypted `payload` JSON (the form fields), `emailHash`, `internalNotes?`, `closedAt?`, timestamps.
- Build it as described in section 0, once, with a typed registry: each form kind declares its Zod schema, admin display labels and email templates.
- Admin `/admin/org/submissions`: tabs by kind, status filter, detail view, status change, notes, and CSV export of the filtered list (`outreach:manage`, audit-logged).

### 56.3 /get-involved (hub)
- Hero: 'Help us end image-based abuse' (or better copy in the same spirit).
- Cards linking to Partner with us, Volunteer, Careers, Training and workshops, Newsletter and News, each with one line on who it is for.
- A short section 'Other ways to help': share our resources, follow us (`<TO_FILL: social links>`) and tell someone who needs help about /get-help.

### 56.4 /volunteer
- Roles, as content: legal volunteers (lawyers and law students), translators and language reviewers (Hindi and regional languages), research volunteers (data and policy), design and technology, outreach and campus ambassadors, and workshop facilitators (after training). For each role: what you'd do, the time it takes, the skills that help.
- A plain statement: 'Volunteers never see survivors' case details.' (This is true: volunteers get no admin access.)
- How it works: apply, a short call, onboarding, first task.
- Application form (`VOLUNTEER`): name, email, phone (optional), city, state (select of Indian states and UTs), languages (multi-select plus other), roles of interest (multi, 1 to 3), hours per week (select), experience (textarea, 1,500 characters), how you heard about us (optional), 'I am 18 or older' (required), consent to be contacted (required).

### 56.5 /careers
- Model `OrgJob`: `title`, `team`, `location` (or 'Remote, India'), `type` (`FULL_TIME | PART_TIME | CONTRACT | INTERNSHIP | FELLOWSHIP`), `descriptionMd`, `applyEmail`, `applyInstructions?`, `status` (`OPEN | CLOSED | DRAFT`), `closesAt?`, timestamps.
- `/careers` lists open roles. Empty state: 'No open roles right now', plus a link to volunteer and a newsletter signup.
- `/careers/[slug]` shows the role and applying by email: a `mailto:` with the role in the subject plus written instructions. No CV upload and no stored applications.
- A 'Why work with us' section (`<TO_FILL>` placeholders for benefits) and an equal-opportunity statement.
- Admin `/admin/org/jobs`: create, edit, open, close.
- Add JobPosting structured data (JSON-LD) on role pages.

### 56.6 /training (Training and workshops)
- Programmes, as content: colleges and universities (students), schools (for teachers, counsellors and parents; never sessions delivered directly to children), police and cyber cells, workplaces (HR and POSH committees), NGOs and helplines (frontline staff), and journalists and media.
- For each: what the session covers, the format (online or in person), its length, the language options and the cost (`<TO_FILL>`, or 'free for <TO_FILL>').
- Model `OrgEvent`: `titleEn`, `titleHi?`, `startsAt`, `endsAt?`, `mode` (`ONLINE | IN_PERSON | HYBRID`), `city?`, `registrationUrl?`, `descriptionMd`, `status` (`DRAFT | PUBLISHED | CANCELLED`). Upcoming published events show on /training and on /get-involved; past ones go under 'Past sessions'.
- Booking request form (`TRAINING_REQUEST`): organization name, type (select from the programmes), contact name, role, email, phone (optional), city and state, audience size (select), preferred months, language, mode, and a message.
- Admin `/admin/org/events`.

### 56.7 Newsletter
- Model `NewsletterSubscriber`: encrypted email, `emailHash` (unique), `locale`, `status` (`PENDING | CONFIRMED | UNSUBSCRIBED`), `confirmTokenHash?`, `confirmedAt?`, `unsubscribedAt?`, `source` (the page slug).
- Double opt-in: signing up sends a confirmation email with a single-use token (stored hashed, expires in 7 days). `/newsletter/confirm?token=` confirms. Every email has `/newsletter/unsubscribe?token=` (a per-subscriber token, stored hashed). Signing up an address that is already confirmed must not reveal that it exists: show the same response.
- `/newsletter` page with what we send and how often (`<TO_FILL: frequency>`), plus the form. A compact inline form in the footer.
- Admin `/admin/org/newsletter`: counts by status, and a CSV export of confirmed subscribers (email, locale, confirmed date), audit-logged. Sending newsletters is out of scope (they go out from an external tool for now); say so on the admin page.

### 56.8 Case studies
`CASE_STUDY` posts list on `/news?kind=case-study` and in a 'Stories' strip on /get-involved. The admin editor shows a checklist (consent recorded, anonymised: no names, places, platforms that would identify, or dates) and blocks publishing until both boxes are ticked.

## WP56 tests
- Vitest:
  - permissions
  - every form API
  - the submissions admin APIs
  - the markdown renderer's XSS cases
  - the post slug and publish rules (including the case-study block)
  - the newsletter confirm and unsubscribe flow and its non-disclosure
  - retention
  - the RSS output
- Playwright `org-outreach.spec.ts`:
  - /get-involved renders in en and hi
  - a visitor submits the volunteer form and sees success
  - an admin publishes a news post, and it appears on /news and /news/[slug]
  - an admin opens a job, and it appears on /careers
  - a newsletter signup shows the 'check your email' state

---

## WP57: Partnerships (section 3)

Builds on WP56's forms pipeline and content system. Extend `OrgSubmission.kind` with `PARTNER_NGO | PARTNER_LEGAL | PARTNER_LAW_ENFORCEMENT | PARTNER_ACADEMIC`, and keep the existing platform sign-up at /for-platforms as it is.

### 57.1 /partners (hub)
- Hero: 'Partner with Meri Asmita'. The page explains what partnership means for each type.
- Partner types as cards, each linking to its page:
  - **NGOs and helplines:** referrals both ways, shared resources, co-run trainings, and a warm handoff path for survivors.
  - **Legal:** pro bono lawyers, law firms, legal aid clinics and law school clinics. They review notice templates, take on cases that need court action and run legal-literacy sessions.
  - **Police and cyber cells:** trainings, referral pathways and help with the FIR package survivors can generate. Be precise: we do not share survivor data without the survivor's choice.
  - **Universities and researchers:** research collaborations using aggregate data, campus programmes, internships and fellowships.
  - **Platforms:** links to the existing /for-platforms and to the trusted-flagger page.
- 'Current partners': built from the `OrgPartner` model. Shows only partners an admin has marked public. Empty state: 'We're building our first partnerships. Be one of them.'
- How partnership works: inquiry, a call, an MoU or letter of intent (`<TO_FILL>` if the organization has a template), onboarding, review.

### 57.2 /partners/[type] pages
One page per type: `ngos`, `legal`, `law-enforcement`, `academic`. Each has:
- What we offer and what we ask
- Examples of collaboration
- A short FAQ for that type
- The inquiry form

The form has the shared fields: organization name, type, website (optional), city and state, contact name, role, email, phone (optional), message. Each type adds fields:
- **NGOs and helplines:** areas served (states), helpline number (optional), services offered (multi-select).
- **Legal:** bar enrolment state (optional), practice areas (multi-select), hours per month for pro bono work (select).
- **Police and cyber cells:** unit or station, district, interest (training, referral pathway, other).
- **Universities and researchers:** department, interest (research, campus programme, internships).

### 57.3 OrgPartner and the supporters strip
- Model `OrgPartner`: `name`, `type`, `logoPath?` (a file under `public/partners/`; the owner adds logo files), `url?`, `blurbEn`, `blurbHi?`, `isPublic`, `sortOrder`.
- Admin `/admin/org/partners`: create, edit, reorder, toggle public.
- The existing `Supporters.tsx` strip reads from this model when there are public partners. If there are none, it keeps its current behaviour; check what that is and preserve it.

### 57.4 Trusted-flagger page
`/for-platforms/trusted-flagger`
For platform trust and safety teams. It says what to expect when a notice comes from Meri Asmita:
- How a notice is formed (a survivor-reviewed and signed notice; what the PDF and email contain; the fingerprint annex when present).
- What we check before sending (contact verification, template review).
- Response deadlines. Read them from `src/lib/escalation-ladder.ts` (`PLATFORM_DEADLINE_HOURS`) at build time; never hard-code numbers.
- How follow-ups and escalation work.
- How to reach us about a notice: the reply address, and `<TO_FILL: trust and safety contact>`.
- How to become a platform partner (link to /for-platforms).

Describe only what the code and templates actually do. Read `notice-*.ts`, `prisma/template-seeds.ts`, `case-hash-annex.ts`, `escalation-engine.ts` and `hash-dispatch.ts`, and write from them. Do not cite law on this page beyond naming what the notice itself cites. Link from /for-platforms.

## WP57 tests
- Vitest: each partner inquiry schema and its API; OrgPartner admin APIs and permission; the Supporters strip with and without public partners; the trusted-flagger page reading its deadline from the constant (a test that fails if the page and the constant disagree).
- Playwright `org-partners.spec.ts`: /partners and each type page render in en and hi; an NGO inquiry submits and shows success; an admin marks a partner public and it appears on /partners.

---

## WP58: Advocacy and research (section 5)

### 58.1 /policy (Policy and advocacy)
- Hero: what we advocate for (`<TO_FILL: the owner's priority asks>`). Show three to five placeholder priority cards, clearly marked `<TO_FILL>`, which the owner will replace.
- Lists of `POLICY` posts (submissions, consultation responses and position papers, each with an attachment link when present) and `CAMPAIGN` posts (each with its call-to-action button).
- `/policy/[slug]` renders the post (it may reuse the /news/[slug] layout through a shared component).

### 58.2 /research (rebuild)
- Keep the existing hero and the 'approach' section (update its wording only if it conflicts with the organization framing).
- Replace the 'first reports are in progress' empty state with real lists:
  - Publications (`RESEARCH` posts)
  - Lab notes (`LAB_NOTE` posts)
  - Keep the empty state only while both lists are empty.
- A section linking to the AI Lab (`/lab`), shown only when `ENABLE_LAB` is on. The Lab may not be merged yet; guard on the flag helper if it exists, otherwise leave a TODO and a test-free stub.
- An 'Open tools and data' section: links to the public GitHub repo's `tools/` (for example lab-bench and pdq-robustness, if present on master) and to the scorecard's CSV.

### 58.3 Platform scorecard
`/research/platform-scorecard`
A public, aggregate view of how platforms respond to takedown notices sent through Meri Asmita.

**Computation**
- A pure function over complaint data. It reads only: `SubmittedUrl` (`platformId`, `status`, `submittedAt`, dispatch and outcome timestamps), dispatch records and the hash advisory dispatches.
- It computes per platform, per period (calendar quarter):
  - notices sent
  - share actioned (removed or confirmed)
  - median hours from dispatch to first platform response, where recorded
  - median hours to removal
  - share actioned within `PLATFORM_DEADLINE_HOURS`
  - follow-ups needed
- First read the schema and the escalation engine to find which fields exist. Compute only metrics the data actually supports, and drop the rest with a note in progress.md.
- **Small-number rule:** a platform with fewer than 10 notices in a period shows 'Not enough notices to report' instead of numbers. Make the threshold a constant and test it.

**Snapshot and publish**
- Model `ScorecardSnapshot`: `period`, `computedAt`, `data` (JSON, aggregates only, no case or URL ids), `status` (`DRAFT | PUBLISHED`), `publishedAt?`, `publishedBy?`, `notesEn?`, `notesHi?`.
- A quarterly snapshot is computed by the maintenance cron, or on demand from admin. It starts as `DRAFT`.
- An admin with `content:manage` reviews it on `/admin/org/scorecard`: they see the table, can add a methodology note, and publish it. This is a data-quality check before public numbers go out.

**Public page**
- The latest published snapshot as an accessible, sortable table. A simple bar chart is optional; it must have a table equivalent.
- A methodology section: what counts as actioned, how times are measured, the small-number rule and the data sources.
- Earlier periods in a selector, and a CSV download (`/research/platform-scorecard.csv`).
- Before any snapshot is published, an honest empty state ('Our first scorecard will be published after <TO_FILL: period>.').
- The page and its nav link only appear once at least one snapshot is published; until then the route shows the empty state and nav does not link to it.

**Changes to the complaint workflow:** none. This is read-only. Add a test that asserts the scorecard module performs no writes (for example, a mocked db client that fails on any mutation).

### 58.4 /press
- `PRESS` posts (press releases), a 'Meri Asmita in the news' list (`PRESS` posts with an external `ctaUrl`), and a media contact (`<TO_FILL>`).
- A media kit section with downloadable logo files (`<TO_FILL: logo files in public/press/>`; link to whatever exists), a short boilerplate 'About Meri Asmita' paragraph (`<TO_FILL>`), and guidance for journalists on reporting on image-based abuse: don't identify survivors, don't describe or link to the content, and use survivor-centred language. That guidance is general good practice, not legal advice.

## WP58 tests
- Vitest:
  - scorecard aggregation: fixtures, the small-number rule, medians, the read-only guarantee, and no ids in the snapshot data
  - the snapshot publish API and its permission
  - the CSV output
  - the /research lists with and without posts
- Playwright `org-advocacy.spec.ts`:
  - /policy and /research render in en and hi
  - /research/platform-scorecard shows the empty state with no published snapshot
  - after an admin publishes a seeded draft snapshot, the table and the CSV link appear
  - a platform under the threshold shows 'Not enough notices to report'

---

## Progress and handover (every WP)

Append a section per WP to `asmita/docs/org/progress.md` covering:
- what was built
- what was not verified on this machine (Playwright, worker smoke)
- every `<TO_FILL>` placeholder with its page and what the owner needs to supply
- user-facing sentences the owner should approve
- the decisions you made on your own, including library choices
