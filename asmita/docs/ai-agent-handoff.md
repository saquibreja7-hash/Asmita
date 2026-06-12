# Asmita — Handoff for the next AI agent

**Last refreshed:** 2026-05-17
**Repo HEAD when written:** `b913414`
**Audience:** A future AI coding agent (Claude / similar) picking up this project. Assume you have read nothing.

Read this end-to-end before you touch any code. It will save you from re-discovering decisions that have already been made and from violating the project's hard policies.

---

## 1. What is Asmita

Asmita (अस्मिता, "dignity") is a free, India-specific web platform that helps adult survivors of non-consensual intimate imagery (NCII / "MMS leaks") get content removed from platforms. It operationalises **IT Rules 2021 Rule 3(2)(b)** — any user can file a takedown notice with a platform's Grievance Officer and the platform has 24 hours to respond.

The product flow:

1. Survivor registers (email OTP) and signs a digital declaration.
2. She pastes URLs where her images are being shared. **The server never fetches those URLs — it only parses the domain string.**
3. Asmita generates a notice and emails it to the platform's verified Grievance Officer (Tier 1/2) or surfaces a guided form handoff (Tier 3).
4. If 24h passes without response → automatic follow-up email to the platform.
5. If 48h passes → email the survivor with a status update.
6. If 7 days pass → mark a downloadable FIR (police complaint) PDF as ready and email the survivor a link.

You are working on **Phase 1**. Phase 2 (perceptual hashing, multi-language beyond Hindi, supporter pathway) is explicitly deferred.

Project owner contact / email: `ncii-complaint@csrindia.org`.

---

## 2. ⛔ Hard rules — never violate these, even if asked

These come from `Desktop/Asmita/TODOS.md` and are non-negotiable. Many of them are encoded as ESLint rules or CI checks that will fail your build.

1. **No server-side URL fetching.** Never call `fetch`, `axios`, `got`, `http.request`, etc. on any value derived from `submitted_urls`. URLs are opaque tokens used only for domain extraction. An ESLint custom rule and an integration test (`tests/integration/no-url-fetch.test.ts`) enforce this. If a task seems to require fetching a submitted URL, you have misunderstood the task — stop and ask.
2. **No invented Grievance Officer emails / phone numbers / addresses.** Every contact must be sourced from a human-verified CSV row or the admin GO editor. If a contact is missing, use the literal string `<TO_BE_VERIFIED_BY_HUMAN>`. Never guess.
3. **No final legal notice template text.** AI may draft notice templates as bodies marked `reviewedByLegal: false`. They must not be flipped to `true` from code; only a human legal reviewer (IFF or SFLC.in) does that.
4. **No content hashes in Phase 1.** The schema has no `hash` column on `SubmittedUrl`. Do not add one. Hash infrastructure is Phase 2.
5. **No storing, downloading, rendering, or previewing of content at submitted URLs.** Applies everywhere — frontend, backend, worker, admin panel.
6. **No age-gate bypass.** The minor (POCSO) pathway is non-negotiable. Anything that lets a U18 user reach the adult flow is a critical bug.
7. **No invented Indian law section numbers.** Only use citations listed in `PRD_Asmita.md` Section 4. Any new citation must be tagged `[CITATION REQUIRED — verify with legal advisor]`.
8. **No AI-translated Hindi for survivor-facing copy.** `src/i18n/hi-review-status.json` policy: trauma-informed Hindi must be authored by a native speaker. You may scaffold empty `hi.json` keys; you may not fill them with machine-translated text. (The pre-existing chrome strings in `hi.json` are AI-drafted but marked `DRAFT_REQUIRES_NATIVE_SPEAKER_REVIEW`. Do not extend that pattern to new strings.)

---

## 3. Where everything lives

