# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

Asmita is a privacy-preserving NCII (non-consensual intimate imagery) support platform for Indian survivors. It generates and routes legally-grounded takedown notices to platforms, and enables survivors to submit perceptual image fingerprints (PDQ hashes) for proactive blocking — all without the server ever seeing the original image.

It is safety-critical software. Changes touching URL handling, evidence, outbound notices, minors, platform contacts, or survivor data warrant extra care.

## Safety Principles

These are not checklists — they are the reasoning to apply when making decisions:

**No media, ever.** The server must never fetch, preview, scrape, store, or process intimate image content. Hashes are computed client-side; only the 64-hex PDQ string reaches the server. Anything resembling a data URL, base64 blob, or image bytes is rejected at the schema layer. This is enforced by architecture and lint tests (`asmita/tests/lint/`, `src/lib/no-fetch-monitor.ts`).

**Real data stays out of code.** No real NCII URLs, survivor PII, Aadhaar numbers, platform credentials, or production secrets in tests, fixtures, logs, issues, or comments — ever.

**Notice integrity.** What the survivor reviews and signs must match what gets sent. The signed PDF and the email body must cover the same content. If a hash annex is added after signing, the declaration must explicitly cover it.

**Dispatch gates exist for a reason.** Human contact verification (`lastContactVerifiedByHuman`) and legal template review (`reviewedByLegal`) are safety gates for production. Dev bypasses (`DEV_SKIP_LEGAL_REVIEW=true`) exist for development velocity; they must never reach production config. Hash auto-approve (`DEV_SKIP_LEGAL_REVIEW`) follows the same pattern.

**Minors never reach the case flow.** POCSO routing is not an optional feature — it's a legal obligation. Any path that could expose a minor to the adult case flow is a bug.

## Current Feature State

Both URL takedown and image fingerprint (hash) submission are live and deployed. There is no longer a Phase 1 / Phase 2 gate distinction in the codebase — features are controlled by env vars as deployment switches, not development gates.

| Feature | Env var | Status |
|---|---|---|
| Hash upload (PDQ fingerprinting) | `ENABLE_HASH_UPLOAD=true` | Built, deployed, Vercel env set |
| Platform API (StopNCII, I4C) | `ENABLE_PLATFORM_API=true` | Not yet built |
| BullMQ queue | `QUEUE_DRIVER=bullmq` + `REDIS_URL` | Optional; in-memory default |

## Survivor Paths

Three distinct flows exist after case creation:

1. **URL-only** → submit URLs → sign notice PDF → admin dispatches via email
2. **URL + hash** → submit URLs + fingerprint → sign notice PDF → admin dispatches with hash annex appended
3. **Hash-only** → fingerprint image → pick platform → immediate advisory dispatch (email platforms) OR redirect to platform form (FORM_ONLY platforms)

FORM_ONLY platforms (e.g. Meta, X, LinkedIn) have a `formUrl` but no verified grievance email. Survivors are directed to fill the platform's own form; the copy-paste notice text includes the PDQ fingerprints.

## Dev Bypass Flags

These flags exist for local development only. Never set them in Vercel production environment:

- `DEV_SKIP_LEGAL_REVIEW=true` — bypasses `reviewedByLegal` template gate and hash `PENDING_REVIEW` status; hashes auto-approve immediately
- `DEV_OTP_CODE=123456` — fixed OTP for local testing (all environments except prod)

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
```

Single test: `npx vitest run tests/unit/<file>.test.ts`
Single e2e: `npx playwright test tests/e2e/<file>.spec.ts`

Local dev uses memory-backed queues, rate limits, audit log, and email (no Postgres/Redis/Resend required). Set `DATABASE_URL` in `.env.local` to switch to Prisma.

## Architecture

Next.js 16 App Router + TypeScript + Prisma (PostgreSQL) + BullMQ/Redis + Resend + Zod.

- `src/app/` — route groups: `(public)`, `(victim)`, `(admin)`, `(auth)`, `api/`
- `src/lib/` — domain logic: case lifecycle (`case-ops.ts` = Prisma; `store.ts` = memory dev/test), notice generation/dispatch (`notice-*.ts`), hash submission/dispatch (`hash-submission.ts`, `hash-dispatch.ts`), escalation, audit, encryption, rate limiting, CSRF
- `src/lib/auth/` — OTP login, JWT (jose), admin allowlist + MFA + permissions
- `src/jobs/` — queue abstraction: BullMQ when configured, in-memory otherwise
- `prisma/` — schema, migrations, seeds (notice templates in `template-seeds.ts`)
- `docs/` — ops, legal, security, ADR docs; `docs/ai-agent-handoff.md` has full agent context

**Dual-backend pattern:** queue, store, rate limit, email all have a memory path (dev/test) and a real implementation (Prisma/Redis/Resend) selected by env vars. Production must use Prisma path (`case-ops.ts`), never `store.ts`.

## Next.js Note

Per `asmita/AGENTS.md`: this Next.js version may differ from training data. Consult `asmita/node_modules/next/dist/docs/` before writing framework-touching code.

## Deployment

Vercel, Mumbai region (`bom1`). Preview environment is production-equivalent (full env vars set). Production launch still gated on: legal sign-off on notice templates, NGO partnership, POCSO protocol, GO contact verification.
