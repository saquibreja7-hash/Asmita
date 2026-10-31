# Database Roles and TLS

ADR 004 (M1-M3). The app connects through Hyperdrive as a login role that is a member of `asmita_app`, not as `postgres`. Every table has row-level security; only `asmita_app` has a policy, and Supabase's Data API roles (`anon`, `authenticated`) have no grants.

| Role | Used by | Can do |
|---|---|---|
| `postgres` | Prisma migrations only (`DIRECT_URL`) | Everything |
| `asmita_app` (no login) | Grouping role for the app | Read and write app tables; `audit_log` is insert-only |
| `asmita_worker` (login, member of `asmita_app`) | Hyperdrive in production | Same as `asmita_app` |
| `anon`, `authenticated` | Supabase Data API | Nothing |

The e2e suite runs on a real Postgres shaped like Supabase (`tests/e2e/global-setup.ts`), with the dev server connected as a member of `asmita_app`. `tests/e2e/database-hardening.spec.ts` walks a survivor report through the app, then checks that `anon` and `authenticated` cannot read or edit anything and that the app cannot rewrite `audit_log`.

Local run: start Postgres 17 on port 5433 (`docker run -d --name asmita-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=asmita_e2e -p 5433:5432 postgres:17`), then `npm run test:e2e`.

## Production rollout

The migration is safe to apply while Hyperdrive still connects as `postgres`, because table owners bypass row-level security.

0. **Before deploying this release,** generate a new random value and set it in both places, so the keepalive keeps working:
   ```bash
   npx wrangler secret put HEALTH_CHECK_SECRET --name asmita-production
   ```
   and as the GitHub repository secret `HEALTH_CHECK_SECRET`.

1. **Apply the migration** from `asmita/`, with `DIRECT_URL` from `.env.production.local`. It requires Postgres 17 (check with `show server_version;` in the SQL editor) and refuses to run on older servers:
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
5. **Switch Hyperdrive** (production config `36433621ad834c41abbccdf8a09ba845`). In PowerShell, read the password into a variable so it never lands in shell history, then pass it as an argument (not through stdin):
   ```powershell
   $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host -AsSecureString 'asmita_worker password')))
   npx wrangler hyperdrive update 36433621ad834c41abbccdf8a09ba845 --origin-user asmita_worker --origin-password $p --ca-certificate-id <certificate id> --sslmode verify-full
   Remove-Variable p
   ```
6. **Verify.** The authenticated health check must return `"db":"ok"`, and `/`, `/start`, `/research` must return 200:
   ```bash
   curl -s -H "Authorization: Bearer <HEALTH_CHECK_SECRET>" https://meriasmita.org/api/health
   ```
   Watch `npx wrangler tail asmita-production` for permission errors while using the site.

**Rollback:** run step 5 again with `--origin-user postgres`, its password and `--sslmode require`.

## Adding a table

Run migrations as `postgres`: default privileges only cover tables that role creates (Supabase's own `supabase_admin` defaults still grant `anon` on tables it creates, which is why the e2e journey checks every table in `public`). A new table automatically gives `asmita_app` select, insert, update and delete. In the same migration:

- enable row-level security and add the `asmita_app_all` policy, or the app role cannot see its rows and the e2e journeys fail;
- for an append-only table, `REVOKE UPDATE, DELETE` from `asmita_app`, as for `audit_log`.

## Keepalive

`.github/workflows/supabase-keepalive.yml` calls the authenticated health check daily so Supabase Free never pauses the project. It needs the repository secret `HEALTH_CHECK_SECRET`, set to the same value as the Worker secret of that name. Use its own random value, never `CRON_SECRET`: the health check only reads status, while the cron secret can trigger notice sweeps.
