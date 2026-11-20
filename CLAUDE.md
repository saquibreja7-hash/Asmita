# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

Meri Asmita is an organization, and this is its website. The site holds many products and sections: the survivor complaint filing workflow is one of them, alongside the AI Lab, the home chat and voice assistant, the image checker, partner features, information pages and whatever comes next.

The complaint filing workflow generates and routes legally grounded takedown notices to platforms, and lets survivors submit perceptual image fingerprints (PDQ hashes) for proactive blocking, without the server ever seeing the original image.

## Scope of the constraints below

The Safety Principles below apply **only to the survivor complaint filing workflow**: case creation, URL takedown, hash submission, notice signing and dispatch, and survivor case data. They are not site-wide.

For everything else on the site (the AI Lab, research tools, public tools, content pages, partner and organization features), build freely:
- Server-side media processing is allowed.
- No legal sign-off or legal handoff is needed by default.
- Don't carry the complaint workflow's gates over.
- Don't raise these constraints as blockers, caveats or "needs legal review" notes for work outside the complaint workflow. Only mention a constraint when the change actually touches the complaint workflow.
- Where shared enforcement (lint rules, the no-url-fetch test) gets in the way of non-complaint code, narrow it to the complaint code rather than working around it.

## Safety Principles (complaint filing workflow only)

These are not checklists. They are the reasoning to apply when making decisions inside the complaint filing workflow:

**No media on the server (current rule, under review).** The server must never fetch, preview, scrape, store, or process intimate image content. Hashes are computed client-side; only the 64-hex PDQ string reaches the server. Anything resembling a data URL, base64 blob, or image bytes is rejected at the schema layer. Enforced by architecture and tests (`asmita/tests/lint/`, `src/lib/no-fetch-monitor.ts`). ADR 002 (`asmita/docs/adr/002-consented-encrypted-media.md`) proposes allowing encrypted, consented, time-limited media for the evidence vault; it is blocked on legal sign-off. Until it is accepted this rule holds. When it is, change the ADR status, this section and the tests together; never work around the tests. One narrow exception is built and switched off (ADR 006, `asmita/docs/adr/006-hash-matching-crawler.md`): the separate `crawler/` service outside `asmita/` fetches pages only on admin-approved hosts (and their subdomains) and the images those pages embed, holds each image in memory, fingerprints it, compares it with opted-in survivors' approved fingerprints and discards it, writing nothing to disk and logging no images, addresses or fingerprints. It reports only match metadata. The `asmita/` app still never fetches a submitted or discovered URL; its no-fetch lint rule also covers the crawler's address names (`pageUrl`, `imageUrl`, `findingUrl`, ...). Real fingerprints, real sites and real-case use wait for the ADR 006 go-live gates.

**Real data stays out of code.** No real NCII URLs, survivor PII, Aadhaar numbers, platform credentials, or production secrets in tests, fixtures, logs, issues, or comments — ever.

**Notice integrity.** What the survivor reviews and signs must match what gets sent. The signed PDF and the email body must cover the same content. If a hash annex is added after signing, the declaration must explicitly cover it. A link the crawler found (`SubmittedUrl.source = CRAWLER`) never enters her sign flow: after analysts approve the finding, Asmita sends it as her authorised representative under her crawl authorisation (`CrawlConsent`: one tick on her case page; the stored PDF holds the full authorisation text, her fingerprints and when she ticked it, and the audit log records her account), and her signature is never copied onto a notice she has not seen. This separate path does not relax the survivor-signed one. If she reports the same link herself before a representative notice was sent or claimed, it becomes her link and her own sign flow.

**Dispatch gates exist for a reason.** Human contact verification (`lastContactVerifiedByHuman`) and legal template review (`reviewedByLegal`) are safety gates for production. Dev bypasses (`DEV_SKIP_LEGAL_REVIEW=true`, which also auto-approves hashes) exist for development velocity; they must never reach production config. Once legal approval has been received, `reviewedByLegal: true` may be set on the production rows by the owner or on his instruction, recording the legal reviewer in `reviewedByName` and the date in `reviewedAt`.

