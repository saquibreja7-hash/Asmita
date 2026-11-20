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
| /get-involved ("Other ways to help") | `<TO_FILL: social links>` | The organization's social media URLs/handles, as links. |
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
