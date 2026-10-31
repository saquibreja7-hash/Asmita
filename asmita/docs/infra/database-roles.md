# Database Roles and TLS

ADR 004 (M1-M3). The app connects through Hyperdrive as a login role that is a member of `asmita_app`, not as `postgres`. Every table has row-level security; only `asmita_app` has a policy, and Supabase's Data API roles (`anon`, `authenticated`) have no grants.

| Role | Used by | Can do |
|---|---|---|
| `postgres` | Prisma migrations only (`DIRECT_URL`) | Everything |
| `asmita_app` (no login) | Grouping role for the app | Read and write app tables; `audit_log` is insert-only |
| `asmita_worker` (login, member of `asmita_app`) | Hyperdrive in production | Same as `asmita_app` |
| `anon`, `authenticated` | Supabase Data API | Nothing |

CI checks all of this against a real Postgres (`scripts/check-db-privileges.mjs`), and `tests/unit/migrations-rls.test.ts` fails if a new table is created without row-level security and a policy.

## Production rollout

The migration is safe to apply while Hyperdrive still connects as `postgres`, because table owners bypass row-level security.

1. **Apply the migration** from `asmita/`, with `DIRECT_URL` from `.env.production.local`:
   ```bash
   npx prisma migrate deploy
   ```
2. **Confirm the Data API is closed.** In the Supabase SQL editor:
   ```sql
   select c.relname, c.relrowsecurity as rls,
     has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' order by 1;
   ```
   Every app table should show `rls = true` and `anon_access = false`. Optionally also turn off the Data API under Project Settings, Data API.
3. **Create the login role** in the SQL editor, with a long random password:
   ```sql
   CREATE ROLE asmita_worker LOGIN PASSWORD '<random password>' IN ROLE asmita_app;
   ```
4. **Upload Supabase's CA certificate.** Download it from the Supabase dashboard (Database settings, SSL Configuration), then:
   ```bash
   npx wrangler cert upload certificate-authority --ca-cert <downloaded.crt> --name supabase-ca
   ```
   Note the certificate ID it prints.
5. **Switch Hyperdrive** (production config `36433621ad834c41abbccdf8a09ba845`):
   ```bash
   npx wrangler hyperdrive update 36433621ad834c41abbccdf8a09ba845 \
     --origin-user asmita_worker --origin-password '<random password>' \
     --ca-certificate-id <certificate id> --sslmode verify-full
   ```
   Pass the password as an argument, not through stdin.
6. **Verify.** The authenticated health check must return `"db":"ok"`, and `/`, `/start`, `/research` must return 200:
   ```bash
   curl -s -H "Authorization: Bearer <CRON_SECRET>" https://meriasmita.org/api/health
   ```
   Watch `npx wrangler tail asmita-production` for permission errors while using the site.

**Rollback:** run step 5 again with `--origin-user postgres`, its password and `--sslmode require`.

## Keepalive

`.github/workflows/supabase-keepalive.yml` calls the authenticated health check daily so Supabase Free never pauses the project. It needs the repository secret `CRON_SECRET`, set to the same value as the Worker secret.
