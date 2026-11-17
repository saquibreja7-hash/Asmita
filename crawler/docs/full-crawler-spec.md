# Full crawler (v2): specification and work packages

Owner decisions, 17 November 2026 (Saquib):

- The crawler must cover sites deeply and find new sites by itself. An admin typing every site is not acceptable.
- Starting points are: sites an admin adds, and sites where survivors report links.
- Sites discovered by following links are crawled automatically, within simple limits.
- Reverse image search is out of scope.

Read first: root `CLAUDE.md`, `asmita/AGENTS.md`, `crawler/README.md`, `asmita/docs/adr/006-hash-matching-crawler.md`.

## Rules that do not change

1. Image bytes stay in memory only and are decoded in the isolated child process. The no-disk-write test stays green.
2. Every network request made for crawling goes through `src/net/safe-fetch.ts` and its address policy. No second HTTP path for crawled hosts.
3. Logs carry counts, ids and codes only: never a URL, hostname, fingerprint or body.
4. No evasion: one honest User-Agent, robots.txt honoured, no proxies, no fingerprint spoofing, no CAPTCHA solving, no logins.
5. The `asmita/` app never fetches a submitted or discovered address. Its no-fetch lint rule and tests are not edited or weakened.
6. Existing tests are not deleted, skipped or loosened to make new code pass. If an existing test must change because behaviour changed on purpose, say why in the commit message.
7. No production access: no deploys, no real database, no secrets in code or tests. Tests use synthetic pattern images and local fixture servers only.
8. Never set `reviewedByLegal: true` anywhere.

## How to work

- Branch: `feat/crawler-v2`. One work package (WP) at a time, in order. Commit when a WP's "done when" list is met and all checks pass, then push.
- Checks, all must pass before each commit:
  - `cd crawler && npm ci && npm run check`
  - `cd asmita && npm ci && npx prisma generate && npm run lint && npm run type-check && npm run prisma:validate && npm run test`
- Keep Prisma, Kysely (`worker-kysely.ts`, Worker paths in `case-ops.ts`) and the memory store aligned for every app-side change. Migrations are additive only.
- New crawler config goes through `src/config.ts` (Zod, fail closed) and `.env.example`. New app switches follow `src/lib/crawler-flags.ts`.
- Update `crawler/README.md`, `asmita/docs/ops/crawler-runbook.md` and the crawler row in root `CLAUDE.md` when behaviour changes.
- Commit messages end with: `Co-Authored-By: Hermes (GLM 5.3) <noreply@example.invalid>`

## Service contract additions (app `/api/crawler/*`, bearer key, 503 when `ENABLE_CRAWLER` is off)

All bodies are strict (no extra fields), Zod-validated, 256 KB limit, rate-limited like the existing routes.

- `GET /api/crawler/sources` now returns per source: `{ id, kind: "site", domain, pageBudget, delayMs, origin: "admin" | "reported" | "discovered", hops: number, render: "http" | "browser" | "auto" }`.
- `POST /api/crawler/frontier/claim` body `{ sourceId, limit (1..200) }` -> `{ urls: [{ id, url, depth, etag?, lastModified? }] }`. Returns due URLs for that source and marks them claimed for 30 minutes. If the source has no rows yet, the app first creates the seed rows (`https://<domain>/`).
- `POST /api/crawler/frontier/report` body `{ sourceId, runId, pages: [{ id, status: "fetched" | "not_modified" | "gone" | "blocked" | "error", etag?, lastModified?, links: [{ url, kind: "page" | "sitemap" | "feed" }] (max 500) }] }` -> `{ accepted: number }`. The app stores new in-scope URLs (deduplicated by a keyed digest), schedules the next visit, and counts pages against the source budget.
- `POST /api/crawler/discoveries` body `{ sourceId, runId, hosts: [string] (max 200) }` -> `{ accepted: number }`. Out-of-scope hosts seen on in-scope pages. The app applies the discovery rules below.
- `POST /api/crawler/findings` is unchanged.

URLs stored by the app are encrypted with `encryptField`; lookups use a digest. They follow the same 30-day purge as findings, except rows still due for crawling.

## Work packages

### WP1. Sites from survivor reports (app)

