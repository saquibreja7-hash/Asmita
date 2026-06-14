# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

Asmita is a privacy-preserving NCII (non-consensual intimate imagery) support and notice-routing system for survivor-led URL takedown workflows. It is safety-critical software — treat any change touching URL handling, evidence, outbound notices, minors, platform APIs, or storage as safety-sensitive.

## Core Safety Rules (non-negotiable)

- Phase 1 is **URL-only**: never fetch, resolve, preview, scrape, thumbnail, embed, render, store, or upload submitted intimate media or URLs. This is enforced via architecture, lint tests (`asmita/tests/lint/`), and `src/lib/no-fetch-monitor.ts`.
- Do not store Aadhaar numbers.
- Keep `ENABLE_HASH_UPLOAD=false` and `ENABLE_PLATFORM_API=false` until Phase 2 gates pass.
- Never include real NCII URLs, survivor data, government IDs, or secrets in tests, fixtures, issues, or logs.
- Real notice dispatch is gated on human verification of platform contacts, sender domains, and templates.

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

- `asmita/src/app/` — route groups: `(public)`, `(victim)`, `(admin)`, `(auth)`, plus `api/` (cases, notices, admin, auth, cron, webhooks, ngo, platforms).
- `asmita/src/lib/` — core domain logic: case lifecycle (`case-ops.ts` = Prisma path; `store.ts` = in-memory dev/test store that throws in production), notice generation/dispatch/routing (`notice-*.ts`), escalation engine, audit logging, encryption/hashing, rate limiting, CSRF, FIR package generation.
- `asmita/src/lib/auth/` — OTP login, JWT (jose), admin allowlist + MFA + permissions.
- `asmita/src/jobs/` — queue abstraction (`queue.ts`): BullMQ when `QUEUE_DRIVER=bullmq` + `REDIS_URL` set, in-memory arrays otherwise; workers for notices, escalation, deletion.
- `asmita/prisma/` — schema, migrations, seeds (notice templates in `template-seeds.ts`).
- `asmita/docs/` — operational/legal/security docs; `docs/ai-agent-handoff.md` is the detailed agent handoff.
- `homepage/` — separate static landing-page prototype (single `index.html`).
- Root `*.md` files (PRD, TRD, implementation plan, UX plan, TODOs) are project planning docs; root `generate_*_pdf` scripts regenerate their PDFs via puppeteer.

Dual-backend pattern: many subsystems (queue, store, rate limit, email) have a memory implementation for dev/test and a real implementation (Prisma/Redis/Resend) selected by env vars. Production code paths must use the Prisma path (`case-ops.ts`), never `store.ts`.

## Next.js Note

Per `asmita/AGENTS.md`: this Next.js version may differ from training data — consult `asmita/node_modules/next/dist/docs/` before writing framework-touching code.

## Deployment

Vercel, Mumbai region (`bom1`). Production use is gated on legal, safeguarding (POCSO/minors), security, and accessibility review — see README "Project Status".