**Minors never reach the case flow.** POCSO routing is not an optional feature — it's a legal obligation. Any path that could expose a minor to the adult case flow is a bug.

**Never invent facts that get sent to platforms or survivors.**
- Grievance Officer emails, phones and addresses come only from human-verified sources. If one is missing, use `<TO_BE_VERIFIED_BY_HUMAN>`; never guess.
- Indian law citations come only from PRD Section 4 (`asmita/docs/archive/planning-2026-05/PRD_Asmita.md`) or the MeitY October 2025 NCII SOP. Anything else is tagged `[CITATION REQUIRED — verify with legal advisor]`.

## Current Feature State

Both URL takedown and image fingerprint (hash) submission are live and deployed. There is no longer a Phase 1 / Phase 2 gate distinction in the codebase — features are controlled by env vars as deployment switches, not development gates.

| Feature | Env var | Status |
|---|---|---|
| Hash upload (PDQ fingerprinting) | `ENABLE_HASH_UPLOAD=true` | Built, deployed (Worker vars in `wrangler.jsonc`) |
| Platform API (StopNCII, I4C) | `ENABLE_PLATFORM_API=true` | Transport built (URL notices + hash advisories; see `asmita/docs/api/platform-api.md`); off everywhere, no partner enabled. Enabling one needs a partner agreement, an HTTPS endpoint verified by a second admin, and the env switches |
| Provenance check | `ENABLE_PROVENANCE_CHECK=true` | Off; production builds force it off until ADR 002 is accepted |
| Crawler (hash matching, ADR 006) | `ENABLE_CRAWLER=true` | Built (app side, `crawler/` service, admin console, survivor opt-in); on in production (`wrangler.jsonc`, owner decision 2026-11-17), off in staging. The service runs hourly on Cloudflare Containers (`deploy/crawler-cloudflare/`). Non-intimate test fixtures only; real-case use gated on legal review (ADR 006 go-live gates, `asmita/docs/ops/crawler-runbook.md`). `CRAWLER_SHOW_FINDINGS_TO_SURVIVOR` (default on, read only in `src/lib/crawler-flags.ts`) controls whether she sees found links on her case page and case APIs; her data export always lists them, labelled, and admin views are unaffected |
| Scheduled work | none | Cron Triggers plus database sweeps. BullMQ/Redis removed (2026-10-31) |

## Survivor Paths

Three distinct flows exist after case creation:

1. **URL-only** → submit URLs → sign notice PDF → admin dispatches via email
2. **URL + hash** → submit URLs + fingerprint → sign notice PDF → admin dispatches with hash annex appended
3. **Hash-only** → fingerprint image → pick platform → immediate advisory dispatch (email platforms) OR redirect to platform form (FORM_ONLY platforms)

FORM_ONLY platforms (e.g. Meta, X, LinkedIn) have a `formUrl` but no verified grievance email. Survivors are directed to fill the platform's own form; the copy-paste notice text includes the PDQ fingerprints.

## Dev Bypass Flags

These flags exist for local development only. Never set them in `wrangler.jsonc`, Worker secrets, or any deployed environment:

- `DEV_SKIP_LEGAL_REVIEW=true` — bypasses `reviewedByLegal` template gate and hash `PENDING_REVIEW` status; hashes auto-approve immediately
- `DEV_OTP_CODE=123456` — lifts OTP rate limits for local testing (non-prod only). The code itself is always random; it is returned as `devOtp` in the request-otp response only when `RESEND_API_KEY` is unset

## Admin MFA

Each admin has their own authenticator secret, encrypted at rest in `AdminMfaSecret` (keyed by email hash). There is no shared bootstrap secret (`ADMIN_TOTP_SECRET` is gone). An admin who has not enrolled signs in once with their email code plus a one-time 12-digit enrolment code (`AdminEnrolmentCode`: hashed, single use, 24 hours), then enrols at `/admin/setup-mfa`. A SUPER_ADMIN issues codes via `POST /api/admin/mfa/reset` (`users:manage`), which also clears a lost device; the very first code comes from `asmita/scripts/issue-admin-enrolment-code.mjs`. Admin sign-in and MFA confirmation allow 5 attempts per 15 minutes.