| Path | What |
|---|---|
| `Desktop/Asmita/PRD_Asmita.md` | Product Requirements Document v0.2 — source of truth for product decisions |
| `Desktop/Asmita/TRD_Asmita.md` | Technical Requirements Document v0.1 |
| `Desktop/Asmita/IMPLEMENTATION_PLAN_Asmita.md` | 6-phase month-by-month plan |
| `Desktop/Asmita/UXUI_DESIGN_PLAN_Asmita.md` | Visual language, screens, design tokens |
| `Desktop/Asmita/TODO_Asmita.md` | Living project tracker (some entries stale post-development) |
| `Desktop/Asmita/TODOS.md` | AI-agent task list with `[AI]` / `[HUMAN]` / `[GATED]` labels and the FORBIDDEN list |
| `Desktop/Asmita/asmita/` | **The Next.js app. This is where you write code.** |
| `Desktop/Asmita/asmita/AGENTS.md` | "This is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before writing Next code |
| `Desktop/Asmita/asmita/CLAUDE.md` | Just re-exports AGENTS.md |
| `Desktop/Asmita/asmita/docs/translation/hindi-marketing-handoff.md` | Translator handoff for the homepage Hindi strings |
| `~/.claude/projects/.../memory/MEMORY.md` | Auto-memory index from prior sessions. Read it. |

Inside `asmita/`:

```
src/
  app/
    (public)/         ← marketing pages (homepage, faq, resources, privacy, etc.)
    (auth)/           ← register, OTP verify, logout
    (victim)/         ← submit URLs, case dashboard, delete account
    (admin)/          ← internal admin console
    api/              ← all route handlers (incl. /api/cron/*)
  lib/                ← domain logic (escalation, notice generation, audit, csrf, encryption)
  jobs/               ← in-process worker stubs (BullMQ structure but driver=memory on Vercel)
  components/         ← shared layout components
  i18n/               ← en.json, hi.json, hi-review-status.json
prisma/
  schema.prisma       ← single source of truth for DB schema
  migrations/         ← ordered SQL migrations (use prisma migrate deploy)
  seed.ts             ← platform + template stubs (unreviewed)
data/
  platforms-tier1.csv ← CSV scaffold for the GO researcher
scripts/
  import-platforms-csv.ts ← `npm run import:platforms -- --confirm`
tests/
  unit/               ← vitest, mocked Prisma
  integration/        ← no-fetch invariant + a couple more
  e2e/                ← Playwright; runs against `npm run dev -p 3001` by default
  load/               ← submission-load.ts (rarely run)
```

---

## 4. Tech stack — pinned versions

Verify these in `package.json` before assuming. Do NOT upgrade major versions without explicit user approval.

