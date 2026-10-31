# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

Asmita is a privacy-preserving NCII (non-consensual intimate imagery) support platform for Indian survivors. It generates and routes legally-grounded takedown notices to platforms, and enables survivors to submit perceptual image fingerprints (PDQ hashes) for proactive blocking — all without the server ever seeing the original image.

It is safety-critical software. Changes touching URL handling, evidence, outbound notices, minors, platform contacts, or survivor data warrant extra care.

## Safety Principles

These are not checklists — they are the reasoning to apply when making decisions:

**No media on the server (current rule, under review).** The server must never fetch, preview, scrape, store, or process intimate image content. Hashes are computed client-side; only the 64-hex PDQ string reaches the server. Anything resembling a data URL, base64 blob, or image bytes is rejected at the schema layer. Enforced by architecture and tests (`asmita/tests/lint/`, `src/lib/no-fetch-monitor.ts`). ADR 002 (`asmita/docs/adr/002-consented-encrypted-media.md`) proposes allowing encrypted, consented, time-limited media for the evidence vault; it is blocked on legal sign-off. Until it is accepted this rule holds. When it is, change the ADR status, this section and the tests together; never work around the tests.

**Real data stays out of code.** No real NCII URLs, survivor PII, Aadhaar numbers, platform credentials, or production secrets in tests, fixtures, logs, issues, or comments — ever.

**Notice integrity.** What the survivor reviews and signs must match what gets sent. The signed PDF and the email body must cover the same content. If a hash annex is added after signing, the declaration must explicitly cover it.

**Dispatch gates exist for a reason.** Human contact verification (`lastContactVerifiedByHuman`) and legal template review (`reviewedByLegal`) are safety gates for production. Dev bypasses (`DEV_SKIP_LEGAL_REVIEW=true`, which also auto-approves hashes) exist for development velocity; they must never reach production config. Only a human legal reviewer sets `reviewedByLegal: true`; code and seeds never flip it.

**Minors never reach the case flow.** POCSO routing is not an optional feature — it's a legal obligation. Any path that could expose a minor to the adult case flow is a bug.

**Never invent facts that get sent to platforms or survivors.**
- Grievance Officer emails, phones and addresses come only from human-verified sources. If one is missing, use `<TO_BE_VERIFIED_BY_HUMAN>`; never guess.
- Indian law citations come only from PRD Section 4 (`asmita/docs/archive/planning-2026-05/PRD_Asmita.md`) or the MeitY October 2025 NCII SOP. Anything else is tagged `[CITATION REQUIRED — verify with legal advisor]`.
- Survivor-facing Hindi is written by a native speaker. You may add empty keys to `src/i18n/hi.json`, not machine-translated text (see `src/i18n/hi-review-status.json`).

## Current Feature State

Both URL takedown and image fingerprint (hash) submission are live and deployed. There is no longer a Phase 1 / Phase 2 gate distinction in the codebase — features are controlled by env vars as deployment switches, not development gates.

| Feature | Env var | Status |
|---|---|---|
| Hash upload (PDQ fingerprinting) | `ENABLE_HASH_UPLOAD=true` | Built, deployed (Worker vars in `wrangler.jsonc`) |
| Platform API (StopNCII, I4C) | `ENABLE_PLATFORM_API=true` | Not yet built |
| Provenance check | `ENABLE_PROVENANCE_CHECK=true` | Off in staging and production |
| BullMQ queue | `QUEUE_DRIVER=bullmq` + `REDIS_URL` | Not used on Workers. Scheduled work runs on Cron Triggers plus database sweeps |

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

Each admin has their own authenticator secret, encrypted at rest in `AdminMfaSecret` (keyed by email hash). `ADMIN_TOTP_SECRET` is only a bootstrap: it works for an admin until they enrol at `/admin/setup-mfa`, after which only their own secret is accepted. Enrolment shows the secret once. A SUPER_ADMIN resets a lost device via `POST /api/admin/mfa/reset` (`users:manage`), which returns that admin to the bootstrap state. Once every admin has enrolled, rotate or remove `ADMIN_TOTP_SECRET`.

## Notice integrity in code

- `/api/notices/dispatch` refuses a URL without `signedNoticePdf` (409 `signature_required`).
- `src/lib/case-hash-annex.ts` is the single builder for the fingerprint annex: preview and sign list every non-rejected fingerprint; dispatch sends only approved fingerprints submitted before `declarationSignedAt`. `declarationSignedAt` is set only by the two sign routes.

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

Local dev uses memory-backed queues, rate limits, audit log, and email (no Postgres/Redis/Resend required). Set `DATABASE_URL` in `.env.local` to switch to Prisma.

## Architecture

Next.js 16 App Router + TypeScript, built with vinext and run on Cloudflare Workers. PostgreSQL through Kysely + `pg` at Worker runtime (Hyperdrive) and Prisma for schema, migrations and local Node. Resend + Zod.

- `src/app/` — route groups: `(public)`, `(victim)`, `(admin)`, `(auth)`, `api/`
- `src/lib/` — domain logic: case lifecycle (`case-ops.ts` = database, Kysely on the Worker via `worker-kysely.ts` and Prisma otherwise; `store.ts` = memory dev/test), notice generation/dispatch (`notice-*.ts`), hash submission/dispatch (`hash-submission.ts`, `hash-dispatch.ts`), escalation, audit, encryption, rate limiting, CSRF
- `src/lib/auth/` — OTP login, JWT (jose), admin allowlist + MFA + permissions
- `src/jobs/` — queue abstraction: in-memory by default; BullMQ code remains but is not used in deployment
- `src/cloudflare-worker.ts` — Worker entry, including Cron Trigger handlers
- `prisma/` — schema, migrations, seeds (notice templates in `template-seeds.ts`)
- `docs/` — ops, legal, security, ADR docs. `docs/infra/cloudflare-migration.md` is the current deployment runbook. `docs/archive/` is historical (May 2026 Vercel design) and is kept only for the PRD citations and the PDQ system design

**Dual-backend pattern:** queue, store, rate limit, email all have a memory path (dev/test) and a real implementation (Prisma/Redis/Resend) selected by env vars. Production must use the database path (`case-ops.ts`), never `store.ts`.

## Next.js Note

Per `asmita/AGENTS.md`: this Next.js version may differ from training data. Consult `asmita/node_modules/next/dist/docs/` before writing framework-touching code.

## Deployment

Cloudflare Workers. `asmita-production` serves the public domain and reaches the production database (Supabase, Mumbai `ap-south-1`) through Hyperdrive. `asmita-staging` currently has no database binding or Cron Triggers and must not be pointed at production data or used for app testing until a separate staging database exists. Runbook: `asmita/docs/infra/cloudflare-migration.md`.

Production launch is still gated on: legal sign-off on notice templates, NGO partnership, POCSO protocol, GO contact verification.
