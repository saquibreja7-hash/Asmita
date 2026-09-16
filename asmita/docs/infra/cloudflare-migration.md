# Cloudflare migration runbook

This is the current deployment runbook for Asmita. Older Vercel documents describe the previous architecture and are historical references only.

## Target architecture

| Concern | Cloudflare target |
| --- | --- |
| Web application and API | Cloudflare Workers using vinext |
| Static assets | Workers Assets |
| Case database | Existing PostgreSQL schema through Prisma; Hyperdrive preferred |
| Scheduled work | Cloudflare Cron Triggers plus PostgreSQL-backed sweep routes |
| Email | Resend |
| Secrets | Cloudflare Worker secrets |
| Local tests | Memory-backed implementations remain supported |

Cloudflare Queues are not required for the first migration. The existing database sweeps already provide durable scheduled work. Introduce Queues later only for jobs that need immediate asynchronous processing or independent retry policies.

## Environments

Use separate Cloudflare Workers and separate databases:

* `asmita-staging` connects only to the staging PostgreSQL database.
* `asmita-production` connects only to the production PostgreSQL database.
* Never point a staging Worker at production data.

Deployment scripts use the separate Worker names `asmita-staging` and `asmita-production`. vinext generates a flattened Wrangler configuration, so do not rely on Wrangler `env` inheritance for these deployments.

## Account setup

Run these commands locally. Complete browser login yourself; never paste a Cloudflare API token into chat.

```powershell
npx wrangler login
npx wrangler whoami
```

If `whoami` cannot list an account, refresh the login or use a token with Workers Scripts, Workers Routes, Hyperdrive, and account-read permissions. Set `CLOUDFLARE_ACCOUNT_ID` locally if the token cannot enumerate accounts.

## PostgreSQL and Hyperdrive

Keep Prisma/PostgreSQL during this migration. A D1 move would require a separate schema and query migration.

Create separate Hyperdrive configurations for staging and production from a trusted terminal. The connection string is sensitive; do not save the command in shell history where others can read it.

After creation, add each returned Hyperdrive ID to the corresponding Wrangler environment as a binding named `HYPERDRIVE`. Application wiring must be verified with a deployed staging registration before removing the direct `DATABASE_URL` fallback.

Prisma migrations use `DIRECT_URL` outside the Worker. Hyperdrive is for runtime application traffic, not schema administration.

## Required Worker secrets

Set secrets separately with `npx wrangler secret put NAME --name asmita-staging` or `--name asmita-production`:

* `DATABASE_URL` during the direct-connection staging phase
* `ENCRYPTION_KEY`
* `JWT_SECRET`
* `CSRF_SECRET`
* `CRON_SECRET`
* `RESEND_API_KEY`
* `RESEND_WEBHOOK_SECRET`
* `OPENAI_API_KEY` when the deeper image check is enabled
* `ADMIN_EMAILS` and other admin settings

Set non-secret production values through Wrangler environment variables. Required persistence settings are:

```text
OTP_PERSISTENCE=database
AUDIT_LOG_PERSISTENCE=database
SECURITY_LOG_PERSISTENCE=database
EMAIL_PROOF_PERSISTENCE=database
NOTICE_DISPATCH_PERSISTENCE=database
ENABLE_HASH_UPLOAD=true
```

Do not set `QUEUE_DRIVER=bullmq` on Workers. The current migration uses the database-backed cron sweeps; the legacy in-process queue arrays are not a production delivery mechanism. Add Cloudflare Queues only when an actively consumed asynchronous job path is introduced.

Keep `ENABLE_PLATFORM_API=false` until each external platform integration is configured and tested.

## Database migration sequence

From `asmita/`, with `DIRECT_URL` pointing to the staging database:

```powershell
npm ci
npm run prisma:validate
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

The current redesign adds migrations for confirmed admin MFA enrollment and case-registration idempotency. Record the migration output in the deployment evidence without recording connection strings.

## Build and deploy staging

```powershell
npm run lint
npm run type-check
npm run test
npm run build
npm run build:vinext
npm run deploy:staging
```

Set `ASMITA_PROD_URL` to the staging URL despite the historical variable name, set `ASMITA_CRON_SECRET` locally, and run:

```powershell
npx playwright test tests/e2e/cron-smoke.spec.ts --project=chromium
```

## Staging registration proof

Use synthetic test data only. Verify:

1. Adult registration requests and verifies an OTP.
2. A URL-only case reaches its dashboard.
3. A URL plus on-device fingerprint case stores both records.
4. A hash-only case reaches its selected platform handoff.
5. Log out, sign in again, and confirm the cases remain present.
6. Confirm the database contains one user and the expected cases without duplicate registration rows.
7. Confirm both authenticated cron endpoints return successful summaries.

Do not run the cron smoke test against production if it could fire real escalations or deletion work.

## Production promotion

Promote only the exact commit verified in staging. Apply the same Prisma migrations to production, configure production bindings and secrets, run `npm run deploy:production`, and run read-only health checks first. Record the deployed commit, migration names, Worker version, and rollback version.

## Rollback

Use Cloudflare Worker version rollback for application failures. Do not automatically roll back a Prisma migration. Restore application compatibility first; reverse a database migration only with a reviewed data-preserving procedure.
