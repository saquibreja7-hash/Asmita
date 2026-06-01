# Contributing to Asmita

Thank you for helping improve Asmita. This project sits in a sensitive safety domain, so good contributions are careful, minimal, well-tested, and privacy-preserving.

## Before You Start

- Do not add real NCII URLs, survivor names, phone numbers, email addresses, government IDs, screenshots, platform credentials, or case data.
- Do not add code that fetches, previews, thumbnails, embeds, stores, or uploads intimate media.
- Do not bypass human review gates for notice templates, platform contacts, minors, or outbound dispatch.
- Treat logs, test fixtures, screenshots, and error messages as public.

## Local Development

```bash
cd asmita
npm ci
cp .env.example .env.local
npm run dev
```

## Checks

Run the narrowest useful checks for your change, and prefer the full set before larger pull requests:

```bash
cd asmita
npm run lint
npm run type-check
npm run test
npm run prisma:validate
```

For UI or flow changes, also run:

```bash
npm run test:e2e
npm run test:a11y
```

## Pull Request Expectations

Good pull requests include:

- a clear explanation of the user or maintainer problem
- the safety/privacy impact of the change
- tests or a reason tests are not practical
- screenshots only when they contain no sensitive data
- notes on any migration, environment, or operational change

## Safety-Sensitive Areas

Please open an issue or discussion before changing:

- URL parsing or URL storage
- evidence handling
- notice dispatch
- legal template content
- minor/safeguarding flows
- audit-chain logic
- admin permissions
- platform API integrations
- database encryption or retention behavior

## Reporting Security Issues

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).
