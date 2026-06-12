# Vercel + Azure Deployment Guide

**Status:** Pre-launch checklist. Each step needs human action — none of this can be done from inside the codebase.

**Decisions locked on 2026-05-17**

| Concern | Choice |
|---|---|
| App hosting | Vercel (pinned to Mumbai `bom1` in `vercel.json`) |
| Database | Azure Database for PostgreSQL Flexible Server, free tier |
| Email | Resend |
| Identity verification | Email OTP only (no Aadhaar / no PAN / no KYC docs) |
| Hindi UI strings | AI-drafted, flagged for native review (`src/i18n/hi-review-status.json`) |

---

## 1. Azure: provision PostgreSQL

1. Sign in to the Azure portal.
2. Create resource → **Azure Database for PostgreSQL — Flexible Server**.
3. Region: **Central India** (lowest RTT from `bom1`).
4. Workload tier: **Free** (during the 12-month free window) or **Burstable B1ms** (cheapest paid).
5. Compute + storage: free-tier defaults (1 vCore, 32 GB).
6. Authentication: **PostgreSQL authentication only**, set a strong admin password.
7. Networking → **Public access**. Add the Vercel egress IPs as firewall rules, OR set **"Allow public access from any Azure service"** for the pre-launch phase (tighten before launch). Also tick **"Allow access from Azure services"**.
8. Create databases `asmita` and `asmita_shadow` (the second only needed if running `prisma migrate dev` against the remote DB).
9. Note the host: `<server-name>.postgres.database.azure.com`.
10. SSL is mandatory on Azure Postgres. The connection string must end with `?sslmode=require`.

Connection string format:
```
postgresql://<admin>@<server-name>:<password>@<server-name>.postgres.database.azure.com:5432/asmita?sslmode=require
```

## 2. Vercel: connect the repo

1. Push the codebase to a GitHub repo.
2. In Vercel → Add New… → Project → import the repo.
3. Framework preset: **Next.js** (auto-detected). Build/install commands come from `vercel.json` already.
4. Region: confirm `bom1` (Mumbai). It is pinned in `vercel.json` but verify the Vercel UI shows it.
5. **Environment variables** — paste from `.env.example`, filling in production values:
   - `DATABASE_URL`, `DIRECT_URL` — the Azure connection string from step 1.10.
   - `SHADOW_DATABASE_URL` — leave unset in Vercel; only needed for local `prisma migrate dev`.
   - `ENCRYPTION_KEY`, `JWT_SECRET`, `CSRF_SECRET` — each from `openssl rand -hex 32`. Different value per env.
   - `RESEND_API_KEY` — see step 3.
   - `RESEND_FROM_EMAIL`, `EMAIL_FROM`, `NOTICE_EMAIL_FROM`, `TRANSACTIONAL_EMAIL_FROM` — final addresses on the verified domain.
   - `REDIS_URL` — see step 4.
   - `QUEUE_DRIVER`, `RATE_LIMIT_DRIVER`, `EMAIL_PROOF_PERSISTENCE`, `AUDIT_LOG_PERSISTENCE`, `SECURITY_LOG_PERSISTENCE` — set each to `redis` (or your chosen persistence backend) in production. Leave at `memory` only in preview.
   - `NEXT_PUBLIC_APP_URL=https://meriasmita.org` (or the final domain).
   - `ADMIN_EMAILS`, `ADMIN_OTP_EMAIL` — actual admin addresses.
   - `ADMIN_TOTP_SECRET` — base32 string, paired with the authenticator app for each admin.
   - `CRON_SECRET` — `openssl rand -hex 32`. Used by `/api/cron/*` routes to authenticate Vercel Cron.
6. **Deploy** — first deploy will fail unless the database is reachable. Verify the firewall.
7. **Run migrations** — locally with `prisma migrate deploy` against the Azure DATABASE_URL, OR via a one-shot Vercel build hook script. Do not run `prisma migrate dev` against production.

## 3. Resend: domain + API key

1. Sign in to Resend.
2. **Add Domain** → `meriasmita.org` (or the final domain).
3. Resend issues four DNS records: SPF, DKIM, DKIM, MX-or-Return-Path. Add all four to the domain registrar.
4. After the domain shows **Verified**, also add a DMARC record manually:
   - Initial: `v=DMARC1; p=quarantine; rua=mailto:dmarc@meriasmita.org`
   - After 2 weeks of clean sending, upgrade to `p=reject`.
5. **API Keys** → create a key with `Sending Access`. Paste into Vercel as `RESEND_API_KEY`.
6. IP warm-up: send <50 mails/day for the first week, doubling per week until normal volume. Resend does some of this automatically; monitor `Reputation` in the dashboard.

## 4. Redis: managed instance

Options, in order of preference for Vercel:

1. **Upstash Redis** — Vercel marketplace integration, regional, free tier covers pre-launch.
2. **Azure Cache for Redis (Basic C0)** — kept inside the Azure subscription with the DB. Slightly higher RTT than Upstash but simpler billing.

Set `REDIS_URL` from whichever you pick. Vercel `bom1` → Upstash `ap-south-1` is the lowest-latency pairing.

## 5. Cron jobs (escalation, deletion sweep)

Current escalation worker uses BullMQ (`src/jobs/escalation-worker.ts`). BullMQ requires a long-lived process and **does not run on Vercel**. Two production options:

1. **Vercel Cron + Postgres-backed schedule** (recommended for pre-launch).
   - Add cron entries to `vercel.json`:
     ```json
     "crons": [
       { "path": "/api/cron/escalation-tick", "schedule": "*/15 * * * *" },
       { "path": "/api/cron/deletion-sweep", "schedule": "0 3 * * *" }
     ]
     ```
   - Add `/api/cron/escalation-tick` and `/api/cron/deletion-sweep` route handlers that verify `Authorization: Bearer ${CRON_SECRET}` and call into the existing engine functions (`runDueEscalations`, deletion worker).
   - **This refactor is not yet done in code** — track it before public launch.
2. **Separate worker on a tiny VM / Container App.** Run BullMQ as-is. More moving parts.

## 6. Pre-launch security gates

Before flipping the domain DNS to Vercel:

- [ ] DMARC live at `p=quarantine` (then `p=reject` after 2 weeks of clean send).
- [ ] Azure DB firewall narrowed from "Allow all Azure services" to Vercel egress IP ranges only.
- [ ] All five `*_PERSISTENCE` env vars set to a real backend (Redis or DB), not `memory`.
- [ ] Production secrets distinct from staging.
- [ ] `prisma migrate status` clean on the production DB.
- [ ] Backup retention: Azure default is 7 days. Bump to **35 days** for the production server, free.
- [ ] Restore drill: snapshot the production DB, restore to a scratch instance, confirm data legible. Document the runbook in `docs/infra/rollback.md`.

## 7. What is NOT covered by this guide

These are out-of-scope until a separate decision:

- Legal entity, GST registration, bank account.
- Tier 1/2/3 Grievance Officer contact data entry.
- Hindi translation review by a qualified human.
- Independent WCAG 2.2 AA accessibility audit.
- External penetration test on staging.
- POCSO reporting protocol opinion.
