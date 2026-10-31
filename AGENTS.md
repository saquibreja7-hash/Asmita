# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

Asmita is a privacy-preserving NCII (non-consensual intimate imagery) support and notice-routing system for survivor-led URL takedown workflows. It is safety-critical software — treat any change touching URL handling, evidence, outbound notices, minors, platform APIs, or storage as safety-sensitive.

## Commands

The application lives in `asmita/`. Root `package.json` scripts proxy into it (`npm run dev` at root works), but run commands from `asmita/` directly:

```bash
cd asmita
npm ci
npm run dev              # Next.js dev server at localhost:3000
npm run lint             # eslint
npm run type-check       # tsc --noEmit
npm run test             # vitest run (unit + integration + lint tests)
npm run test:e2e         # Playwright
npm run test:a11y        # Playwright accessibility spec only
npm run build
npm run prisma:validate
npm run security:audit
```

Run a single vitest test: `npx vitest run tests/unit/<file>.test.ts`. Single Playwright spec: `npx playwright test tests/e2e/<file>.spec.ts`.

Local dev defaults to **memory-backed** queues, rate limits, audit persistence, and email delivery proof; PostgreSQL, Redis, and provider secrets are opt-in via `.env.local` (see `asmita/.env.example`).

## Architecture

Next.js 16 App Router + TypeScript + Prisma (PostgreSQL) + BullMQ/Redis + Resend email + Zod.

* `asmita/src/app/` — route groups: `(public)`, `(victim)`, `(admin)`, `(auth)`, plus `api/` (cases, notices, admin, auth, cron, webhooks, ngo, platforms).
* `asmita/src/lib/` — core domain logic: case lifecycle (`case-ops.ts` = Prisma path; `store.ts` = in-memory dev/test store that throws in production), notice generation/dispatch/routing (`notice-\\\*.ts`), escalation engine, audit logging, encryption/hashing, rate limiting, CSRF, FIR package generation.
* `asmita/src/lib/auth/` — OTP login, JWT (jose), admin allowlist + MFA + permissions.
* `asmita/src/jobs/` — queue abstraction (`queue.ts`): BullMQ when `QUEUE\\\_DRIVER=bullmq` + `REDIS\\\_URL` set, in-memory arrays otherwise; workers for notices, escalation, deletion.
* `asmita/prisma/` — schema, migrations, seeds (notice templates in `template-seeds.ts`).
* `asmita/docs/` — operational/legal/security docs; `docs/ai-agent-handoff.md` is the detailed agent handoff.
* `homepage/` — separate static landing-page prototype (single `index.html`).
* Root `\\\*.md` files (PRD, TRD, implementation plan, UX plan, TODOs) are project planning docs; root `generate\\\_\\\*\\\_pdf` scripts regenerate their PDFs via puppeteer.

Dual-backend pattern: many subsystems (queue, store, rate limit, email) have a memory implementation for dev/test and a real implementation (Prisma/Redis/Resend) selected by env vars. Production code paths must use the Prisma path (`case-ops.ts`), never `store.ts`.

## Next.js Note

Per `asmita/AGENTS.md`: this Next.js version may differ from training data — consult `asmita/node\\\_modules/next/dist/docs/` before writing framework-touching code.

## Deployment

Cloudflare Workers is the selected hosting and backend target. Vercel configuration and Vercel-specific documents are legacy references only.

* Build with `npm run build:vinext`; run the built Worker with `npm run start:vinext`.
* Deploy staging before production with `npm run deploy:staging`; deploy the verified commit with `npm run deploy:production`. These commands use separate Worker names.
* PostgreSQL remains the system of record through Prisma. Prefer Cloudflare Hyperdrive for the Worker-to-PostgreSQL connection; use a direct PostgreSQL URL only as a documented temporary staging fallback.
* Use `DIRECT_URL` only from a trusted migration environment for Prisma migrations. Never expose it to browser code or commit it.
* Scheduled work is database-backed. Cloudflare Cron Triggers call the authenticated cron routes through `src/cloudflare-worker.ts`; do not use in-memory queues in production.
* Production must use database persistence for OTP, audit, security, email proof, and notice dispatch state. Memory persistence is local/test only.
* Store production secrets with `wrangler secret put`; never add secret values to `wrangler.jsonc`, `.env.example`, source, tests, logs, or chat.
* Before production deployment, apply Prisma migrations to staging, run the deployed registration and cron tests, then apply the same migrations to production.
* Follow `asmita/docs/infra/cloudflare-migration.md` as the current deployment runbook.

Production use remains gated on legal, safeguarding (POCSO/minors), security, and accessibility review — see README "Project Status".
