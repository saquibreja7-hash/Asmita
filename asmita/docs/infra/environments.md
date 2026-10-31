# Environment Provisioning Checklist

Asmita runs on Cloudflare Workers with production data on Supabase (Mumbai, `ap-south-1`) through Hyperdrive. Scheduled work uses Cron Triggers plus database sweeps. The deployment runbook is `docs/infra/cloudflare-migration.md`.

Asmita uses three isolated environments. Never reuse production secrets in local or staging.

## Local

- Runtime: developer machine (`npm run dev`, or `npm run dev:vinext` for the Worker build).
- Database: memory store by default; set `DATABASE_URL` in `.env.local` to use local PostgreSQL through Prisma.
- Rate limit: `RATE_LIMIT_DRIVER=memory`.
- Email proof persistence: `EMAIL_PROOF_PERSISTENCE=memory`.
- Email: no real notice dispatch; dev OTP may be returned only outside production.
- Required checks: `npm run lint`, `npm run type-check`, `npm run test`, `npm run build`.

## Staging

- Worker: `asmita-staging`.
- Database: none yet. Staging has no Hyperdrive binding or Cron Triggers and must not be pointed at production data or used for app testing until a separate staging database exists.
- Secrets: staging keys and API tokens only, set with `wrangler secret put`.
- Email: verified staging sender or sandbox provider account; no notices to unverified GO contacts.

## Production

- Worker: `asmita-production` on `meriasmita.org` and `www.meriasmita.org`.
- Database: Supabase PostgreSQL, Mumbai, through Hyperdrive. Persistence for OTP, audit, security log, email proof and notice dispatch is `database`.
- Scheduled work: Cron Triggers (`30 20 * * *`, `30 22 * * *`).
- Secrets: `wrangler secret put` only, with rotation recorded in the incident log.
- Email: Resend, with SPF, DKIM and DMARC verified before any real notice (see `docs/infra/email-dns.md`).
- Required smoke checks: `/`, `/start`, `/research`, `/api/health`.
- Launch gate: legal sign-off on notice templates, NGO partnership, POCSO protocol, GO contact verification.

## Secret Rules

- Do not commit real `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, API tokens, webhook URLs, or TOTP secrets.
- Never set `DEV_SKIP_LEGAL_REVIEW` or `DEV_OTP_CODE` in `wrangler.jsonc`, Worker secrets, or any deployed environment.
- Keep production notice sending disabled unless template, GO contact, and email-domain gates all pass.
- Rotate any secret suspected of exposure and record the rotation in the incident log.

## Smoke-Test Evidence

For staging and production, record:

- Worker version id and git commit
- environment name
- `/api/health` result
- admin route smoke result
- victim-flow smoke result
- rollback target version id (`wrangler rollback`)
- operator name and timestamp