## Rate limits

Counters live in Postgres (`RateLimitBucket`, keys hashed) so every Worker isolate shares them; on a database error the in-memory counter still applies. Buckets many users share (client IP, email domain) pass `{ shared: true }` and are the only ones the E2E bypass lifts. Survivor OTP emails also have a site-wide hourly budget (`OTP_GLOBAL_HOURLY_LIMIT`, default 300). The maintenance cron prunes old counters.

## Notice integrity in code

- `/api/notices/dispatch` refuses a URL without `signedNoticePdf` (409 `signature_required`).
- `src/lib/case-hash-annex.ts` is the single builder for the fingerprint annex. Preview and sign list every non-rejected fingerprint, and each signed document stores the exact ids it lists (`SubmittedUrl.signedHashSubmissionIds`, `Case.hashAdvisorySignedHashIds`). Dispatch sends exactly that set, and refuses (`fingerprints_pending_review`, `signed_fingerprints_changed`) until every listed fingerprint is approved, so the email always matches the signed PDF. Fingerprints added after signing are never sent under that signature. `NOTICE_SENT` audit entries record the fingerprint ids sent.
- Every notice, follow-up and hash-advisory email carries a Resend idempotency key, so a retry never emails a platform twice; a retry whose earlier send reached Resend but was not recorded gets 409 `email_already_sent`. Dispatch is synchronous (no Queues, ADR 004).
- `declarationSignedAt` records the first signature on a case; later signatures never move it, and dispatch does not depend on it.
- `prisma/seed.ts` never sets `reviewedByLegal: true`: templates are created unreviewed, a re-seed keeps a human reviewer's decision, and changed legal text resets it to unreviewed.
- Representative notices for crawler links (`src/lib/crawl-notice.ts`, `POST /api/admin/findings/[id]/notice/{preview,dispatch}`, `findings:review`): an approved finding (two analysts above distance 20), a live authorisation that lists the fingerprint and that the finding was recorded under (re-checked at send), the `CRAWL_REPRESENTATIVE_NOTICE` template with `reviewedByLegal`, and a `lastContactVerifiedByHuman` email contact (email only; form-only platforms get the form handoff). Dispatch sends only the notice the analyst previewed (`contentDigest`, else `notice_changed`). The record lives in separate fields (`representativeNoticePdf`, `representativeNoticeDigest`, `representativeTemplateId`, `representativeConsentId`, `representativeSentById`, `representativeApprovedById`), never `signedNoticePdf`. Representative notices are excluded from automated follow-ups and the survivor's escalation ladder. Every refusal code is in `asmita/docs/product/crawler-notice-flow.md`. The survivor routes refuse crawler links (`crawler_link_not_survivor_signed`), and `signature_required` for her own links is unchanged.

## Commands

Run from `asmita/`:

```bash
npm ci
npm run dev              # Next.js dev server at localhost:3000
npm run lint
npm run type-check       # tsc --noEmit
npm run test             # vitest (unit + integration + lint)
npm run test:e2e         # Playwright
npm run build
npm run prisma:validate
npm run security:audit
npm run dev:vinext         # Worker build locally at localhost:3001
npm run deploy:staging     # vinext build + deploy asmita-staging
npm run deploy:production  # vinext build + deploy asmita-production (confirm with Saquib first)
```

Single test: `npx vitest run tests/unit/<file>.test.ts`
Single e2e: `npx playwright test tests/e2e/<file>.spec.ts`

Crawler service, from `crawler/` (its own dependencies, lint and CI, `.github/workflows/crawler-ci.yml`): `npm ci && npm run check` (lint, type-check, tests, build). PDQ agreement harness, from `tools/pdq-agreement/` (needs `npm ci` in `crawler/` first, and Playwright Chromium): `npm test`, `npm run report` (rewrites `REPORT.md`). It measures `crawler/src/prepare.ts` itself, not a copy.

