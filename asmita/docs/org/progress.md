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
