# Meri Asmita AI Lab: progress

One section per work package, appended as each WP lands. Each entry records what was built, what was not verified on the machine that wrote it, the user-facing sentences for the owner to approve, and the decisions the implementer made alone.

---

## WP51 — Lab foundation plus experiment E2 (branch feat/ai-lab, 20 November 2026)

### What was built

- Charter committed as `docs/lab/charter.md`, verbatim.
- Foundation:
  - `ENABLE_LAB` read in one helper (`src/lib/lab/flags.ts`), on in dev and test, explicit value wins both ways, off in `wrangler.jsonc` (staging and production vars) until the owner turns it on.
  - `lab:manage` permission: SUPER_ADMIN only (`src/lib/auth/admin-permissions.ts`), wired into `page-permission.tsx` and the admin nav ("Lab · AI Lab").
  - ESLint boundary both ways (`eslint.config.mjs`): lab paths (`src/lib/lab/**`, `src/app/**/lab/**`, `tools/lab-*/**`) cannot import complaint-workflow modules (`case-*`, `notice-*`, `hash-*`, `escalation-*`, `case-ops`, `store`); everything outside the lab (tests and scripts excluded) cannot import lab code.
  - The no-URL-fetch lint rule narrowed: complaint files keep every fetch selector exactly as before; lab paths keep only the Zod body checks. Proven by `tests/unit/eslint-lab-boundary.test.ts` (a lab path may fetch a URL-named variable, a complaint path still may not). `tests/integration/no-url-fetch.test.ts` is untouched and still covers complaint code.
  - Prisma: enums, `LabService`/`LabChokepoint`/`LabReport` models, nine `LAB_*` audit event types, migration `20261120000000_lab_e2_tables` (additive, RLS + asmita_app policy like every table).
- E2 in full:
  - Admin pages under `/admin/lab` (English): dashboard, services (`/admin/lab/services`), chokepoints, reports — each with add and edit, all through `/api/lab/*` routes.
  - Per-kind report templates (`src/lib/lab/report-templates.ts`), English, invented placeholders (`{{SERVICE_NAME}}` etc.), unverified facts marked `<TO_BE_VERIFIED_BY_HUMAN>`.
  - Review-then-send: draft from the template filled with service data, editable until sent; email goes through the existing Resend sender under a new lab sender address (`LAB_EMAIL_FROM`, idempotent per report), or the analyst copies the text for a web form and records the submission; outcome (actioned / refused / no reply) recorded afterwards. A sent report never changes.
  - DNS+RDAP lookup helper (`src/lib/lab/lab-lookup.ts`): host from the URL, name servers from DNS, registrar from an operator-configured RDAP base (`LAB_RDAP_BASE_URL`), time-boxed (5 s) and size-capped (64 KB), never throws.
  - Daily liveness check (`GET /api/lab/cron/liveness`, CRON_SECRET, cron `45 2 * * *` in `cronRoutes` and wrangler.jsonc): one HEAD request per tracked URL (8 s timeout, response body never read, private/loopback hosts never fetched, run capped at 200 services / 1,000 URLs), marking each URL and service up or down, with `downSince` tracking. It lives under `/api/lab/cron/liveness`, not `/api/cron/`, because it is lab code and the import boundary would otherwise block its lab imports; `cronRoutes` maps any path.
  - Dashboard: services by status, reports outstanding, median days from first report to down per provider kind, and the E2 metric (share of services down within 30 days of the first report).
  - Public `/lab` page (en + hi, every string in `src/i18n/en.json` and `hi.json`; new Hindi keys listed as machine-translated in `hi-review-status.json`), linked from the footer only; aggregate numbers (tracked, taken down, median days) render only while `ENABLE_LAB` is on, and the page never names or links a service.