When a survivor's submitted link is stored (`addUrlsToCase`, all three backends) and when a crawler finding is approved, make sure a `CrawlSource` exists for that link's host: `origin = REPORTED`, `hops = 0`, enabled, default budget. Only the host is copied, never the link or the case. Hosts on the never-crawl list are skipped.

- Add to `CrawlSource`: `origin` enum (`ADMIN` default, `REPORTED`, `DISCOVERED`), `hops Int @default(0)`, `discoveredFromId String?`, `render` enum (`HTTP` default, `BROWSER`, `AUTO`), `lastCrawledAt`, `pagesCrawled Int @default(0)`.
- Add a `CrawlBlockedHost` table (host, reason, addedBy, createdAt) plus a built-in constant list in `src/lib/crawl-never.ts`: major social platforms, search engines, app stores, webmail, banks and payment sites, government (`*.gov.*`, `*.nic.in`), news wire sites, and Asmita's own domains. A host matches if it equals an entry or is a subdomain of one.
- Defaults from env: `CRAWLER_REPORTED_PAGE_BUDGET` (2000), `CRAWLER_DISCOVERED_PAGE_BUDGET` (200), `CRAWLER_DEFAULT_DELAY_MS` (1500).

Done when: submitting a link on host X creates one enabled REPORTED source for X (idempotent, no duplicate on a second link); a never-crawl host creates none; `/api/crawler/sources` returns the new fields; erasing the survivor's account does not delete the source and nothing links the source to her; tests on memory and Prisma paths, Kysely path covered like the existing crawler tests.

### WP2. Bulk import and never-crawl list (app + admin UI)

- `POST /api/admin/crawl-sources/import` (`crawler:manage`): body `{ hosts: string[] (1..1000), pageBudget?, delayMs?, enabled? }` -> per-host result `created | exists | blocked | invalid`. Accepts hosts or full URLs (host is extracted); same validation as single add.
- `GET/POST/DELETE /api/admin/crawl-blocked-hosts` (`crawler:manage`).
- Admin "Crawler sites" page: paste-a-list import box with a results table; columns for origin, hops, pages crawled, last crawled; filter by origin; a "Never crawl" tab. Addresses are shown as text, never as links.

Done when: 1000 hosts import in one request within the Worker's limits; duplicates and blocked hosts are reported, not errors; each change is audited as the existing source changes are; UI tests in the style of `tests/unit/admin-crawler-ui.test.ts`.

### WP3. App-backed frontier (app + crawler)

Today each run starts from the home page and forgets everything. Replace that with the frontier routes above.

- App: `CrawlPage` table (id, sourceId, urlEncrypted, urlDigest unique per source, depth, kind, etag, lastModified, status, claimedUntil, lastFetchedAt, nextDueAt, failCount, createdAt). Claim uses `FOR UPDATE SKIP LOCKED` so two crawler instances never get the same URL.
- Scheduling: first visit as soon as possible; after `fetched` with new links, revisit in 24 h; after `not_modified`, double the interval up to 14 days; after `error`, back off 1 h, 6 h, 24 h, then mark dead after 5 failures; `gone` is dead.
- Budget: a source stops handing out new URLs for the day once `pageBudget` pages were fetched that day.
- Crawler: `src/crawler.ts` claims batches, fetches with `If-None-Match` / `If-Modified-Since`, reports results. The in-memory frontier is removed. In-scope check stays in the crawler (approved host and subdomains, every redirect hop) and is repeated by the app on report.

Done when: a second run does not refetch unchanged pages (fixture asserts request counts); two crawler processes against one mock never fetch the same URL in the same window; a killed run loses at most its claimed batch, which becomes due again after 30 minutes; the link-flood test still passes with the cap enforced on both sides; frontier memory in the crawler is bounded by the batch size.

### WP4. Deep coverage of a site (crawler)

- Read `Sitemap:` lines in robots.txt, `/sitemap.xml`, sitemap index files and gzipped sitemaps (size and count capped; parsed as a stream, never a temp file). Image sitemap entries (`<image:loc>`) become image candidates for their page.
- RSS and Atom feeds linked from pages.
- Pagination: `rel="next"`, and links whose text or class marks them as next/older/page-N. Pagination links get priority over other links.
- Extract more image candidates: CSS `background-image` in inline styles, `<video poster>`, `<link rel="image_src">`, JSON-LD `image`, `<noscript>` fallbacks, and full-size targets of thumbnail links (`<a href=*.jpg><img></a>` takes the href).
- Skip obvious non-content: login, cart, search-result and calendar URLs, and query-string traps (cap distinct query variants per path).

