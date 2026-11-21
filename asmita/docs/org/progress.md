# Meri Asmita organization pages: progress log

One section per work package, per the handover rules in `spec.md`.

---

## WP56 — foundation plus Community and outreach (section 4)

Branch: `feat/org-pages`. Built 20 November 2026.

### What was built

- **Design foundation (spec §0):** `asmita/DESIGN.md` captured from the existing implementation with the impeccable skill's `document` command (plus the `.impeccable/design.json` sidecar), so WP57/WP58 build inside the same visual world. The spec was committed as `docs/org/spec.md`.
- **Content system (56.1):** `OrgPost` model + migration; admin CRUD with a markdown editor (live preview), slug auto-generation with duplicate refusal, publish/unpublish/archive, draft-only delete, and the case-study gate (publish refused until consent recorded and anonymised are both true, with the reason shown in the editor). Public `/news` (kind filter chips, 12-per-page pagination, honest empty state), `/news/[slug]` (reading layout with contents rail, OpenGraph/Twitter meta with the cover image, share links: copy link / WhatsApp / X / LinkedIn / email — all plain links, related posts of the same kind, Hindi-per-field fallback with a "not yet available in Hindi" note), and `/news/rss.xml`.
- **Shared forms pipeline (56.2):** one endpoint (`POST /api/org/submissions`) with a typed registry — each kind declares its Zod schema, admin labels and email copy. CSRF, 8 KB body cap, strict schemas, honeypot (`fax`), per-IP (10/h, shared) and per-email (3/day) rate limits, whole-payload encryption at rest (`encryptField`), sha256 email hash for dedup/limits, `logSecurityEvent` on refusals. Org-inbox notification + applicant acknowledgement through Resend; `ORG_INBOX_EMAIL` documented in `.env.example` (unset in dev = the notification is logged). Admin `/admin/org/submissions`: tabs per kind, status filter, detail view, status changes (closing starts the retention clock), internal notes, CSV export of the filtered list — all audit-logged with `ORG_*` events.
- **/get-involved (56.3):** hero "Help us end image-based abuse", one card per way to join (Partner with us, Volunteer, Careers, Training, Newsletter, News), the Stories strip from published case studies (56.8), upcoming published events (56.6), and "Other ways to help" with the `<TO_FILL: social links>` placeholder and a pointer to /get-help.
- **/volunteer (56.4):** six roles as content (what you'd do, the time it takes, the skills that help), the plain statement that volunteers never see survivors' case details, how-it-works steps, and the application form (name, email, optional phone, city, state/UT select, languages multi-select + other, 1–3 roles, hours/week, 1,500-char experience, optional "how you heard", 18+ and consent checkboxes).
- **/careers (56.5):** `OrgJob` model; list of open roles with an honest empty state (volunteer link + newsletter form); role pages with a `mailto:` application (role in the subject, written instructions, no CV upload, nothing stored), "Why work with us" with `<TO_FILL>` benefits, equal-opportunity statement, JobPosting JSON-LD.
- **/training (56.6):** six programmes as content with `<TO_FILL>` length/cost, published-event listing split into upcoming/past, booking-request form (organization, programme type, contact, role, email, optional phone, city, state, audience size, preferred months, language, mode, message).
- **Newsletter (56.7):** `NewsletterSubscriber` model; double opt-in with a single-use hashed confirm token (7-day TTL) and a per-subscriber hashed unsubscribe token; non-disclosure on resubscribe (identical response for new/pending/confirmed, no email for confirmed); `/newsletter`, `/newsletter/confirm`, `/newsletter/unsubscribe` pages; compact inline form in the footer; admin `/admin/org/newsletter` with counts by status, confirmed-subscribers CSV, and the note that sending happens from an external tool.
- **Admin (spec §0):** new permissions `content:manage` and `outreach:manage` (SUPER_ADMIN only; other roles keep their existing sets), one `/admin/org` section (posts, submissions, jobs, events, newsletter) in the admin nav, every admin API behind admin auth + permission + CSRF on mutations + Zod + a per-admin rate limit, every admin action audit-logged (`ORG_POST_*`, `ORG_JOB_*`, `ORG_EVENT_*`, `ORG_SUBMISSION_*`, `ORG_NEWSLETTER_EXPORTED` — new `AuditEventType` values).
- **Retention (spec §0):** the maintenance cron now also deletes CLOSED/DECLINED submissions 12 months after `closedAt` and unconfirmed newsletter sign-ups after 7 days; tested with a moved clock.
- **Navigation:** header group "Get involved" (overview, Partner with us, Volunteer, Careers, Training and workshops, Newsletter); News + Policy and advocacy added to the Resources/Research area; footer "Get involved" column (Get involved, Partner with us, Careers, News, Policy and advocacy, Research) plus the inline newsletter form; `/sitemap` page and the XML sitemap extended.
- **i18n:** 268 new keys in `en.json` and `hi.json` (full parity, verified programmatically), all listed as machine translated in `hi-review-status.json`. Admin pages are English-only.
- **Tests:** vitest suites for the markdown renderer (structure + XSS cases), slug and publish rules (including the case-study block), the form APIs (CSRF, validation, honeypot, body cap, per-IP and per-email limits), the submissions admin APIs (auth, permission, CSRF, status/notes/CSV), the newsletter token flow and its non-disclosure, retention, the RSS output, and the two new permissions; the admin-nav-permissions fixture maps the five new pages. Playwright `org-outreach.spec.ts` covers en+hi hub rendering, the volunteer form success state, an admin publishing a news post (visible on /news and /news/[slug]), an admin opening a job (visible on /careers with the mailto), and the newsletter "check your email" state.

### Not verified on this machine

- **Playwright** (`tests/e2e/org-outreach.spec.ts` and the rest of the e2e suite): the full run happens in the separate verify step on another machine with a real Postgres database. The spec was written against the existing harness (`adminContext`, CSRF-minted API requests) but not executed here.
- **Worker smoke** (`scripts/worker-smoke.mjs`) and the production/vinext builds: not run here (this machine runs lint, type-check and vitest).
- **Real email delivery:** no `RESEND_API_KEY`/`ORG_INBOX_EMAIL` on this machine; all sends take the dev no-op path. The dev paths were exercised via the running dev server (pages, forms pipeline states, RSS, token pages all render; `impeccable detect` scans ran against localhost:3000).
- **Database path against a live Postgres:** unit tests cover the Prisma paths through the same route handlers in memory mode; the e2e/verify step exercises the real database.

### `<TO_FILL>` placeholders for the owner

| Page / file | Placeholder | What the owner needs to supply |
|---|---|---|
| /get-involved ("Other ways to help") | plain LinkedIn icon, no link yet | The organization's social media URLs. The icon in the "Follow us" card is not a link; wrap it in `<a>` and add the other networks when the URLs are supplied. |
| /careers ("Why work with us") — key `org.careers.whyIntro` | `<TO_FILL: benefits — for example salary bands, leave policy, remote-work policy>` | The real benefits summary, in both languages (the key exists in `en.json` and `hi.json`). |
| /training (each of the 6 programmes) | `<TO_FILL: session length>` | How long a session of that programme runs. |
| /training (each of the 6 programmes) | `<TO_FILL: cost, or 'free for <TO_FILL>' >` | Cost, or who gets it free (e.g. "free for government schools"). |
| /newsletter ("How often we write") | `<TO_FILL: frequency>` | The real send cadence (e.g. "monthly"). |
| `.env.example` / deployment | `ORG_INBOX_EMAIL` | The real inbox that receives outreach-form notifications (Worker secret in production). |

### User-facing sentences the owner should approve

- "Help us end image-based abuse" (hub hero — or better copy in the same spirit).
- "Volunteers never see survivors' case details." and its explanation ("Volunteers get no access to survivor data") — on /volunteer, in the acknowledgement email, and in the hub.
- The equal-opportunity statement on /careers.
- "For teachers, counsellors and parents. We never deliver sessions directly to children." (school programme line).
- "Apply by email: … no CV upload here and we store no applications." (/careers).
- The volunteer how-it-works steps: apply, a short call, onboarding, first task.
- The acknowledgement email lines ("Thank you for offering your time. We read every application.", "Thank you for asking about a session. …").
- The newsletter privacy line ("We store your email only to send the newsletter. Every email has an unsubscribe link.") and "Newsletters are sent from an external tool for now" (admin page).

### Decisions made on my own

1. **Markdown renderer:** hand-written minimal renderer (`src/lib/markdown.ts`), no dependency — headings/paragraphs/lists/quotes/tables/code/links/emphasis/images, everything HTML-escaped before structuring, images restricted to site-local paths, external links get `rel="noopener noreferrer"`, `javascript:`/`data:` targets refused. Chosen over a library because it must run on Cloudflare Workers and the safest small dependency is none; XSS cases are unit-tested. H2/H3 get ids so the reading layout's contents rail can link to them.
2. **Statuses and kinds as app-validated strings**, not Prisma enums, matching the `PlatformPartnerApplication` house pattern and making WP57's partner kinds a pure registry extension. The one new Prisma enum surface is the `ORG_*` `AuditEventType` values.
3. **The `kind` key is stripped before the strict per-kind schema validates** — it is the routing key, not a form field.
4. **Email failures after storage don't fail the submit** — the submission is stored, the failure is logged (`email_failed` security event); the person can resubmit and the inbox notification is also logged when `ORG_INBOX_EMAIL` is unset, so nothing is lost in dev.
5. **Newsletter non-disclosure is strict:** an already-confirmed address gets no email and no state change (response identical to a fresh signup). Pending/unsubscribed addresses get a fresh single-use token (clock restarts from `updatedAt`).
6. **Retention window:** "12 months" implemented as a 12 × 30-day constant (`SUBMISSION_RETENTION_MS`), run from the maintenance cron's timestamp; `closedAt` is set on CLOSED or DECLINED. Unconfirmed sign-ups use the 7-day confirm TTL constant.
7. **Admin CSV columns are uniform across kinds** (id, kind, status, createdAt, closedAt, contact, email, city, state) so a mixed export stays one table; the full per-kind field detail lives in the admin detail view.
8. **JobPosting JSON-LD:** `hiringOrganization` uses schema.org's `NGO`; remote roles get `jobLocationType: TELECOMMUTE`, others a `jobLocation` place.
9. **Navigation ahead of pages:** the header, footer and sitemap link /partners and /policy now, per the shared navigation rules — those pages 404 until WP57/WP58 land on this same lane branch. The scorecard nav item is deliberately absent (WP58, published-only).
10. **Hindi translations** for all 268 new keys are machine translations by me, flagged in `hi-review-status.json` for the existing review process; Devanagari typography rules (no negative tracking, taller leading) come from the site CSS automatically.
11. **Design audit findings:** the impeccable detector flags `hero-eyebrow-chip`/`kicker` on every page including the pre-existing /research, /what-we-do and /about — the eyebrow is the committed house pattern (DESIGN.md), so those are verified false positives and kept. The icon-tile-above-card-heading shape I introduced was flagged 12×; fixed to the house side-by-side icon+heading, which also fixed a skipped-heading-level finding on /get-involved. A long-line paragraph on /careers was capped.
12. **Upcoming events render on /get-involved only when they exist** (no empty section on the hub; /training keeps the honest empty state).

---

## WP57 — Partnerships (section 3)

Branch: `feat/org-pages`. Built 21 November 2026. Builds on WP56's forms pipeline and content system.

### What was built

- **Typed partner inquiries (registry extension, 57.2):** four new `OrgSubmission` kinds — `PARTNER_NGO`, `PARTNER_LEGAL`, `PARTNER_LAW_ENFORCEMENT`, `PARTNER_ACADEMIC` — as pure additions to the WP56 registry (`ORG_FORMS`): per-kind Zod schemas (shared contact block + per-type fields), admin tab titles, inbox subjects and acknowledgement lines, all through the unchanged shared endpoint (`POST /api/org/submissions`) with its CSRF, body cap, honeypot, rate limits and payload encryption. The admin Outreach inbox, detail views and CSV export pick the new kinds up automatically. `/for-platforms` and its sign-up are untouched.
- **/partners hub (57.1):** hero "Partner with Meri Asmita", what partnership means, one card per type (NGOs and helplines, Legal, Police and cyber cells, Universities and researchers; Platforms as the one teal-mist card linking to /for-platforms and the trusted-flagger page), the admin-gated "Current partners" list with the honest empty state ("We're building our first partnerships. Be one of them."), how-partnership-works steps (inquiry → call → MoU/letter of intent → onboarding → review), and a closing band. In en and hi.
- **/partners/[type] pages (57.2):** one page per type — `ngos`, `legal`, `law-enforcement`, `academic` — each with what we offer / what we ask, examples of collaboration, a short FAQ, the shared data-privacy callout, and the inquiry form (`PartnerInquiryForm.tsx`, one client component, config-driven per type). Per-type fields exactly per spec: NGOs — states served (multi-select incl. Pan-India), optional helpline number, services offered; legal — optional bar enrolment state, practice areas, monthly pro bono hours; police — unit/station, district, interest; academic — department, interest. Unknown type slugs 404. In en and hi.
- **OrgPartner and the supporters strip (57.3):** new `OrgPartner` model (name, type, optional logo under `public/partners/`, optional url, blurb en/hi, `isPublic`, `sortOrder`) with an additive migration (`20261121060000_org_partners`, RLS + `asmita_app` policy like every table). Store in `src/lib/org-partners.ts` with the memory fallback, audit-logged admin actions (`ORG_PARTNER_SAVED`, `ORG_PARTNER_VISIBILITY_CHANGED`, `ORG_PARTNER_REORDERED` — new `AuditEventType` values). Admin `/admin/org/partners` (content:manage): create, edit, reorder (up/down posting the full order), show/hide; a new partner is never public until an admin says so. `Supporters.tsx` now shows public partners when there are any, and keeps its current behaviour (the static Cloudflare/Sarvam credits) when there are none — the resolver is a pure function so both behaviours are unit-tested.
- **Trusted-flagger page (57.4):** `/for-platforms/trusted-flagger`, for platform T&S and grievance teams, written strictly from the code and templates (`notice-dispatch.ts`, `escalation-engine.ts`, `case-hash-annex.ts`, `hash-dispatch.ts`, `template-seeds.ts`, `fir-package-generator.ts`): how a notice is formed (survivor-reported link → reviewed and signed declaration → one email with the signed `notice.pdf`, fingerprint annex only when signed fingerprints are approved), what we check first (human-verified contact, legally reviewed template — held if the template changed after signing — signature required, sent once via idempotency keys), what a notice carries and never carries, deadlines, follow-ups (one 24-hour covering letter that stops on any platform answer; her own cybercrime.gov.in complaint and appeal steps continue), and how to reach us (reply to the notice; `Notice@meriasmita.org`; quote the case reference). The 2-hour removal deadline is read from `PLATFORM_DEADLINE_HOURS` and the 24-hour follow-up from the newly exported `ESCALATION_HOURS` — a unit test fails if the page text and the constants disagree. No law is cited beyond naming what the notice itself cites (Rule 3(2)(b), IT Rules 2021 as amended 2026). Linked from /for-platforms (hero link + a new FAQ entry). English only, like /for-platforms (hi-review-status lists it).
- **Admin plumbing fixes found on the way:** WP56's admin org pages had no `/admin/org/*` route shims, so every admin-nav link under Organization 404'd (the pages served at `/org/*` instead). Added the seven shims (`src/app/admin/org/**`), following the house `src/app/admin/<x>/page.tsx` re-export pattern. Also renamed `(admin)/partners` → `(admin)/platform-partners`: it claimed the public `/partners` URL and served the platform-partners admin there (the admin URL `/admin/partners` and its nav entry are unchanged), which would have collided with the new public hub. Sitemap: the four type pages and the trusted-flagger page added to `/sitemap` and the XML sitemap.
- **i18n:** 186 new keys in `en.json` and `hi.json` (full parity, verified programmatically), all under the existing `org.*` machine-translation entry in `hi-review-status.json` (its note now names WP57).
- **Tests:** vitest `org-partners.test.ts` — each partner inquiry schema and the API (valid/invalid/honeypot per kind), the OrgPartner admin APIs (permission, CSRF, validation incl. the `/partners/`-only logo rule, visibility toggle, reorder, audit events, never-public-on-create), the Supporters strip with and without public partners, and the trusted-flagger deadline constant agreement; the registry-wide WP56 tests (honeypot-in-every-schema, admin labels, retention) now cover the new kinds automatically. Playwright `org-partners.spec.ts`: /partners and all four type pages in en and hi, an NGO inquiry submitting to the success state, and an admin marking a partner public so it appears on /partners.

### Not verified on this machine

- **Playwright** (`tests/e2e/org-partners.spec.ts` and the rest of the e2e suite): the full run needs the throwaway Postgres + `global-setup` and happens in the separate verify step on another machine. The visitor journeys of the new spec were dry-run here against the dev server with the exact spec selectors (all passed, including the full NGO form submit round-trip), but the admin-context test and the suite as a whole were not executed here.
- **Worker smoke** (`scripts/worker-smoke.mjs`) and the production/vinext builds: not run here.
- **Real email delivery:** no `RESEND_API_KEY`/`ORG_INBOX_EMAIL` here; sends take the dev no-op path.
- **Database path against a live Postgres:** unit tests cover the memory paths; the migration SQL is validated by `prisma validate` and follows the committed house pattern, but was not applied to a real database here.
- **Visual review:** the runtime vision backend on this machine is not multimodal, so screenshots could not be inspected by eye. Instead the impeccable audit items were checked programmatically over all six new pages at 360px and 1280px: no horizontal scroll at 360px, no drop shadows on cards, no left-border accent stripes, no skipped heading levels, one primary button in main content per page, and visible keyboard focus. Screenshots are not committed.

### `<TO_FILL>` placeholders for the owner

| Page / file | Placeholder | What the owner needs to supply |
|---|---|---|
| /partners ("How partnership works", step 3 — key `org.partners.how.3.body`) | `<TO_FILL: link or reference for the organization's MoU or letter-of-intent template, if one exists>` | The MoU / letter-of-intent template to link or name, or a decision that partnerships start without one. |
| /for-platforms/trusted-flagger ("Reach us") | `<TO_FILL: trust and safety contact>` | The named trust-and-safety contact (person, role and/or inbox) for platform teams. |
| `public/partners/` (referenced by OrgPartner.logoPath) | — | Logo files for public partners; the admin form accepts only `/partners/<file>` paths. |

### User-facing sentences the owner should approve

- "Partner with Meri Asmita" (hub hero) and the hub lede ("Survivors need a network around them…").
- "We're building our first partnerships. Be one of them." (empty state on /partners).
- The five how-partnership-works steps, especially step 3's MoU/letter-of-intent framing and step 5's "Partnerships grow by use, not by signature."
- "We never share survivor data with anyone without the survivor's choice." + "A partnership never includes case files, reported links or identifiers." (callout on all four type pages; the first sentence is the WP56-approved one).
- Per-type offer/ask/example/FAQ copy, in particular the police-page statements: "We do not share survivor data without the survivor's choice, and we will say no when a request crosses that line." and the FIR-package description ("…a PDF that lists her reported links, their status, and when notices were sent — ready to attach to a complaint.").
- The legal-page FAQ sentence "Our notice templates are signed off by qualified reviewers before we send them."
- The trusted-flagger page's factual descriptions (what a notice carries, what we check first, the follow-up behaviour) — written from the code; worth a read by the owner as the platform-facing commitment.
- The acknowledgement email lines for partner inquiries ("Thank you for writing. We will reply to discuss what a partnership could look like." + the data-sharing sentence).
- The admin pages' English microcopy (never public until an admin says so; order saved; etc.).

### Decisions made on my own

1. **The shared "type" field per page is a subtype select** (NGO/helpline/community group; lawyer/law firm/legal aid clinic/law school clinic; police station/cyber cell/other unit; university department/research centre/independent researcher/student group). The spec listed "type" among the shared fields; on a typed page the partner type itself is already fixed by the page, so the visible select asks what kind of entity they are. Police "unit or station" stays a free-text name (the spec's added field) next to the district.
2. **Partner-kind fields stored as option keys** (like `VOLUNTEER_ROLES`), with the admin detail view mapping keys to their human labels via a `labelledOptions` helper — the existing WP56 kinds show raw values; the new kinds show labels.
3. **New partner submissions start hidden and the visibility toggle is a separate audit event** (`ORG_PARTNER_VISIBILITY_CHANGED`), so the "who put this on the public site" trail exists even when the partner's fields never change. No delete action: the spec lists create, edit, reorder and toggle only; a partner can always be hidden. Reorder posts the full new order (up/down buttons compute it client-side), one idempotent request, one audit event.
4. **`ESCALATION_HOURS` is now exported** from `escalation-engine.ts` (value unchanged) so the trusted-flagger page reads the follow-up window from the same constant the engine uses; the deadline test covers both numbers.
5. **Trusted-flagger page is English-only**, following the committed /for-platforms exception ("written for platform Trust & Safety and grievance teams, English only", hi-review-status); it also reuses the pf-* visual family of its parent page rather than the parchment hub style, so the two platform-facing pages read as one set.
6. **Supporters strip fallback preserved exactly:** the static Cloudflare/Sarvam list (real organizations with permissioned logos, pre-existing content) still renders whenever no public `OrgPartner` rows exist; only the presence of public partners switches the strip over.
7. **The `(admin)/partners` rename:** the public `/partners` URL is the spec's hub; the platform-partners admin keeps its `/admin/partners` URL and nav label via the existing shim pattern (as `/admin/queue` → `(admin)/flagged` does). Without the rename the dev server refuses to compile ("two parallel pages that resolve to the same path") — and before this WP, `/partners` was in fact serving that admin login page, so the WP56 nav link "Partner with us" led to a login screen.
8. **WP56 gap fixed: missing `/admin/org/*` shims.** WP56 placed the org admin pages in the `(admin)` route group but never added the `/admin/org/...` shim pages, so all five nav links 404'd. Added shims for the index, posts, submissions, jobs, events, newsletter and the new partners page; the admin org index also links the new page. (WP56's org tables also carry no RLS policies — every other table has them; noted here for the owner rather than changed, since editing an applied migration is not safe from this lane.)
9. **`PARTNER_FORM_TYPE_SLUGS` lives in `src/lib/org-forms.ts`,** not in the client form component: values imported from a `"use client"` module into server code arrive as opaque client references, which broke the `[type]` page's slug check in the dev server.
10. **Hindi translations** for the 186 new keys are machine translations by me, under the existing `org.*` review entry.
11. **Design audit findings:** the impeccable detector binary could not run on this machine (engine download blocked; the runtime vision backend is not multimodal), so the audit ran as equivalent programmatic checks (360px overflow, shadows, stripes, heading levels, primary-button count, focus visibility) — all clean on the six new pages. The two findings the checks initially raised were verified as false positives from shared chrome: the header's "File a complaint" and the footer's "Sign up" primaries, and the `.btn-arrow`'s border-drawn arrow (the committed button style), not card stripes.

---

## WP58 — Advocacy and research (section 5)

Branch: `feat/org-pages`. Built 21 November 2026. Builds on WP56's content system and admin patterns.

### What was built

- **/policy (58.1):** hero "What we push for" with the owner's priority asks left as `<TO_FILL>`; four clearly-marked placeholder priority cards; the `POLICY` post list (papers and submissions, each with its attachment link right on the card) and the `CAMPAIGN` list (each with its call-to-action button), both with honest empty states; closing band to /press. In en and hi.
- **/policy/[slug]:** renders `POLICY` and `CAMPAIGN` posts through the shared `PostDetail` (the /news/[slug] layout) with the policy section's own back link, canonical and OpenGraph metadata. Other kinds 404 here. `orgPostHref` (org-posts.ts) gives every post one URL — policy and campaign posts under /policy, everything else under /news — so cards, lists and detail pages agree; /news/[slug] still renders them for already-shared links and canonicalises to /policy/[slug].
- **/research rebuild (58.2):** hero and approach kept (wording moved from "we aim / we will" to the present tense, since the organization exists and the sections below now list real content); real lists of Publications (`RESEARCH` posts) and Lab notes (`LAB_NOTE` posts); the "first reports are in progress" empty state kept only while both lists are empty; an "Open tools and data" section (repository URL is a `<TO_FILL>`; scorecard CSV linked); the AI Lab link left as a TODO + test-free stub because `ENABLE_LAB` and /lab do not exist yet, per the spec.
- **Platform scorecard (58.3):**
  - `src/lib/scorecard.ts` — pure aggregation: per platform, per calendar quarter of dispatch — notices sent (original notices + hash advisory dispatches), share actioned (link recorded removed: by the platform's confirmation or a recorded check), median hours to first response, median hours to removal, share actioned within `PLATFORM_DEADLINE_HOURS`, follow-ups needed (follow-up notices per original). Small-number rule: fewer than `SCORECARD_MIN_NOTICES` (10) notices in a period and every number is dropped at computation time — the snapshot stores only the platform name and the fact. Plus the CSV builder and period helpers.
  - `src/lib/scorecard-snapshots.ts` — the `ScorecardSnapshot` store (memory fallback like every org module): collects complaint rows with findMany only (Notice + its SubmittedUrl platform/status, HashDispatch, Platform), computes a DRAFT, saves the methodology note, publishes. Prisma migration `20261122060000_scorecard_snapshots` (RLS + `asmita_app` policy, like org_partners); new `ORG_SCORECARD_COMPUTED` / `ORG_SCORECARD_NOTE_SAVED` / `ORG_SCORECARD_PUBLISHED` audit events; Kysely types regenerated on install (not committed).
  - The maintenance cron drafts the quarter that just ended, once, and never overwrites; a failure there no longer fails the sweep. Admin can compute/refresh on demand (`POST /api/admin/org/scorecard`), default the latest completed quarter, explicit past periods accepted, future periods and recomputing a published period refused.
  - **/admin/org/scorecard** (content:manage): snapshot list, "Compute latest quarter", the review table, the methodology note (drafts only), publish with a confirm. Audit-logged, CSRF + rate limits like every admin org route. Nav, org index and the nav-permissions test updated.
  - **/research/platform-scorecard:** latest published snapshot as an accessible, sortable table (`ScorecardTable`, aria-sort, stacks on phones via the house `.data-table` pattern); period selector; CSV download; five-part methodology; the admin's methodology note; honest empty state ("Our first scorecard will be published after `<TO_FILL: period>`.") before the first publish. **/research/platform-scorecard.csv** serves the published data as CSV (404 before the first publish).
  - **Read-only, provably:** the complaint-workflow path only ever calls `findMany`; a unit test drives it through a Proxy client that throws on any other property, and asserts the only write anywhere is the `ScorecardSnapshot` upsert. No case, notice or URL id exists anywhere in the aggregate — asserted on the serialized output.
  - **Gating:** the header nav link, the /research section link and the /sitemap entry appear only once a snapshot is published (AppShell awaits one `hasPublishedScorecard()` check per render and passes it into `navGroups`); until then the route shows the empty state and nothing links to it.
- **/press (58.4):** press releases (`PRESS` posts), "Meri Asmita in the news" (PRESS posts with an external `ctaUrl`, linking out with `rel="noopener noreferrer"`), media contact (`<TO_FILL>`), media kit (links the three logo PNGs that exist in `public/` today, with `<TO_FILL: logo files in public/press/>` for the full kit), the About boilerplate (`<TO_FILL>`), and three rules for reporting on image-based abuse (never identify a survivor; never describe or link to the content; survivor-centred language) framed as general good practice, not legal advice. In en and hi. Added to `/sitemap` and the XML sitemap (which is driven by site-map.ts).
- **i18n:** 91 new keys in `en.json` and `hi.json` (full parity, verified programmatically), machine translations flagged in `hi-review-status.json` under the existing `org.*` entry (its note now names WP58). Admin pages English-only.
- **Tests:** vitest `org-scorecard.test.ts` (aggregation fixtures: medians, deadline, quarter filtering, follow-ups; the small-number rule at and around the threshold; CSV output incl. comma-quoting and the insufficient sentence; the snapshot store: compute/refresh/note/publish, drafts never public, cron ensure-once; the admin APIs: permission, CSRF, validation, `period_in_future`, `period_published`; the /research lists with and without posts; `orgPostHref`; the page/constant agreement test) and `org-scorecard-readonly.test.ts` (the read-only proxy client; no ids in the aggregate). Playwright `org-advocacy.spec.ts`: /policy and /research in en and hi, the empty state with no published snapshot, an admin publishing a seeded draft snapshot (direct SQL seed of a DRAFT like the cron leaves, publish through the real API) with the table, CSV link and CSV content appearing, and the under-threshold platform showing "Not enough notices to report".

### Not verified on this machine

- **Playwright** (`tests/e2e/org-advocacy.spec.ts` and the rest of the e2e suite): the full run needs the throwaway Postgres + `global-setup` and happens in the separate verify step on another machine. The visitor pages were exercised here against the running dev server (all five routes render in en and hi, the CSV 404s before publish, nav gating live-checked: no "Platform scorecard" link or sitemap entry exists while nothing is published). The admin flow is covered by the unit tests through the same route handlers, but the spec itself was not executed here.
- **Worker smoke** (`scripts/worker-smoke.mjs`) and the production/vinext builds: not run here (this machine runs lint, type-check and vitest).
- **Database path against a live Postgres:** the aggregation's DB reader is exercised through the mocked-client unit test (the memory path through the API tests); the migration SQL is validated by `prisma validate` and follows the committed house pattern, but was not applied to a real database here.
- **Visual review:** the runtime vision backend on this machine is not multimodal, so screenshots could not be inspected by eye. The impeccable `detect` scan ran over all six new/changed surfaces (0 errors; advisory font-size notes that also fire on the committed WP56/57 pages — verified as the committed house pattern and preserved, except the /policy priority cards, which were bumped to the documented 20px/600 card title). The remaining audit items were checked programmatically over the rendered pages: no horizontal overflow risk (the scorecard table drops its min-width and stacks under 640px like every `.data-table`), no heading-level skips, no left-border stripes, no card shadows, and exactly one primary button per screen — which fixed a pre-existing double-primary on /research (the empty-state CTA is now secondary).

### `<TO_FILL>` placeholders for the owner

| Page / file | Placeholder | What the owner needs to supply |
|---|---|---|
| /policy (hero — key `org.policy.sub`) | `<TO_FILL: the owner's priority asks>` | The two or three asks the advocacy work actually pursues. |
| /policy ("Our priorities") | `<TO_FILL: priority 1-4 — what we ask for>` + body each | The real priority cards (up to five; four slots exist). Remove the ones not needed. |
| /research/platform-scorecard (empty state) | `<TO_FILL: period>` | When the first scorecard is expected (e.g. "the first quarter of 2027"). |
| /research ("Open tools and data" — key `org.research.toolsBody`) | `<TO_FILL: public repository URL>` | The public repository URL; its `tools/` directory is linked from there. |
| /press ("Media contact") | `<TO_FILL: media contact>` | The press inbox (and name/phone if wanted). |
| /press ("Media kit") | `<TO_FILL: logo files in public/press/>` | The full kit; until then the page links the three logo PNGs already in `public/`. |
| /press ("About Meri Asmita") | `<TO_FILL: boilerplate paragraph>` | The standard boilerplate journalists copy-paste. |

### User-facing sentences the owner should approve

- "We take what we learn from supporting survivors to the people who write the rules." (/policy hero).
- "Every quarter we publish what our takedown notices achieved: how often content came down, how fast platforms answered, and how often we had to follow up." (scorecard hero).
- The five methodology items, especially: "A notice counts as actioned when the reported link was recorded removed — by the platform's own confirmation, or by a recorded check that the content is gone." and "Small counts can point to individual cases, so we do not publish them."
- "The scorecard only reads this data; publishing it changes nothing in the complaint process." (the read-only promise, on the public page).
- The /research hero's new present tense ("We study image-based abuse in India and share supported findings openly…") — reworded from the old aspirational copy because the page now lists real content.
- The three journalist rules and their framing ("General good practice for covering this subject. It is not legal advice.").
- The admin microcopy: "a published snapshot is the record and is never recomputed", and the publish confirmation ("Publish the 2026-Q1 scorecard? Public numbers go out as they stand.").
- "Our first scorecard will be published after <TO_FILL: period>." (honest empty state).

### Decisions made on my own

1. **Two modules, one of them provably pure:** `scorecard.ts` (aggregation, CSV, period math — imports nothing but the deadline constant) and `scorecard-snapshots.ts` (the store and the complaint-data reader). The read-only guarantee is a Proxy-mocked client that fails on any non-`findMany` access; the one permitted write is the `ScorecardSnapshot` upsert itself.
2. **The small-number rule drops numbers at computation time**, not at display time: an insufficient row stores only the platform name and `insufficient: true`, so a small platform's counts never exist in a snapshot, the CSV or any admin view. The threshold is the `SCORECARD_MIN_NOTICES` constant (10) and a page-text test fails if the page and the constant disagree (the WP57 trusted-flagger pattern).
3. **Only metrics the data supports** (per the spec's instruction to drop the rest): hash advisories have no outcome record, so they count towards notices sent but never towards the actioned share or the medians; a removal the survivor recorded herself has no removal time, so it counts as actioned but not towards the median; a platform whose notices were all advisories gets null shares. Median hours round to 0.1 h.
4. **"Actioned" is defined as recorded-removed:** `SubmittedUrl.status = REMOVED` or `Notice.removedAt` or a `REMOVED` platform answer. The 2-hour deadline comes from `PLATFORM_DEADLINE_HOURS`, never hard-coded, and the page quotes it from the constant.
5. **Follow-ups needed = follow-up Notice rows (`followUpOf`) counted against their original notice**, attributed to the original's quarter. Representative notices (crawler links) are ordinary notices here — they are notices Meri Asmita sends — and they never have follow-ups by design.
6. **Snapshot lifecycle:** one row per period (unique). An admin's compute refreshes a DRAFT but refuses once published (409 `period_published`) — published public numbers never silently change; the note is frozen with the record. The cron's `ensureLatestScorecardSnapshot` creates the completed quarter's draft only if missing, never recomputes (an admin may have annotated a draft), and its failure is caught so the maintenance sweep still succeeds.
7. **The default period for compute is the latest completed quarter** — a scorecard for the quarter in progress would change under it daily. On-demand compute accepts any past period.
8. **Memory fallback is honest about what dev records:** in no-database dev the store keeps URLs but no dispatches (links never leave `NOTICE_QUEUED`, and no `Notice`/`HashDispatch` rows exist), so the reader returns no rows and every scorecard surface shows its empty state. Nothing is invented to fill the gap.
9. **One URL per post:** `orgPostHref` lives in `org-posts.ts` (not the client component, so server pages import it safely) and every card, list and detail page uses it; POLICY/CAMPAIGN posts canonicalise to `/policy/[slug]` while `/news/[slug]` keeps rendering them for previously shared links.
10. **Nav gating via one existence check per render:** `AppShell` awaits `hasPublishedScorecard()` and passes a `scorecard` flag into `navGroups`; the /research section link and the human /sitemap entry use the same check. The static XML sitemap deliberately does not list the scorecard URL at all — making `sitemap.ts` async would couple the production build to a database query; the page is discoverable through nav, /research and /sitemap once published.
11. **The AI Lab section is a TODO + test-free stub**, exactly as the spec allows: `ENABLE_LAB` and /lab do not exist in this codebase yet, so nothing renders and no flag helper was invented.
12. **The e2e seeds a DRAFT directly in SQL** (like the cron leaves) and publishes through the real admin API, so the "admin publishes a seeded draft snapshot" journey exercises the real publish path without needing real complaint data in the throwaway database.
13. **Hindi translations** for the 91 new keys are machine translations by me, under the existing `org.*` review entry (which now names WP58).
14. **Design audit:** `impeccable detect` ran on all six surfaces — 0 errors, advisory font-size notes that fire identically on committed WP56/57 pages (verified house pattern, kept; /policy priority cards raised to the documented 20px/600 card title). Programmatic checks over the rendered pages: no heading skips, no stripes/shadows, one primary button per screen (fixing a pre-existing double-primary on /research), and the scorecard table stacks on phones instead of forcing a 900px width.

---

## WP77 — full-verify fixes for the organization pages (branch feat/org-pages)

Built 20–21 November 2026. WP77 is a repair package defined outside docs/org/spec.md (like the web-audit ones): the organization pages (WP56–57 in the first round; WP58 landed on the branch mid-verify and was integrated in the second round below) failed the full verify on the verify machine — `DONE E2E_RC=1 SMOKE_RC=1` — with no Playwright test ever running. Each cause below was reproduced on this machine, found in the code or the new specs, and fixed there. No existing assertion was weakened, skipped or deleted; the core specs' files are untouched.

### What was failing, and the fix

1. **The e2e web server never came up — the reported E2E_RC=1 SMOKE_RC=1 was one cause wide.** The Playwright webServer starts before global-setup provisions the throwaway database and polls `/` meanwhile; WP57's Supporters strip made that render query `OrgPartner`, the polls failed with P1000 (no role, no tables yet), and every poll 500'd until the 120 s timeout aborted the run before global-setup ran at all — so the database stayed empty and the worker smoke's webhook writes failed too (collateral, not a second bug). Fix: `SupporterLogos` falls back to the static Cloudflare/Sarvam strip when the partner query fails — a decorative credit line must not take public pages down with an unreachable database (`src/components/layout/Supporters.tsx`).
2. **The language toggle stamped its page's own locale over the cookie on every load.** LanguageToggle wrote `asmita_lang` from an effect keyed on the locale; React StrictMode runs effects twice in dev, defeating the old `mounted` guard, so every page load re-wrote the cookie with the server's locale while the next navigation was already under way. Reproduced with a plain Playwright script: under a Hindi cookie the four `/partners/[type]` pages alternated Hindi/English (the previous page's late hydration overwrote the cookie between requests). Fix: the cookie is written from an effect keyed on a `choice` state that stays null until a click — never on mount; the `<html lang>` sync keeps its own effect (`src/components/layout/LanguageToggle.tsx`).
3. **The volunteer form's hours select had no label.** "Time you can give" existed in i18n but was never rendered — the spec's `getByLabel("Time you can give")` timed out, and an unlabeled select fails WCAG 1.3.1 the same way. Fix: the select is wrapped in the form's Field label (`src/components/org/VolunteerForm.tsx`).
4. **The footer newsletter field carried the same accessible name as the registration form's email field, on every page.** WP56's footer inline sign-up labelled its input "Email address"; the survivor registration form uses the same label, so `registerAdult` in filing, hash-flow, notice-integrity, quick-exit, smoke, escalation-ladder, unknown-platform, video-hash-flow, reporting-journey-polish, database-hardening and crawler-journey — 26 tests — died on strict-mode violations. A screen reader hears two identically-named fields too. Fix: the footer variant labels its input "Email for the newsletter" (new key `org.newsletter.footerEmailLabel`, en+hi, under the existing `org.*` machine-translation entry) — wording that does not contain "email address", because Playwright's getByLabel matches by substring (`src/components/org/NewsletterInlineForm.tsx`).
5. **The footer newsletter form broke the minor path's collects-nothing guarantee.** smoke.spec asserts `/minor-support` renders no email input at all; the footer form put one there. Fix: AppShell/Footer take `withoutNewsletter` and the minor-support page sets it (also covering `/start/minor`, which re-exports the page) — the minor path collects nothing, not even a newsletter email (`src/components/layout/AppShell.tsx`, `Footer.tsx`, `src/app/minor-support/page.tsx`).
6. **The five WP56 org tables had no row-level security** — the gap WP57's notes had flagged. database-hardening.spec enforces the rule every other table follows (deny by default, only `asmita_app` gets rows). Fix: additive migration `20261122060000_org_tables_rls` enabling RLS with the `asmita_app_all` policy on OrgPost, OrgSubmission, OrgJob, OrgEvent and NewsletterSubscriber, exactly the OrgPartner pattern — a new migration, never an edit of WP56's applied one.
7. **Two defects in the new specs themselves:** ambiguous locators (org-outreach's volunteer email now `{ exact: true }`, as org-partners already did; the `/newsletter` signup scoped to `<main>`, because the footer carries the same form) and a missing teardown (org-partners left its partner public, which would have flipped the Supporters strip for smoke.spec and chat.spec — both assert the Cloudflare and Sarvam marks on `/` later in the same run; the spec now toggles the partner back after asserting).

### What was verified on this machine (Node 22 in containers, throwaway Postgres 17)

- The two org specs via e2e-some.sh: 9/9.
- The full chromium Playwright suite via e2e-some.sh: 71 tests — 67 passed, 4 skipped (mobile-project skips), 0 failed; two consecutive green runs after the last fix. The runs before them isolated the causes above (26 tests on the email-name collision, then the RLS/minor-page trio).
- Worker smoke through the Node 22 helper: `npm run build:vinext` + `node scripts/prepare-production-wrangler.mjs` + `SMOKE_CRAWLER=1 node scripts/worker-smoke.mjs` against a local Postgres 17 with all migrations and the seed — passed ("Prisma runs in workerd, each request gets its own connection, the provenance check is off, and voice headers, session limits and the chat route work.").
- Full checks (`check.sh`, both packages): ALL CHECKS PASSED.

### Not done or not verified

- One transient ECONNRESET (org-outreach's job test, `GET /api/csrf` under the loaded dev server) appeared in exactly one run and in no other — the same test passed in four runs including both green full runs. Nothing was logged server-side; the APIRequestContext helper has no retry. Not changed.
- One full run was killed mid-flight by another lane's e2e-some.sh on this host: the harness's throwaway `pg-some` container name and port are shared between lanes, and its start/remove happen outside the harness lock. Host-infrastructure collision, not a code failure; re-run.
- The unit-test paths still exercise the memory stores; the Prisma paths are covered by the e2e database and the worker smoke.

### `<TO_FILL>` placeholders for the owner

None new (WP56/57's list is unchanged).

### User-facing sentences the owner should approve

- "Email for the newsletter" — the footer sign-up's screen-reader label (hi: "न्यूज़लेटर के लिए ईमेल"), replacing the generic "Email address" that made two fields on one page answer to the same name.
- The absence of the newsletter sign-up on /minor-support (and /start/minor): the page deliberately collects nothing.

### Decisions made on my own

1. **Fixed pages, not locators, wherever the page was wrong** (unlabeled select, footer field name, minor-page email input, toggle cookie write, missing RLS): those are accessibility or security bugs for real users, not test inconveniences — and they keep the shared suite identical for every other lane that runs it.
2. **Renamed the footer field's label rather than the registration label:** the registration label is long-standing content asserted across the suite; the footer form is the newcomer that created the collision. The label also had to avoid the words "email address" entirely, since getByLabel matches by substring.
3. **The cookie write lives in an effect keyed on an explicit choice state** rather than in the click handler: the react-compiler lint rule forbids mutating outer values (document.cookie) in handlers, and an effect keyed on the locale alone reintroduces the mount-time write under StrictMode.
4. **org-partners' teardown uses the existing visibility API** (no partner delete exists, by WP57's design); the test still asserts the full public-partner journey before undoing it.
5. **The worker smoke ran against a Postgres 17 installed inside the same Node 22 container** (PGDG repo; n22 has no host network and the migrations require 17 for MAINTAIN). The e2e suites ran through e2e-some.sh unchanged.

### Second round — WP58 lands on the branch mid-verify (21 November 2026)

verify-org1 cloned the branch before WP58 landed: night-org.sh's wait condition greps the branch's progress.md on origin for the string "WP58", which the WP56/57 notes already mentioned, so it did not wait for WP58 itself. The verify's head.txt still names 8ffc90e (the WP57 tip); WP58 was still being built on win-desktop and reached `origin/feat/org-pages` around 22:25 UTC. The push was rejected and the driver opened a second round. The two WP77 commits were rebased onto WP58: one content conflict, in this file's own WP58/WP77 sections, plus clean auto-merges in AppShell.tsx and the two i18n dictionaries. The integrated tree was then re-verified from scratch.

What the second round found and fixed:

8. **WP58's AppShell check had the same class of bug as the Supporters strip (fix 1 above).** WP58 gates the scorecard nav link behind `hasPublishedScorecard()`, run in AppShell on every public page render — and with `DATABASE_URL` set it went straight to Prisma with no failure path. The Playwright webServer polls `/` before global-setup provisions the e2e database, so every poll would have 500'd until the 120 s timeout killed the run before any test, exactly the WP57 failure again one WP later — and an unprovisioned database would have failed the worker smoke the same way. Fix: `hasPublishedScorecard` is now a total check (`src/lib/scorecard-snapshots.ts`) — an unreachable or not-yet-provisioned database answers "not published", the nav link and the sitemap entry stay hidden, exactly like before the first publish, the same rule as `SupporterLogos`' fallback. `latestPublishedScorecard` keeps strict behaviour: it backs the scorecard page's own content, like every other DB-backed content page.
9. **WP58's `ScorecardSnapshot` migration already carried the house RLS policy** (`20261122060000_scorecard_snapshots` ends with the same ENABLE/POLICY pair as every other table) — verified against database-hardening.spec's every-table sweep; no change needed.

What the second round verified on this machine (Node 22 in containers, throwaway Postgres 17)

- Unit checks on the integrated tree: lint 0 errors, type-check clean, `prisma validate` ok, 174 test files / 1596 tests (WP58's `org-scorecard.test.ts` and `org-scorecard-readonly.test.ts` included) — all passed.
- The three org specs via e2e-some.sh (`org-advocacy.spec.ts` had never been run anywhere — WP58's machine has no Playwright): all 14 pass, including inside the full-suite run below.
- The full chromium Playwright suite via e2e-some.sh: 76 tests — 72 passed, 4 skipped (mobile-project skips), 0 failed.
- Worker smoke through the Node 22 helper (`npm run build:vinext` + `node scripts/prepare-production-wrangler.mjs` + `SMOKE_CRAWLER=1 node scripts/worker-smoke.mjs`) against a Postgres 17 inside the same container, all 49 migrations and the seed — passed.
- Full checks (`check.sh`, both packages): ALL CHECKS PASSED.

Not done or not verified (second round)

- One transient in the first second-round org run: the /policy test's `getByRole("heading", { name: "Our priorities" })` poll stalled until the test timeout while the heading sat visible in the accessibility tree — the cold dev server was compiling WP58's routes for the first time under 14 parallel workers on a slow container filesystem ("Slow filesystem detected" in the server log). It passed in an isolated rerun (5/5) and inside the full-suite run; no code changed, same family as the first round's ECONNRESET.

Decisions made on my own (second round)

1. **Rebased the two WP77 commits onto WP58** rather than merging — the lane stays linear like every other lane, and both commits were unpushed, so nothing outside this branch was rewritten.
2. **Updated the existing WP77 entry in crawler/docs/v2-progress.md in place** — the work package both forbids appending to that file and requires the WP77 entry to reflect the completed state.
3. **org-advocacy.spec keeps its published snapshot at the end of its file** (no teardown): the file's last test depends on the publish, and no other spec in the suite asserts the nav or sitemap state a published snapshot changes (searched; also confirmed by the full-suite run on the shared throwaway database).
4. **The static XML sitemap keeps its WP58 shape** (no scorecard URL): that decision is WP58's own (see its item 10 above) and re-verified — nothing in the verify exercises it.

## 2026-11-21: public pages removed

Owner decision: /press, /research (including /research/platform-scorecard and its CSV), /policy (including /policy/[slug]) and the /newsletter landing page were taken out because they were mostly empty or repeated other pages. The newsletter sign-up lives in the footer; /newsletter/confirm and /newsletter/unsubscribe stay because the confirmation emails link to them. Footer, header nav, sitemap, get-involved cards and tests were updated. Every post kind now lives under /news/[slug]. The admin screens (posts, scorecard, newsletter) and the scorecard library are unchanged; restore the public pages from git history when they are needed again.
