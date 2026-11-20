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

## Crawler v3: coverage and efficiency (owner decision, 19 November 2026)

Ideas from a read-only study of Firecrawl (AGPL-3.0), rewritten for Asmita. **Do not fetch, read or copy Firecrawl code**: Asmita is Apache-2.0, so implement from the descriptions below only. Everything in "Rules that do not change" still holds: no search-engine discovery, no stealth or random User-Agents, no proxies, no `ignoreHTTPSErrors`, no cookie-banner clicking, no stored page content.

How v3 runs: three parallel lanes, each on its own branch cut from `feat/crawler-v3`, each doing its WPs in order. A lane touches only the files its WPs need; where two lanes must touch the same file (`crawler/src/crawler.ts`, `crawler/src/crawl/extract.ts`), keep the change small and self-contained so the later merge is easy. Each WP adds fixture pages to the crawler test fixtures (`crawler/tests/support/`) for the behaviour it adds, with synthetic images only. For v3 the branch rule in "How to work" is replaced by the lane branch.

- Lane A (`feat/crawler-v3-a`): WP9, WP10, WP11
- Lane B (`feat/crawler-v3-b`): WP12, WP13, WP14
- Lane C (`feat/crawler-v3-c`): WP15, WP16

### WP9. Find sitemaps robots.txt does not list (crawler)

When a source's robots.txt names no `Sitemap:`, probe `/sitemap.xml` and then `/sitemap_index.xml` on the source host (through safe-fetch, robots-checked, counted against the page budget, at most these two probes per source per run). For a source on a subdomain, also probe the registrable parent domain's `/sitemap.xml` (tldts, private suffixes honoured) but keep only `<loc>` entries in the source's scope. A 404 or non-XML answer is quietly ignored. Reuse `xml-docs.ts` parsing and caps.

Done when: fixtures for (a) robots.txt without Sitemap lines but `/sitemap.xml` present, (b) only `/sitemap_index.xml`, (c) a subdomain source whose parent sitemap lists in-scope and out-of-scope pages; tests prove pages are reported, out-of-scope entries are dropped, and at most two probes (plus one parent probe) are made.

### WP10. Count the same page once (crawler + app)

Treat these as one page for dedup: `http`/`https`, `www.`/bare host (only when both are in scope), a trailing slash on non-root paths, and a final `/index.html`, `/index.htm` or `/index.php`. Fetch the canonical form (prefer https, keep the host form seen first). Also read `<link rel="canonical">` on fetched HTML: if it is in scope, report it as an alias so the app does not fetch it again (never fetch it just because it is canonical). Apply the same normalisation in `crawler/src/crawl/url.ts` and in the app's `crawlPageDigest` (`asmita/src/lib/crawl-pages.ts`) so both sides agree; existing frontier rows keep their stored digest. If the report contract needs an `aliases` field, add it as optional on both sides with strict Zod, max 20 per page.

Done when: unit tests for every equivalence pair on both sides, a contract test that crawler and app produce the same key, and a fixture site that links the same page in four forms shows one fetch.

### WP11. Crawl the useful pages first (app + crawler)

Add a `priority` integer to `CrawlPage` (additive migration, default 100; lower runs first) and claim `ORDER BY priority, nextDueAt`. Set it from the report: sitemap 10, feed 20, pagination links 30, other pages 50 plus 10 per depth level (cap 100). Optional `lastmod` on reported sitemap links (strict, ISO date): an entry whose lastmod is newer than the row's last fetch gets priority 5 and is due now. Prisma, Kysely and memory paths all.

Done when: claim-order tests on all three backends, a test that a newer lastmod jumps the queue, migration validates, and the contract tests cover the new optional field.

### WP12. Follow redirects that live in the page (crawler)

On the static path, follow `<meta http-equiv="refresh" content="N; url=...">` (N up to 10 seconds) as one more redirect hop: scope-checked, robots-checked, counted in the existing hop limit, never off-scope. In `auto` render mode, also send a page to the browser when its HTML is a tiny script-only stub (under 2 KB of visible text, at least one `<script>`, no image candidates and no links), because those are usually JavaScript redirects or app shells.

Done when: fixtures for a meta-refresh page, an off-scope meta refresh (not followed), and a `location.replace` stub page (rendered in auto mode, its target's images hashed).

### WP13. Do not retry what cannot work (crawler + app)

Classify fetch failures: DNS name not found and TLS certificate failures are permanent; timeouts, connection resets and 5xx are temporary; 429/503 keep today's backoff. Permanent failures are reported as `gone` straight away so the app marks the row dead without five retries; if a source's home page fails permanently, count it once in the run summary (no hostname in logs). Temporary failures keep the existing 1 h / 6 h / 24 h backoff.

Done when: unit tests for each class, a test that a DNS failure is reported `gone` on the first attempt, and the run summary shows counts by class.

### WP14. Skip fake "not found" pages (crawler)

Within one run and one source, keep in memory a digest of each fetched HTML body (normalised: whitespace collapsed, digits stripped). When the same digest appears for 5 or more distinct URLs, treat further pages with that digest as soft-404s: extract no images or links from them and report them `gone`. Digests never leave memory and are never logged.

Done when: a fixture site that answers every unknown path with the same "not found" page proves the cut-off, and a site of genuinely similar gallery pages (different images) is not affected.

### WP15. A lighter browser (crawler)

In the browser worker, abort before routing: font requests, audio and video media, and a small built-in list of advertising/analytics hosts (written in the code; it must not include any image or video CDN). Replace the fixed wait after scrolling with "network quiet": wait until no request has been in flight for 500 ms, bounded by the page deadline, with the existing scroll wait as the upper limit.

Done when: tests that blocked kinds are never requested, that image requests still are, that the request cap leaves room for more images on a fixture page full of fonts and trackers, and that a slow lazy-loader is waited for.

### WP16. Galleries in frames and components (crawler)

Static path: collect in-scope `<iframe src>` and `<frame src>` as page links (kind page). Browser path: gather image candidates from every frame (`page.frames()`) and from open shadow roots, not only the main document; out-of-scope frames are not rendered (scope and robots checks as today).

Done when: fixtures for an in-scope iframe gallery, an off-scope iframe (not followed), and a gallery inside a web component's open shadow root, all with synthetic images that must be hashed.

## Reporting

After each WP, append to `crawler/docs/v2-progress.md` (v3 WPs too, under a `## Crawler v3` heading): the WP, what was built, test counts from both packages, anything not done or not verified, and any deviation from this spec with the reason. Do not claim a check passed unless it was run.