Done when: fixture site with a sitemap index, a gzipped sitemap, an Atom feed, 30 paginated listing pages and lazy/background/poster images is fully covered within its budget, and every planted image is found exactly once; a crawler-trap fixture (infinite calendar) stays within caps.

### WP5. Automatic discovery of new sites (crawler + app)

- Crawler reports out-of-scope hosts it saw linked from in-scope pages (hosts only, deduplicated per run).
- App rules for each reported host: skip if on the never-crawl list or already a source; otherwise create a `DISCOVERED` source with `hops = parent.hops + 1`, `discoveredFromId`, page budget `CRAWLER_DISCOVERED_PAGE_BUDGET`. It is enabled automatically when `hops <= CRAWLER_MAX_DISCOVERY_HOPS` (default 2); beyond that it is stored disabled for an admin to enable. At most `CRAWLER_MAX_NEW_SITES_PER_DAY` (default 200) are auto-enabled per day; the rest are stored disabled.
- A discovered site that produces a match is promoted: `hops` reset to 0 and budget raised to the reported budget, because a match proves it is relevant. A discovered site with no match after its budget is spent three days running is paused for 30 days.
- Admin page shows discovered sites with their parent and why they are paused or disabled.

Done when: fixture with site A linking to B linking to C linking to D (hops 1, 2, 3): B and C are crawled automatically, D is stored disabled; a never-crawl host is never stored or fetched; the daily cap holds; a match on C promotes C; all with tests on the app rules and an integration test in the crawler.

### WP6. Continuous running and parallel sources (crawler)

- `node dist/main.js run --loop`: keeps claiming work across all enabled sources until stopped; sleeps when nothing is due; still exits cleanly on SIGTERM and on the existing fatal exit codes. Without `--loop` the one-shot behaviour stays.
- Sources are crawled concurrently (`CRAWLER_SOURCE_CONCURRENCY`, default 8) with per-host delay and a global request cap. Slow or failing hosts do not block others.
- Run summary and periodic progress logs gain: sources active, pages claimed/fetched/not-modified, new URLs, new hosts reported, images hashed, matches.
- Runbook: how to run it as an always-on service (Cloud Run service or a VM container with restart policy) and as a scheduled job.

Done when: integration test with 20 fixture sources of mixed speed finishes within a bound that proves concurrency; one hanging source does not delay the others; loop mode picks up a source enabled while it is running.

### WP7. Pages that need a browser (crawler)

Only for sources with `render = BROWSER`, or `AUTO` when a fetched page has scripts and yields no image candidates.

- Use Playwright Chromium, headless, in its own child process, one page at a time per source.
- All browser traffic goes through an in-process forward proxy that applies the same address policy as `safe-fetch` (resolve, check every address, connect to the checked address, same port and scheme rules). No direct browser egress.
- Nothing on disk: no persistent profile, cache disabled, downloads disabled, service workers blocked, temp directory on memory (document the container flags). Image bytes are taken from intercepted responses in memory and go through the same size caps and the same decoder path.
- Honest User-Agent (the crawler's own string appended), robots.txt still honoured, no stealth plugins.
- Time and resource caps per page; scroll a bounded number of times to trigger lazy loading.

Done when: a fixture page that builds its gallery with JavaScript and infinite scroll yields its planted image; a script on a fixture page that requests a private address is refused by the proxy; the no-disk-write test covers the browser path as far as Node can observe it and the README states what it cannot observe; the Docker image builds with Chromium and still runs read-only.

### WP8. Dashboard (admin UI)

A "Crawler" overview page: sites by origin and state, pages crawled today, queue size, discovered sites today, matches awaiting review, last run summary, errors by code. Reads only; behind `findings:review`. No addresses in aggregates.

Done when: page renders from a new address-free `GET /api/admin/crawler/stats`; tests as for the other admin pages.

## Reporting

After each WP, append to `crawler/docs/v2-progress.md`: the WP, what was built, test counts from both packages, anything not done or not verified, and any deviation from this spec with the reason. Do not claim a check passed unless it was run.
