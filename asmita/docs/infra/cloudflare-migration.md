# Cloudflare migration runbook

This is the current deployment runbook for Asmita. Older Vercel documents describe the previous architecture and are historical references only.

## Target architecture

| Concern | Cloudflare target |
| --- | --- |
| Web application and API | Cloudflare Workers using vinext |
| Static assets | Workers Assets |
| Case database | PostgreSQL through Hyperdrive, `pg`, and Kysely at Worker runtime |
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

### Production database and staging isolation

| Setting | Value |
| --- | --- |
| PostgreSQL provider | Supabase |
| Project | `asmita-staging` (now the production system of record) |
| Project reference | `rijfuazecspigawklwuv` |
| Region | South Asia (Mumbai), `ap-south-1` |
| Data API | Disabled; the application connects through PostgreSQL |
| Permitted data | Production data, subject to the applicable safeguards |

`asmita-production` connects to this database through `asmita-production-db` (`36433621ad834c41abbccdf8a09ba845`). The `asmita-staging` Worker is deliberately deployed without a Hyperdrive binding or Cron Triggers while no separate staging database exists. It must not be used for application testing until a new Mumbai staging project and Hyperdrive configuration are created.

Keep database passwords and connection strings only in ignored local environment files, Cloudflare secrets, and approved secret stores.

## Account setup

Run these commands locally. Complete browser login yourself; never paste a Cloudflare API token into chat.

```powershell
npx wrangler login
npx wrangler whoami
```

If `whoami` cannot list an account, refresh the login or use a token with Workers Scripts, Workers Routes, Hyperdrive, and account-read permissions. Set `CLOUDFLARE_ACCOUNT_ID` locally if the token cannot enumerate accounts.

## PostgreSQL and Hyperdrive

PostgreSQL remains the system of record. The deployed Worker uses the `pg` driver with Kysely for typed, parameterised queries. Each Worker request opens a short-lived `pg.Client` against the `HYPERDRIVE.connectionString`; Hyperdrive owns the shared connection pool. The Worker must not initialise PrismaClient at runtime.

Prisma remains in this repository for migration history, schema validation, generated local types, and the local non-Worker fallback. Prisma migrations use `DIRECT_URL` from a trusted local or CI migration environment. Hyperdrive is for Worker traffic, not schema administration.

Create a separate Hyperdrive configuration per environment and add its returned ID to the Wrangler configuration as the `HYPERDRIVE` binding. The staging binding is `asmita-staging-db` (`5f54acb46aac45beb104c5d6eaaa9b90`). Never reuse it for production.

## Required Worker secrets

Set secrets separately with `npx wrangler secret put NAME --name asmita-staging` or `--name asmita-production`:

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

`DATABASE_URL` is set by `src/cloudflare-worker.ts` from the Hyperdrive binding, and `ASMITA_DATABASE_DRIVER=pg` is set there as an internal Worker runtime switch. Do not create either as a public variable or Worker secret. Keep `DIRECT_URL` only in an ignored migration environment.

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
npm run test
npm run build
npm run build:vinext
npm run deploy:staging
```

Set `ASMITA_PROD_URL` to the staging URL despite the historical variable name, set `ASMITA_CRON_SECRET` locally, and run:

```powershell
npx playwright test tests/e2e/cron-smoke.spec.ts --project=chromium
```

Run `npm run type-check` separately. It must pass before production promotion; generated `.next` route type errors should be repaired or the build output regenerated instead of being ignored.

## Staging registration proof

Use synthetic test data only. Verify:

1. Adult registration requests and verifies an OTP. Use a verified Resend staging sender and inbox for the real email-delivery proof.
2. A URL-only case reaches its dashboard and remains visible after a fresh sign-in.
3. Retrying the registration request with the same idempotency key returns the same case without a duplicate row.
4. The case and audit data persist in the staging PostgreSQL database.
5. Confirm both authenticated cron endpoints return successful summaries.
6. Seed one synthetic, template-less, due notice with an `example.invalid` URL; the sweep must report `blocked_no_template`, with zero fired notices and zero errors. Remove that fixture and its audit record immediately after the test.

Hash-only and URL-plus-fingerprint flows require their own approved staging test plan. They must remain URL/hash-only: never upload, fetch, render, cache, or store intimate media.

Do not run the cron smoke test against production if it could fire real escalations or deletion work.

## Production promotion

Promote only the exact commit verified in staging. Apply the same Prisma migrations to production, configure production bindings and secrets, run `npm run deploy:production`, and run read-only health checks first. Record the deployed commit, migration names, Worker version, and rollback version.

## Rollback

Use Cloudflare Worker version rollback for application failures. Do not automatically roll back a Prisma migration. Restore application compatibility first; reverse a database migration only with a reviewed data-preserving procedure.
