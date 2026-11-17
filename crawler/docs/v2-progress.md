# Crawler v2 progress

One entry per work package, appended after its checks pass (spec: `full-crawler-spec.md`, "Reporting"). Nothing here claims a check that was not run.

## WP1. Sites from survivor reports (app) — 2026-11-17

**Status: complete. All checks passed** (`check.sh`, both packages, Node 22).

**What was built**

- `CrawlSource` gained `origin` (`ADMIN` default, `REPORTED`, `DISCOVERED`), `hops` (default 0), `discoveredFromId`, `render` (`HTTP` default, `BROWSER`, `AUTO`), `lastCrawledAt` and `pagesCrawled` (default 0). Additive migration `asmita/prisma/migrations/20261117000000_crawl_source_origins/`; existing rows read as `ADMIN`.
- New `CrawlBlockedHost` table (host unique, reason, addedBy, createdAt). The admin API for it is WP2; the table and its matching rule are live now.
- New `asmita/src/lib/crawl-never.ts`: the built-in never-crawl list (major social platforms, search engines, app stores, webmail, banks and payment sites, government `*.gov.*` and `*.nic.in`, news wires, Asmita's own domains) with the "equals or subdomain" rule. `*.gov.*` is read fail-safe as "any hostname with a label `gov`", so `whitehouse.gov` (where `gov` is the last label) is covered too.
- `ensureCrawlSourceForReportedHost` (`asmita/src/lib/crawl-sources.ts`): creates one enabled `REPORTED` source (host only, never the link or the case, no approver) with the env defaults, idempotent per host, race-safe (unique `domain`; ON CONFLICT DO NOTHING on Kysely, P2002 catch on Prisma). Skips never-crawl hosts: the built-in list first, then the `CrawlBlockedHost` table (host and every parent domain, one indexed lookup per name). Writes a `CRAWL_SOURCE_REPORTED` audit entry on the new source only — no actor, no case.
- Hooks: `addUrlsToCase` and `registerCaseWithUrls` (`asmita/src/lib/case-ops.ts`) and final finding approval (`asmita/src/lib/crawl-findings.ts`). A failure while creating a source never fails the survivor's action (fixed error code only, never her host).
- Env defaults, read only in `asmita/src/lib/crawler-flags.ts`: `CRAWLER_REPORTED_PAGE_BUDGET` (2000), `CRAWLER_DISCOVERED_PAGE_BUDGET` (200, used from WP5), `CRAWLER_DEFAULT_DELAY_MS` (1500). Unset or invalid falls back to the default; out-of-range clamps to the admin bounds. Documented in `asmita/.env.example` and the runbook.
- `GET /api/crawler/sources` now returns `origin` (lowercase `admin`/`reported`/`discovered`), `hops` and `render` (`http`/`browser`/`auto`) per the v2 contract, on the memory, Kysely and Prisma paths. The admin sources view (`CrawlSourceView`) carries the new fields too; the admin UI columns are WP2.

**Tests** (all run, all passing)

- New: `tests/unit/crawl-never.test.ts` (38), `tests/unit/crawl-reported-sources.test.ts` (12, memory), `tests/unit/crawl-reported-sources-prisma.test.ts` (11, mocked Prisma), `tests/unit/crawl-reported-sources-kysely.test.ts` (7, recording Kysely fake in the style of the other crawler tests). 68 new tests.
- Existing tests changed only where the contract changed on purpose: `crawler-service.test.ts` (sources-route shape gained `origin`/`hops`/`render`), `admin-crawler-ui.test.ts` (its `CrawlSourceView` fixture gained the new fields). Nothing deleted, skipped or loosened.
- Package totals, from the final `check.sh` run (Node 22) — `crawler`: lint, type-check, 18 test files / 248 tests all passed, build ok. `asmita`: lint 0 errors (3 pre-existing warnings in an untouched script), type-check clean, `prisma validate` ok, 124 test files / 976 tests all passed. No `crawler/` source was touched.

**Not done or not verified**

- The crawler row in root `CLAUDE.md` was **not** updated: the file is protected agent-instruction file and the write needs the owner's approval, which did not come. Intended row addition (apply on approval): after the existing crawler-row sentence about `CRAWLER_SHOW_FINDINGS_TO_SURVIVOR` — "Crawler v2 WP1: a source records its `origin` — when a survivor's submitted link or an approved finding names a host, the app creates an enabled REPORTED source for that host (host only, never the link or case, idempotent, nothing linking it to her after erasure); hosts on the never-crawl list (`src/lib/crawl-never.ts`, `CrawlBlockedHost`) are never auto-created". The runbook, `crawler/README.md` and ADR 006 were updated instead.
- Migrations still exercised only against mocks and the memory store; not applied to a real Postgres (pre-existing runbook open item, unchanged). The new migration is additive only.
- The Worker smoke with the crawler step (`SMOKE_CRAWLER=1`) was not run (pre-existing open item).
- The admin UI does not yet show origin/hops/last-crawled columns or a never-crawl tab — WP2.

**Deviations from the spec, with reasons**

- `registerCaseWithUrls` is hooked in addition to the spec's `addUrlsToCase`: on the Worker the Kysely backend stores a survivor's submitted links at case creation only (`addUrlsToCase` there is the memory and Prisma paths), so the spec's "all three backends" is otherwise unreachable. Every path that stores a survivor link now creates the source; nothing else changed.
- A new audit event `CRAWL_SOURCE_REPORTED` (enum value added) instead of no audit: the repo convention audits every source change; the entry names the source, its host and budget only — no actor, no case — so it adds no link to the survivor.
- `*.gov.*` is matched fail-safe as "any label `gov`" (so `x.gov` matches too); the literal reading would leave bare `.gov` hosts unblocked.
- ADR 006 received a dated note in "Decisions recorded since acceptance" saying WP1 supersedes its N4 in part; the spec's doc list does not name the ADR, but leaving N4 as written would contradict the accepted spec.
- Environment flake, not a code issue: the first crawler `npm run check` in this container failed with vitest fork-pool crashes ("Worker exited unexpectedly", 8 errors, counts truncated); an immediate rerun was fully green and so was the final `check.sh`.
- Repository history quirk: the WP1 code, tests and docs were committed by a concurrently running session in this same worktree before this progress entry was written (commit "WP1: commit remaining work after passing checks"); the WP1 progress entry and the ADR 006 note follow in a second commit. Same author line, same work; nothing else was included.

## WP2. Bulk import and never-crawl list (app + admin UI) — 2026-11-17

**Status: complete. All checks passed** (`check.sh`, both packages, Node 22).

**What was built**

- `POST /api/admin/crawl-sources/import` (`crawler:manage`, CSRF-checked, 503 `crawler_disabled` while `ENABLE_CRAWLER` is off): up to 1000 entries per request, bare hosts or full URLs (the host is extracted, then validated exactly like a single add). One result per entry — `created`, `exists` (already a source, or a repeat within the request), `blocked` (built-in never-crawl list or a `CrawlBlockedHost` row, including parent domains), `invalid` — so duplicates and blocked hosts are reported, never errors. Omitted `pageBudget`/`delayMs` default to the WP1 env knobs (`CRAWLER_REPORTED_PAGE_BUDGET` / `CRAWLER_DEFAULT_DELAY_MS`, 2000/1500); `enabled` defaults to false, like the single add.
- `importCrawlSources` (`asmita/src/lib/crawl-sources.ts`): a fixed handful of queries whatever the list size — one read of existing sources, one read of blocked rows over every host and every parent, one bulk insert with ON CONFLICT DO NOTHING (a concurrent import of the same host cannot error or double-create; on the Prisma path one read settles the created rows and their ids) — so 1000 hosts import within the Worker's per-request subrequest limits. Built-in never-crawl hosts are filtered before any query.
- `writeAuditLogs` (`asmita/src/lib/audit.ts`): a batched audit writer — one LOCK, one previous-hash lookup, one insert of all rows, in one transaction, with the same hash chain and row shape as one-by-one writes. `writeAuditLog` now delegates to it with a single event; behaviour is unchanged and no existing test needed to change. Each created source gets one `ADMIN_ACTION` entry, action `crawl_source_imported`, like a single add.
- `GET/POST/DELETE /api/admin/crawl-blocked-hosts` (`crawler:manage`): list, add (host plus reason; the host is validated like a source host), remove by id. Reads work with the crawler off, changes return 503. Every change is audited (`crawl_blocked_host_added` / `crawl_blocked_host_removed`). New module `asmita/src/lib/crawl-blocked-hosts.ts` with memory, Kysely and Prisma paths; no schema change (`CrawlBlockedHost` came with WP1's migration, so no new migration).
- Admin "Crawler sites" page: paste-a-list import box (optional budget and delay, an explicit "switch on immediately" tick) with a results table of one row per entry; new columns origin, hops, pages crawled, last crawled; a filter by origin; and a "Never crawl" tab managing the blocked-host table (add with a reason, remove). Addresses stay plain text, never links (tested).
- No `crawler/` source was touched; the service contract in `crawler/README.md` is unchanged by this WP.

**Tests** (all run, all passing)

- New: `tests/unit/crawl-import.test.ts` (13, memory path plus the route), `tests/unit/crawl-import-kysely.test.ts` (11, recording fake; includes the bounded-query proof — 1000 hosts are five statements plus one LOCK fragment — and the batched hash-chained audit insert), `tests/unit/crawl-import-prisma.test.ts` (7, mocked Prisma: createMany with skipDuplicates, the concurrent-creation race, the batched audit insert inside the locked transaction), `tests/unit/crawl-blocked-hosts.test.ts` (9, CRUD, routes, and that a blocked host and its subdomains never become a REPORTED source), plus 7 new assertions in `tests/unit/admin-crawler-ui.test.ts` (import box, results table, origin columns and filter, never-crawl tab, text-not-links, crawler-off disablement). 47 new tests; the new admin UI files are also in that test's static no-fetch/no-link file list. Nothing deleted, skipped or loosened.
- Package totals, from the final `check.sh` run (Node 22) — `crawler`: lint, type-check, 18 test files / 248 tests all passed, build ok (unchanged by this WP). `asmita`: lint 0 errors (3 pre-existing warnings in an untouched script), type-check clean, `prisma validate` ok, 128 test files / 1023 tests all passed (976 before this WP, +47).

**Not done or not verified**

- The crawler row in root `CLAUDE.md` was again **not** updated (protected agent-instruction file; the write needs the owner's approval, which did not come — same as WP1). Intended line addition (apply on approval): in the architecture list, extend "`/api/admin/findings*` and `/api/admin/crawl-sources` for analysts" to "`/api/admin/crawl-sources` (single add plus WP2 bulk import at `/import`) and `/api/admin/crawl-blocked-hosts` (WP2 never-crawl list) for analysts". The runbook (section 2) documents both new routes instead.
- The Worker (Kysely) path still has no test against a real Postgres (pre-existing runbook open item, unchanged): the Kysely coverage here is a recording fake. The 1000-host bound is proven on the fake, not on a deployed Worker.
- The admin UI was verified by static-render tests only, not by a human or an E2E run; the existing e2e crawler journey uses the unchanged single-add route and was not extended.

**Deviations from the spec, with reasons**

- The spec does not say what an omitted `pageBudget`/`delayMs` in the import body defaults to; the WP1 env knobs (reported-source defaults) are used, so one deployment setting covers every automatically created source and the import, and the UI leaves the fields blank with "server default".
- A repeated entry within one request reports `exists`: the host is on the list once the first entry created it. The spec lists the status words but not which applies to repeats.
- Import entries without a scheme are taken as bare hosts, so "example.com/x" is reported invalid rather than repaired into "example.com": the spec says "hosts or full URLs", and silently rewriting half-URLs invites mistakes on safety-relevant input.