- All `/api/lab/*` routes: admin auth with `lab:manage`, CSRF on mutations, Zod validation, shared rate limiter; every mutation audited with its own `LAB_*` event name, audit data carrying ids and counts only.
- Tests added: `lab-flags`, `lab-lookup` (mocked fetch), `lab-liveness` (mocked fetch, secret required, private-host and cap cases), `lab-report-templates`, `lab-services` (memory CRUD, audit, dashboard and public aggregates), `lab-api-routes` (auth, CSRF, validation, flag off, send/outcome flow, audit data policy), `eslint-lab-boundary`; `admin-permissions` and `admin-nav-permissions` extended. Playwright: `tests/e2e/lab.spec.ts`, with `ENABLE_LAB=true` added to the e2e webServer env.

### Not verified on this machine

- No Postgres or Docker here, so the Prisma and Kysely paths of every lab module, the migration SQL itself, and `prisma migrate deploy` were never executed; only the memory path runs in vitest. The migration is hand-written to Prisma's conventions and `prisma validate` and `prisma generate` pass; the e2e global-setup (`prisma migrate deploy` into a throwaway database) is the place it first runs.
- The full Playwright suite does not run on this machine (that is the separate verify step); `tests/e2e/lab.spec.ts` has never been executed and follows the conventions of crawler-journey.spec.ts.
- The ESLint boundary was verified by linting throwaway text at lab and complaint paths (tests/unit/eslint-lab-boundary.test.ts), not by linting a future `tools/lab-*` directory (none exists yet; asmita's eslint only covers asmita/, so the tools globs take effect when those tools land).
- No real DNS or RDAP call was ever made: RDAP needs `LAB_RDAP_BASE_URL`, which is unset by default.

### For the owner to approve (user-facing sentences)

English:
- "Asmita now runs a research Lab. Its public page (AI Lab, in the site footer) explains its experiments and, once switched on, shows only aggregate numbers — never a service's name or address."
- "Lab analysts track services that make 'undress' or face-swap images, record the companies those services depend on, and send each one an abuse report drafted from a per-kind template, reviewed by the analyst before it goes out."
- "Every tracked address is checked once a day and marked up or down; the console dashboard shows how many services went down within 30 days of the first report, and the median days from first report to down per provider kind."
- "Nothing about the Lab is live in production until you set ENABLE_LAB to true in wrangler.jsonc; until then the console is read-only and the public page shows no numbers."

Hindi (machine-translated, pending native review, listed in hi-review-status.json):
- "अस्मिता अब एक शोध लैब चलाती है। इसका सार्वजनिक पृष्ठ (AI लैब, साइट के फ़ुटर में) अपने प्रयोगों के बारे में बताता है और, चालू होने पर, केवल समग्र आँकड़े दिखाता है — किसी सेवा का नाम या पता कभी नहीं।"

### Decisions made on my own

- Admin lab pages live directly under `src/app/admin/lab/` (not the `(admin)` group with a re-export twin): a `(admin)/lab` page would collide with the public `/lab` route. The nav-permission test was pointed at the real file accordingly.
- `LabServiceKind` uses `CHAT_BOT` where the charter says "Telegram or chat bot": the repo is public and must not name a real service.
- RDAP's base URL is operator configuration (`LAB_RDAP_BASE_URL`), not a constant in code: the repo must hold no real service URL. Unset, the lookup still suggests host and name servers; the registrar appears once the owner configures an endpoint.
- The Lab's audit event types are dedicated enum values (`LAB_*`); their data carries ids, counts and field names only — never a service name, URL or report text (tested).
- `downSince` was added to `LabService` (beyond the charter's field list): it is what makes "median days from first report to down" and the 30-day metric computable; the charter named the metrics, not the column.
- The liveness check sends HEAD only, follows redirects, never reads a body, and treats any answer below 500 as up (bot-check 403 pages are still a live host); a 5xx, timeout or unreachable host is down. Private, loopback and link-local addresses are never fetched.
- Services have no delete: rows are the map's history (a service that returns is still the same service). Reports likewise never delete; a sent report is immutable.
- The public `/lab` page renders its explanation always and its numbers only while the Lab is on, so the footer link is never a dead end while the switch is off.
- The liveness cron answers `{ skipped: "lab_disabled" }` (200) while off, so a scheduled run on a switched-off Lab does not page anyone.
