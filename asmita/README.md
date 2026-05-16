# Asmita

Asmita is a privacy-preserving NCII support and notice-routing application for adult victim self-submission. Phase 1 is URL-only: the app must never fetch, preview, scrape, thumbnail, store, or upload intimate media.

## Getting Started

Install dependencies and run the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Use `.env.example` as the variable checklist. Local development defaults to memory-backed queues, rate limits, audit persistence, and email delivery proof unless you explicitly configure PostgreSQL, Redis, and provider secrets.

## Core Commands

```bash
npm run lint
npm run type-check
npm run test
npm run build
npm run test:e2e
```

## Safety Rules

- Do not fetch, resolve, preview, embed, or render submitted URLs.
- Do not store intimate image or video files in Phase 1.
- Do not store Aadhaar numbers.
- Do not send real notices until platform contacts, sender domains, and templates are human-verified.
- Keep `ENABLE_HASH_UPLOAD=false` and `ENABLE_PLATFORM_API=false` until Phase 2 gates pass.

## Operational Docs

- Environment checklist: `docs/infra/environments.md`
- Rollback plan: `docs/infra/rollback.md`
- Email DNS: `docs/infra/email-dns.md`
- Incident runbooks: `docs/ops/incident-runbooks.md`
- Non-response escalation: `docs/ops/non-response-escalation-playbook.md`

## Deployment

`vercel.json` targets the Mumbai region (`bom1`). Production deployment still requires human-owned infrastructure setup, India-region database/Redis provisioning, email DNS verification, legal review, POCSO protocol approval, GO contact verification, security review, and accessibility sign-off.
