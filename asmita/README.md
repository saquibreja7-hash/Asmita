# Asmita

Asmita is an NCII support and notice-routing application for adult self-submission. A case can include post URLs as text and fingerprints generated on the user's device. The separate AI checker can inspect provenance locally or perform a consented deeper provider check.

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

## Current data handling

- Do not fetch, resolve, preview, embed, or render submitted URLs.
- Image provenance can be checked locally; the optional deeper check forwards a selected image to its provider only with explicit consent and keeps no server copy.
- Do not store Aadhaar numbers.
- Do not send real notices until platform contacts, sender domains, and templates are human-verified.
- Adults can generate PDQ fingerprints on their device and submit the hash code with a case. Platform API dispatch remains disabled until its contacts and integration are verified.

## Operational Docs

- Environment checklist: `docs/infra/environments.md`
- Rollback plan: `docs/infra/rollback.md`
- Email DNS: `docs/infra/email-dns.md`
- Incident runbooks: `docs/ops/incident-runbooks.md`
- Non-response escalation: `docs/ops/non-response-escalation-playbook.md`

## Deployment

Cloudflare Workers is the selected hosting and backend target. The vinext build in `vite.config.ts` and `wrangler.jsonc` builds and renders locally. PostgreSQL remains the system of record, and Cloudflare Cron Triggers invoke the database-backed sweep routes. Production deployment still requires Cloudflare account authentication, staging database and Hyperdrive setup, staging migrations and workflow proof, email DNS verification, GO contact verification, legal and POCSO review, security review, and accessibility sign-off.