Local dev uses memory-backed queues, rate limits, audit log, and email (no Postgres/Redis/Resend required). Set `DATABASE_URL` in `.env.local` to switch to Prisma.

## Architecture

Next.js 16 App Router + TypeScript, built with vinext and run on Cloudflare Workers. PostgreSQL through Kysely + `pg` at Worker runtime (Hyperdrive) and Prisma for schema, migrations and local Node. Resend + Zod.

- `src/app/` — route groups: `(public)`, `(victim)`, `(admin)`, `(auth)`, `api/`
- `src/lib/` — domain logic: case lifecycle (`case-ops.ts` = database, Kysely on the Worker via `worker-kysely.ts` and Prisma otherwise; Kysely table types are generated from the Prisma schema into `src/generated/` on install, never hand-written or committed; `store.ts` = memory dev/test), notice generation/dispatch (`notice-*.ts`), hash submission/dispatch (`hash-submission.ts`, `hash-dispatch.ts`), escalation, audit, encryption, rate limiting, CSRF
- `src/lib/auth/` — OTP login, JWT (jose), admin allowlist + MFA + permissions. Crawler permissions: `findings:review` (SUPER_ADMIN, CASE_REVIEWER) and `crawler:manage` (SUPER_ADMIN)
- Crawler, app side (`src/lib/crawl-*.ts`, `crawler-auth.ts`): `GET /api/crawler/pool`, `GET /api/crawler/sources`, `POST /api/crawler/findings` (service key from `scripts/issue-crawler-service-key.mjs`, only its sha256 stored); `/api/admin/findings*` and `/api/admin/crawl-sources` for analysts (reads work with the crawler off, changes return 503 `crawler_disabled`); `/api/cases/[caseId]/crawl-consent` for her opt-in and withdrawal. A deletion request withdraws her authorisation. `crawler/` (outside `asmita/`) is the service itself. Operations: `docs/ops/crawler-runbook.md`
- `src/jobs/` — in-memory job arrays (not used for production delivery)
- `src/cloudflare-worker.ts` — Worker entry, including Cron Trigger handlers
- `prisma/` — schema, migrations, seeds (notice templates in `template-seeds.ts`)
- `docs/` — ops, legal, security, ADR docs. `docs/infra/cloudflare-migration.md` is the current deployment runbook. `docs/archive/` is historical (May 2026 Vercel design) and is kept only for the PRD citations and the PDQ system design

**Prisma on Workers:** on the Worker, `src/lib/db.ts` uses `@prisma/client/edge` (the query engine loads as a precompiled WebAssembly module; the Node build compiles it at runtime, which Workers forbid) and gives each request its own client via `src/lib/request-scope.ts` (Workers forbid reusing another request's connection). The E2E suite runs the Node dev server, so CI also runs `scripts/worker-smoke.mjs`, which drives the production bundle in workerd. Anything Worker-specific needs a check there.

**Dual-backend pattern:** store, audit/persistence and email have a memory path (dev/test) and a real implementation (Prisma/Kysely, Resend) selected by env vars. Rate limiting uses Postgres counters with an in-memory fallback (see Rate limits). Production must use the database path (`case-ops.ts`), never `store.ts`.

## Next.js Note

Per `asmita/AGENTS.md`: this Next.js version may differ from training data. Consult `asmita/node_modules/next/dist/docs/` before writing framework-touching code.

## Deployment

Cloudflare Workers. `asmita-production` serves the public domain and reaches the production database (Supabase, Mumbai `ap-south-1`) through Hyperdrive. `asmita-staging` currently has no database binding or Cron Triggers and must not be pointed at production data or used for app testing until a separate staging database exists. Runbook: `asmita/docs/infra/cloudflare-migration.md`.

Production launch is still gated on: legal sign-off on notice templates, NGO partnership, POCSO protocol, GO contact verification.