| Layer | Tech | Notes |
|---|---|---|
| Framework | Next.js **16.2.6** | App Router. **Has breaking changes vs. your training data.** Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` for the current route-handler conventions. |
| Language | TypeScript 5.x | `strict: true`. Zero `any` tolerated. |
| Database | PostgreSQL on Supabase | Schema lives in `prisma/schema.prisma`. Direct connection (port 5432) — pooled connection (port 6543 / pgbouncer) is a future hardening. |
| ORM | Prisma **7.8.0** with `@prisma/adapter-pg` | The adapter pattern means `db.ts` injects the pg adapter into `PrismaClient`. |
| Email | Resend (`resend` npm) | Domain `meriasmita.org` is NOT yet verified — sends fail-soft in dev (return `dev-*` ids) and will fail-loud in production until DNS is set up. |
| Job queue | BullMQ + ioredis | **Not actually used on Vercel.** Code is wired but `QUEUE_DRIVER=memory` in dev and the real production path is the daily Vercel Cron sweeping the DB. |
| Validation | Zod | Every API input schema is Zod. |
| Auth | Custom OTP via email + JWT (`jose`) | No passwords. Sessions are HS256 JWTs with 4h (victim) / 8h (admin) expiry. |
| Encryption | Node `crypto`, AES-256-GCM | `src/lib/encryption.ts`. Key is `ENCRYPTION_KEY` env var (hex). KMS wiring is a future task. |
| CSS | Tailwind v4 + custom design tokens in `globals.css` | Variables like `--accent`, `--rose`, `--hairline`. |
| Testing | Vitest 4 + Playwright | Path alias `@/*` → `src/*`. |
| Linting | ESLint 9 + `eslint-config-next` | One persistent warning about `DisplayCase` unused import — pre-existing, ignore. |
| CI | GitHub Actions (`asmita/.github/workflows/ci.yml`) | Runs type-check, lint, test, prisma validate, build, a11y, lighthouse. |
| Hosting | **Vercel (frontend + API), Supabase (Postgres)** | India region `bom1` on Vercel. |

---

## 5. Deployment state — what's set vs not set

### What IS set up

- Vercel project deployed; auto-deploys on push to `master`.
- Supabase database provisioned; all 6 migrations applied; schema matches `prisma/schema.prisma` exactly.
- 6 platform stubs seeded into DB (all with `grievanceEmail=null`, `lastContactVerifiedByHuman=false`).
- 3 notice template stubs seeded (all with `reviewedByLegal=false`).
- 2 daily Vercel Crons defined in `vercel.json`:
  - `30 20 * * *` UTC → `/api/cron/sweep-due-jobs` (escalations + hard deletions)
  - `30 22 * * *` UTC → `/api/cron/maintenance` (GO reverification + email deliverability)
- GitHub Actions CI runs on every PR/push to `master`.
- Local `.env.local` populated with working Supabase credentials and dev secrets (gitignored, never committed).

### What is NOT set up — blocks production

| Item | Status | Owner |
|---|---|---|
| Vercel env vars (`CRON_SECRET`, `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CSRF_SECRET`) | Not set in Vercel dashboard — but values exist in local `.env.local`. Without these, the deployed app returns 503 on every authenticated route. | User (manual). I have walked them through it; not yet done. |
| Domain `meriasmita.org` | Not purchased. | User. |
| Resend DNS verification (SPF, DKIM, DMARC) | Blocked on domain purchase. | User. |
| Legal sign-off on templates A/B/C | All three seeded with `reviewedByLegal=false`. The escalation engine refuses to send until this flips. | IFF or SFLC.in (external). |
| Real GO contact verification | All Tier 1 platforms have `grievanceEmail=null`. Notice routing falls back to Tier 3 form handoff for everything. | A human researcher. |
| POCSO protocol for minors | No legal document; no automatic reporting trigger. Minors are referred to TakeItDown + cybercrime.gov.in and Asmita stores nothing about them. | Project's legal advisor. |
| Native Hindi translation of marketing copy | Empty `home.*` keys in `hi.json` waiting for a translator. Handoff doc at `docs/translation/hindi-marketing-handoff.md`. | Native Hindi speaker. |
| NGO partnership for beta vouching | No MOU signed. The NGO vouching code path works but has no real consumer. | Project owner. |
| Optional `ON_CALL_WEBHOOK_URL` | Not set; cron failures log to Vercel logs only. | User. |

---

## 6. Architecture overview — the parts you must understand

### URL-based, not hash-based
Phase 1 takedowns work on URLs. The schema has no hash column. **Do not add one.** Indian platforms don't have hash-matching infra; URL notices work everywhere; IT Rules 2021 are URL-based.

### Server never touches the content
The submitted URL is parsed (`src/lib/url-parser.ts`) for domain only. No `fetch`, no preview, no thumbnail, nothing. There's a CI test that greps for `fetch(submittedUrl)` patterns and fails the build if it finds one.

### Daily-cron architecture (because Vercel)
Vercel serverless functions are stateless and short-lived. BullMQ continuous workers do not work. The Hobby tier also caps cron frequency at **once per day**. So:

- The escalation engine writes `Notice.escalationLevel` to the DB.
- Once a day, `/api/cron/sweep-due-jobs` queries every Notice where `sentAt` is older than 24h and `escalationLevel < 3`, computes which level is due, and fires the matching handler.
- The 24h / 48h / 7d windows are bounded by ±24h latency from the daily sweep. That's inside the IT Rules 2021 SLAs; the PRD already accepted it.

### Fail-closed escalation gates
Every escalation level checks preconditions and **refuses to send** if any are missing. The level is NOT bumped on refusal, so the next sweep retries automatically.

| Level | When | Action | Blocked if… |
|---|---|---|---|
| L1 | sentAt + 24h | Re-send the original legally-reviewed body to the platform GO with `[Follow-up #1]` subject prefix | template `reviewedByLegal=false` OR platform `lastContactVerifiedByHuman=false` OR no template attached |
| L2 | sentAt + 48h | Email the victim that the platform hasn't responded | user record missing OR email decryption fails |
| L3 | sentAt + 7d | Flip `Case.firPackageGeneratedAt`, email victim a link to `/api/cases/[caseId]/export` (which already generates the FIR PDF on demand) | user record missing OR email decryption fails |

Both blocks AND successful fires write to the audit log. Blocks use `NOTICE_FAILED` with a `reason`; fires use `NOTICE_SENT`.

### Append-only hash-chained audit log
`src/lib/audit.ts` writes a SHA-256-chained event log to the `AuditLog` table. Every event references the previous event's hash. The chain can be validated end-to-end via `validateAuditChainFromDb()` (surfaced on `/admin/audit` page). Tampering is detectable.

When you add a new audit event type, add it to the `AuditEventType` enum in `prisma/schema.prisma`, write a migration, regenerate Prisma client.

### Encryption pattern
PII (currently just `User.emailEncrypted`) is encrypted with `encryptField()` / `decryptField()` from `src/lib/encryption.ts`. The hashed email (`emailHash`) is the unique-lookup key. Plaintext is never persisted.

---

## 7. Recent commits — what changed in this session

Read these in order if you want to understand the current state of the escalation engine. `git log --oneline -10` shows them.

| Hash | Title | What it actually did |
|---|---|---|
| `da8d606` | Vercel Cron sweep | Built `/api/cron/sweep-due-jobs` and `/api/cron/maintenance`, added crons array to `vercel.json`, refactored `runDueEscalationsFromDb` in `src/lib/escalation-engine.ts`. |
| `4d4f607` | Admin GO editor + audit chain validator + cron smoke | Made `/admin/platforms` read from DB (was reading from in-memory stub). Added `POST /api/admin/platforms/[platformId]` with CSRF + admin auth, writes `PlatformGoHistory` per changed field. Added `validateAuditChainFromDb()` to walk the audit log and surface tampering. Added skipped Playwright spec for production cron smoke. |
| `9520764` | CSV scaffold | `data/platforms-tier1.csv` with 16 Tier 1/2/3 rows as placeholders. `scripts/import-platforms-csv.ts` with `--confirm` guard, prints DB host, rejects unverified rows missing contacts. `npm run import:platforms`. |
| `21b520f` | L1 follow-up | New `dispatchEscalationFollowUp` in `src/lib/notice-dispatch.ts` with its own idempotency map keyed by `(caseId, urlId, recipient, level)`. Restructured `runDueEscalationsFromDb` so the level bump happens AFTER handler success. New skip reasons: `blocked_legal_review`, `blocked_no_recipient`, `blocked_no_template`. |
| `bc921d0` | L2 victim notification | Migration `20260517000000_user_preferred_locale` added `User.preferredLocale`. New `createL2VictimNotificationEmail` + `sendL2VictimNotification` in `src/lib/email.ts`. `handleL2VictimNotification` decrypts the user's email and sends. **Locale arg is plumbed but Hindi copy is NOT drafted** — falls back to English regardless of locale until a native speaker fills it in. |
| `426c40a` | L3 FIR ready | Migration `20260517010000_case_fir_package` added `Case.firPackageGeneratedAt`. New `createL3FirReadyEmail` + `sendL3FirReadyNotification`. `handleL3FirReady` decrypts user email, builds dashboard + PDF URLs from `NEXT_PUBLIC_APP_URL`, sends. The transaction conditionally includes `db.case.update({ firPackageGeneratedAt: now })` when `dueLevel === 3`. |
| `b913414` | Hindi i18n scaffold | Extracted 26 homepage strings into `en.json` with namespaced keys (`home.hero.cta`, etc.). Mirrored to `hi.json` with empty `""` values. `t()` helper already falls back to English when Hindi is empty. Translator handoff doc at `docs/translation/hindi-marketing-handoff.md`. |

---

## 8. Critical files reference — read these when relevant

| File | When to read |
|---|---|
| `src/lib/escalation-engine.ts` | Anything about the 24h/48h/7d flow, escalation gates, or daily-cron sweep semantics. |
| `src/lib/notice-dispatch.ts` | Adding any new email-send path or working with idempotency keys for outbound emails. |
| `src/lib/notice-generator.ts` | Touching template rendering. Note the hard-coded forbidden variables (`phone`, `aadhaar`, etc.) and the control-character sanitisation. |
| `src/lib/audit.ts` | Adding a new audit event type. Always test your event canonicalises to the same hash on re-read. |
| `src/lib/auth/admin-permissions.ts` | If you're tempted to add a new admin role or permission. The sub-role JWT gap (only `role: "ADMIN"` is in the claims) is documented; don't pretend GO_EDITOR is enforced when it isn't. |
| `src/lib/case-ops.ts` | All case/URL state transitions. `hardDeleteDueUsers` is the core of the 30-day deletion guarantee. |
| `src/lib/i18n.ts` | The `t()` helper. `t(locale, key)` falls back to English when the locale's value is empty — that's by design. |
| `src/jobs/queue.ts` | The BullMQ wiring. `shouldUseBullMq()` only fires when `QUEUE_DRIVER=bullmq` AND `REDIS_URL` is set. In practice on Vercel, neither is true. |
| `prisma/schema.prisma` | Single source of truth for DB shape. Always cross-reference enum values before assuming. |
| `data/platforms-tier1.csv` | The GO researcher's worksheet. |
| `docs/translation/hindi-marketing-handoff.md` | The translator's worksheet for marketing copy. |
| `src/i18n/hi-review-status.json` | Source of truth for what Hindi is "production-ready" vs "AI-drafted pending review" vs "scaffolded awaiting translator". |

---

## 9. Testing conventions

- Path alias `@/*` resolves to `src/*` in both Vitest and TS.
- Vitest mocks Prisma at the module level: `vi.mock("@/lib/db", () => ({ db: { notice: { findMany: vi.fn() }, ... } }))`. See `tests/unit/escalation-sweep.test.ts` and `tests/unit/admin-platforms-route.test.ts` for the canonical patterns.
- API route tests build a `Request` object with a `csrfPost(path, body)` helper from `tests/unit/api-routes.test.ts`.
- The no-fetch invariant has a dedicated integration test at `tests/integration/no-url-fetch.test.ts`. Don't disable it.
- Playwright E2E runs against a local dev server (`npm run dev -p 3001`). `tests/e2e/cron-smoke.spec.ts` is the exception — it auto-skips unless `ASMITA_PROD_URL` and `ASMITA_CRON_SECRET` are set.
- Run a single test file: `npx vitest run tests/unit/<file>.test.ts`. Run the whole suite: `npm run test`.
- Currently 228/229 unit tests pass. **The 1 failure (`tests/unit/support-resources.test.ts`) is PRE-EXISTING** from an in-flight homepage redesign in the user's working tree — not from any work in the last 7 commits. Do not pretend to "fix" it without understanding the redesign first.

---

## 10. The 21 uncommitted files in the working tree

When you run `git status`, you'll see ~21 modified files in `src/app/(public)/`, `src/app/(victim)/`, etc. These are from a homepage / marketing redesign the user started earlier and hasn't finished. **They are not your work.** Leave them alone unless the user explicitly asks you to handle them. If you stage files for a commit, be surgical (`git add <specific-path>`), never `git add -A`.

---

## 11. Common pitfalls — things that will bite you

1. **Next.js 16.2.6 is newer than your training cutoff for some patterns.** Before writing a route handler, layout, or middleware, peek at `node_modules/next/dist/docs/01-app/`. Examples: `RouteContext<'/path/[id]'>` is the new typed-params pattern; `export const dynamic = "force-dynamic"` is required on route handlers that read DB.
2. **PowerShell on Windows.** The shell is PowerShell 5.1, not bash. `&&` doesn't work; chain commands with `;` or `if ($?)`. The Bash tool exists but use it carefully; prefer the dedicated tools (Read, Edit, Grep, Glob) over shell commands.
3. **Vercel Hobby tier crons run once per day max.** Don't propose `0 * * * *` (hourly) — deployment will fail. Anything sub-daily blocks the Pro plan upgrade. Daily is fine for our 24h/48h/7d SLAs.
4. **BullMQ doesn't run on Vercel.** Don't propose adding a real queue worker. The "queue" is a daily DB sweep.
5. **Prisma adapter pattern.** This project uses `@prisma/adapter-pg`. Do not switch to the bundled driver without updating both `db.ts` and `seed.ts`.
6. **`prisma migrate dev` requires a writable shadow DB.** Use `prisma migrate deploy` for the user's Supabase (single-DB setup). To create a new migration file when developing, write the SQL by hand under `prisma/migrations/<timestamp>_<name>/migration.sql` and run `prisma migrate resolve --applied <name>` if the schema is already in place via `db push`.
7. **Don't put network calls (Resend, webhooks) inside DB transactions.** The existing escalation engine does network sends BEFORE the level-bump transaction for this reason.
8. **The audit log's `eventType` is a Prisma enum.** Adding a new event type means a migration + `prisma generate`. If you want to skip the migration, reuse an existing event (e.g., `ADMIN_ACTION`) with a discriminator in the `data` JSON.

---

## 12. Memory & context

The user has Claude's auto-memory system enabled. The memory index lives at:

```
~/.claude/projects/C--Users-saqui-OneDrive---Jamia-Millia-Islamia--A-Central-University--Desktop-Asmita/memory/MEMORY.md
```

Read it first. There are project-overview, feedback, and documents memories. When the user gives durable instructions ("from now on, always X", or "do not do Y"), write them as new memory files. Format and policy are in the system prompt's "auto memory" section.

---

## 13. When you finish a task, before declaring done

1. `npm run type-check` — must pass cleanly.
2. `npm run lint` — one pre-existing `DisplayCase` warning is acceptable; nothing else.
3. `npx vitest run <new-test-file>` — your new tests must pass.
4. `npm run test` — the full suite. 228 passing + 1 pre-existing fail in `support-resources.test.ts` is the current baseline.
5. Call the `advisor` tool. The advisor sees your full transcript and catches mistakes you can't see. **Take its feedback seriously** unless you have primary-source evidence contradicting it.
6. Commit with a real message — explain the why, not just the what. Sign off with the trailer the user prefers (see existing commit messages for format). One scoped commit per logical change; no kitchen-sink commits.
7. Push only when the user confirms. Pushing to `master` triggers a Vercel production deploy.

---

## 14. What to do first

When the user gives you a task, your default order:

1. **Read the relevant 2–4 files** referenced in section 8 before forming an opinion.
2. **Call advisor** with a sentence or two of context about your approach — before writing substantive code.
3. **Create a TaskCreate plan** if the work is more than 3 steps.
4. **Write the smallest possible diff** that achieves the goal. No drive-by refactors, no extra abstractions.
5. **Write tests for new behaviour.** Match the patterns in `tests/unit/` exactly.
6. **Type-check, lint, run tests, call advisor again, then commit.**

If you're stuck for more than 10 minutes, stop and ask the user. Don't burn through tokens trying random things.

---

## 15. Things the user has explicitly chosen

These are settled. Do not re-litigate them.

- URL-based, not hash-based (Phase 1).
- India-only (Phase 1 & 2). English + Hindi at launch.
- Registered submissions, not anonymous.
- Notice templates are draft-only until IFF / SFLC.in sign off.
- No stock photos anywhere — design uses typography and color only.
- Visual language: Stripe structure + Notion warmth. Accent `#0A5E5A` teal. Background `#F8F7F5` warm off-white.
- One-screen-per-step Typeform-style victim flow (8 screens, F-01 to F-08).
- Trauma-informed UX register: "You don't have to face this alone" — not government, not clinical, not sales.
- Self-hosted Inter + Noto Sans Devanagari fonts.
- Supabase for Postgres. Vercel Hobby for hosting. Resend for email.

---

## 16. The "definition of v1 ready"

Before Asmita can send a real notice to a real platform, ALL of these need to be true:

- [ ] `CRON_SECRET`, `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CSRF_SECRET` set in Vercel env vars.
- [ ] Domain purchased; SPF / DKIM / DMARC verified in Resend.
- [ ] At least one notice template has `reviewedByLegal: true` (legal partner sign-off).
- [ ] At least one Tier 1 platform has a verified Grievance Officer email AND `lastContactVerifiedByHuman: true` (researcher sign-off).
- [ ] POCSO protocol document signed and filed.
- [ ] One NGO partner MOU signed (for the vouching pathway, optional but recommended for beta).
- [ ] Smoke test against the deployed `/api/cron/maintenance` endpoint returns 200 with a clean JSON summary.

When all 7 boxes are checked, the system can run end-to-end without code changes. The engine is already coded for it; it just needs the humans to do their parts.

Good luck.
