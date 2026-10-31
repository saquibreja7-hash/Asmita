# ADR 004: Platform Stack and Hardening Plan, 2026-2027

Status: accepted (2026-10-31). Decision owner: Saquib.

## Context

After the October 2026 consolidation (PRs #16, #18, #19) a rewrite was considered: TanStack Start for the frontend, Rust for the backend, and moving the database and storage fully onto Cloudflare. Before starting, the stack was reviewed for robustness, security, safety and scale: framework maturity and security history, Cloudflare platform limits and data location, Postgres hosting and Indian law on data location, and the design of a future PDQ hash bank. Sources are listed at the end.

Constraints that drove the decision:

- Survivor data (identity, URLs, fingerprints, evidence) stays in India. Supabase Mumbai gives that; Cloudflare storage products cannot guarantee it.
- The workload is small and I/O-bound: a handful of requests per second at national scale.
- One developer, building with AI assistance. Fewer moving parts beat theoretical performance.
- No budget for paid database plans. AWS credits are being applied for; the database moves to AWS when they arrive.
- Safety rules in `CLAUDE.md` and the tests that enforce them must survive every change.

## Decision

### Stack

```
Next.js 16 on vinext 1.4 (stable) -> Cloudflare Workers, placement hint aws:ap-south-1
  |- Hyperdrive (cache off, verify-full TLS, least-privilege role)
  |     -> Supabase Postgres, Mumbai (Free plan; AWS RDS Mumbai once credits arrive)
  |- Queues (IDs only, idempotent sends) + Cron sweep        dispatch with retries
  |- Rate Limiting binding (edge) + Postgres counters (exact)
  '- Evidence vault: Supabase Storage, Mumbai                only if ADR 002 passes
Off Cloudflare: external uptime monitor
Future: hash bank (TypeScript matcher in Mumbai, envelope-encrypted,
        native Rust past ~1-3M hashes)
```

- **Next.js 16 on vinext.** vinext went stable with 1.0 on 2026-09-28 (the lockfile resolves 1.4.0) and is Cloudflare's documented default for Next.js on Workers.
- **Supabase Postgres in Mumbai through Hyperdrive** stays the system of record.
- **Prisma for schema and migrations, Kysely + `pg` at runtime,** with Kysely types generated from the Prisma schema.
- **Queues** for dispatch. Delivery is at-least-once, so every send carries an idempotency key. Messages carry IDs only. The Cron database sweep stays as a backstop.
- **Rate limiting in two layers:** the Workers binding at the edge (approximate, per location) and exact counters in Postgres for OTP, admin MFA, portal tokens and case creation.

### Supabase Free plan, including launch

Asmita launches on Supabase Free in Mumbai. When AWS credits arrive, the database moves to AWS (RDS for PostgreSQL in Mumbai) by dump and restore plus a Hyperdrive origin change. Free pauses idle projects, so the daily Cron Triggers keep the database active, and the GitHub keepalive workflow stays as a second signal.

### Not now

- **TanStack Start.** 1.0 shipped 2026-10-13; in 2026 it had a critical XSS in server functions (CVE-2026-102989) and a supply-chain compromise of 42 packages (GHSA-g7cv-rxg3-hmpx). Revisit after about 12 months of stable releases with no critical advisories.
- **Rust backend.** On Workers Rust runs as WebAssembly (128 MB per isolate, no threads, no `sqlx`). The backend is I/O-bound, so Rust buys little at a large porting cost.
- **D1, Durable Objects, R2, Containers for survivor data.** Jurisdictions are `eu`, `us` and `fedramp` only. Durable Objects created from Mumbai land in Singapore.
- **Hash bank.** Deferred. When built: runs in India, hashes envelope-encrypted at rest (AES-256-GCM, key outside the database), matched in memory. Keyed hashing or salting is not an option because it breaks Hamming matching. TypeScript first (about 9 ms per query at 1M hashes); native Rust, not wasm, past roughly 1-3M hashes.

### Revisit triggers

- **Framework:** another critical React Server Components advisory, or vinext stalling. Target then: React Router v8 framework mode (official Cloudflare guide, RSC opt-in). Review date: mid-2027.
- **Database:** AWS credits arriving. Target then: RDS for PostgreSQL Mumbai.

## Must-fix issues

Ordered by priority. M items are must-fix before launch; the first block is this week.

### Phase 1: this week (production security)

- [ ] **M1. Supabase Data API exposure.** No migration enables row-level security, and the keepalive reads `/rest/v1/Platform` with the publishable key, so the Data API serves `public`. Check:
  ```sql
  select c.relname, c.relrowsecurity as rls,
    has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
    has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_write
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1;
  ```
  Fix: disable the Data API (the app does not use it), enable RLS on every table in a migration, and revoke `anon` and `authenticated` grants on `public`. Point the keepalive at the app's `/api/health` instead.
- [ ] **M2. Least-privilege database role.** Hyperdrive connects as the `postgres` superuser. Create an app role with only the grants the app needs, and keep `postgres` for migrations.
- [ ] **M3. Hyperdrive TLS.** Upgrade from `require` to `verify-full` with Supabase's CA certificate. (Caching is already disabled.)
- [ ] **M5. Keep-active.** Make sure the daily cron touches the database, and point the keepalive workflow away from the Data API.
- [ ] **M6. Legacy data in Singapore.** `asmita/.env.local` still points at the old Neon database in Singapore. If it holds real data, delete it and decommission the project.
- [ ] **M7. Credential hygiene.** `asmita/.env.staging.local` holds production credentials. Rename it (for example `.env.production.local`) so nothing runs "staging" work against production.

### Phase 2: next (issue #17 and rate limits)

- [x] **M8. Notice integrity, critical.** The fingerprint annex cutoff is case-level, not per notice: `sign-hash-advisory` overwrites `declarationSignedAt`, so a URL notice signed earlier can be dispatched with a fingerprint its signed PDF never listed. Store the exact fingerprint IDs covered by each signed document and dispatch exactly that set.
- [x] **M9. Signed PDF vs email mismatch.** The signed PDF lists PENDING_REVIEW fingerprints, the email lists only APPROVED ones. Make both cover the same set.
- [ ] **M10. Dropped security logs.** `logSecurityEvent` is async but mostly not awaited; on Workers the writes (including `minor_route_blocked`) can be lost. Await them or use `ctx.waitUntil`.
- [ ] **M11. Admin MFA bootstrap.** Email OTP plus the shared `ADMIN_TOTP_SECRET` lets anyone with both enrol an authenticator, including after a reset. Remove the bootstrap once all admins have enrolled, or require out-of-band approval.
- [ ] **M12. Global rate limits.** Limits live in per-isolate memory, so they are not enforced across Workers. Add exact Postgres counters for OTP, admin OTP, `/api/admin/mfa/confirm`, portal tokens and case creation, with the Workers Rate Limiting binding in front.
- [ ] **M13. OTP abuse.** The per-IP limit went from 3/h to 30/h and public mail domains have no throttle. Add a global send budget or Turnstile.
- [ ] **M14. Logout cookie.** Logout clears the admin cookie only at path `/`; a legacy `/admin`-scoped cookie stays valid up to 8 hours. Clear both paths.
- [ ] **M15. ADR 002 warning.** Restore the warning comment on `api/check-image/route.ts`: it forwards media to OpenAI and must never be enabled before legal sign-off.

### Phase 3: then (reliability and maintainability)

- [ ] Generate Kysely types from the Prisma schema with `prisma-kysely`; delete the hand-written types; fail CI on drift.
- [ ] Pin `@vinext/cloudflare` to its stable release (currently 1.0.0-beta.8).
- [ ] Move notice and hash-advisory dispatch to Queues with idempotent sends and a dead-letter queue; keep the Cron sweep as backstop.
- [ ] Add the placement hint `aws:ap-south-1` to the production Worker.

### Phase 4: before launch

- [ ] External uptime monitor (UptimeRobot or Better Stack free tier) on `/` and `/api/health`, alerting by email or phone.
- [ ] Ask counsel about bare PDQ values in outbound notices (hash annex, FORM_ONLY copy text), given PDQ inversion research.

## AWS transition (when credits arrive)

Keep the app on Workers and move the database to RDS for PostgreSQL in Mumbai (automated backups and PITR included, no public Data API). Only adopt pieces that stay affordable after the credits expire.

## Consequences

- No rewrite now. Effort goes to hardening, the issue #17 fixes, rate limiting, Queues and the data-layer cleanup.
- Two vendors: Cloudflare for compute and edge, Supabase (or AWS) in Mumbai for data. This is the price of data residency.
- The project launches on Supabase Free and moves to AWS when credits arrive.
- The framework and hash-bank questions are deferred with explicit triggers, not dropped.

## Sources

- Cloudflare: [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [vinext 1.0](https://blog.cloudflare.com/vinext-nextjs-on-vite/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [placement](https://developers.cloudflare.com/workers/configuration/placement/), [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/), [Durable Objects data location](https://developers.cloudflare.com/durable-objects/reference/data-location/), [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/), [Data Localization Suite regions](https://developers.cloudflare.com/data-localization/region-support/), [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [Rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- Frameworks: [TanStack Start 1.0](https://tanstack.com/blog/tanstack-start-1-0), [CVE-2026-102989](https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989), [GHSA-g7cv-rxg3-hmpx](https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx), [React Router v8](https://remix.run/blog/react-router-v8), [React RSC advisory Oct 2026](https://github.com/facebook/react/security/advisories/GHSA-xqc2-xf4c-x3h3)
- Database and law: [Supabase pricing](https://supabase.com/pricing), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [AWS RDS SLA](https://aws.amazon.com/rds/sla/), [DPDP Rules 2025](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [CERT-In directions 2022](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)
- Hash bank: [Hawkes et al. 2024](https://arxiv.org/abs/2412.06056), [Madden et al. 2024](https://arxiv.org/abs/2406.00918v2), [PDQ multi-index hashing](https://github.com/facebook/ThreatExchange/blob/main/pdq/README-MIH.md), [workers-rs](https://github.com/cloudflare/workers-rs)
- Outages: [18 Nov 2025](https://blog.cloudflare.com/18-november-2025-outage/), [12 Jun 2025](https://blog.cloudflare.com/cloudflare-service-outage-june-12-2025/)
