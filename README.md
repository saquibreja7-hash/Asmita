# Asmita

Asmita is an open-source, privacy-preserving NCII support and notice-routing system for survivor-led URL takedown workflows.

The project is designed for a sensitive safety context: helping adults document non-consensual intimate image abuse, generate structured takedown notices, track escalation, and preserve an audit trail without fetching, previewing, scraping, storing, or re-uploading intimate media.

## Why This Matters

Non-consensual intimate image abuse often forces survivors to navigate platform forms, grievance-officer contacts, legal language, and repeated follow-ups while under acute stress. Asmita explores a safer software pattern for this workflow:

- collect only the minimum case data needed for a URL-based takedown request
- never fetch or render submitted intimate content
- generate notice packages from reviewed templates
- preserve evidence and operational audit trails
- support administrator review before sensitive outbound actions
- keep legal, safety, and infrastructure gates explicit

Asmita is not legal advice and should not be deployed for real cases without qualified legal, security, safeguarding, and operational review.

## Repository Layout

```text
asmita/                 Next.js application, Prisma schema, tests, docs
homepage/               Static public landing-page prototype
PRD_Asmita.md           Product requirements and policy context
TRD_Asmita.md           Technical requirements
IMPLEMENTATION_PLAN_Asmita.md
UXUI_DESIGN_PLAN_Asmita.md
TODO_Asmita.md
TODOS.md
```

## Core Safety Rule

Asmita Phase 1 is URL-only. The application must not fetch, preview, scrape, thumbnail, store, or upload intimate images or videos.

That rule is enforced through architecture, tests, review guidance, and documentation. If a proposed change touches URL handling, evidence handling, outbound notices, minors, platform APIs, or storage, treat it as safety-sensitive.

## Quick Start

```bash
cd asmita
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The default local configuration uses memory-backed queues, rate limits, audit persistence, and email delivery proof unless PostgreSQL, Redis, and provider secrets are configured.

## Useful Commands

```bash
cd asmita
npm run lint
npm run type-check
npm run test
npm run build
npm run test:e2e
npm run security:audit
npm run prisma:validate
```

## Technology

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- Redis/BullMQ
- Vitest
- Playwright
- Resend-compatible email delivery

## Project Status

Asmita is an early-stage public-interest software project. The application has substantial implementation work in place, but production use remains gated on:

- legal review
- safeguarding and POCSO/minor handling protocol
- verified platform contact data
- security review
- accessibility review
- infrastructure hardening
- human-run operational playbooks

## Contributing

Contributions are welcome, especially around:

- safety-preserving URL intake
- test coverage
- accessibility
- documentation
- operational playbooks
- admin review tooling
- privacy and security hardening

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before opening issues or pull requests.

Do not include real NCII URLs, survivor personal data, government IDs, secrets, credentials, or sensitive evidence in issues, pull requests, screenshots, tests, fixtures, or logs.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
