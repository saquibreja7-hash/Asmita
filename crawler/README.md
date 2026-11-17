# Asmita crawler

A small, targeted crawler that runs as a scheduled one-shot job. It visits an
admin-approved list of sites, finds image addresses in their HTML, downloads
each image **into memory only**, computes its PDQ fingerprint with the same
code survivors' browsers run, compares it against the pool of fingerprints
survivors have submitted, throws the image away, and reports matches to the
Asmita app for human review.

It is safety-critical: it fetches attacker-influenced URLs, handles pages that
may host intimate images, and reports to a system that acts on survivors'
behalf. Every guarantee below is enforced by a test.

## How a run works

```
main.ts -> cli.ts (config, signals, exit codes)
  -> crawler.ts runCrawl
       AsmitaClient: GET /sources, GET /pool          (own HTTP agent, bearer key)
       per source (parallel up to GLOBAL_CONCURRENCY):
         loop: POST /frontier/claim  (batch of due pages, claimed for 30 min;
                first claim seeds https://<domain>/ app-side)
         per claimed page: SafeFetcher (pinned-IP connect, robots, per-host
                delay; If-None-Match / If-Modified-Since when the app has
                validators) -> 200 HTML / 304 not modified / 404 gone / error
         extract.ts -> links (in scope, not nofollow) + image candidates
         per image: SafeFetcher -> Buffer -> hash-image.ts (sniff, sharp,
                    prepare.ts, pdq.ts) -> Matcher -> FindingsSink
         POST /frontier/report (page outcomes + links, body-bounded chunks)
       pool re-sync every POOL_RESYNC_MINUTES (<= 60)
       FindingsSink: POST /findings in batches (<= 50 items, <= 240 KiB),
                     whenever a batch fills, every 15 s, and at once on stop
  -> run_summary log line, exit code
```

The frontier itself lives in the app (`CrawlPage` rows): the crawler claims a
batch, reports every outcome and keeps no page state of its own, so a second
run resumes where the last one stopped, two crawler processes never get the
same URL, and a killed run loses at most its claimed batch, which the app
hands out again after the 30-minute claim window.

### Exit codes

A run exits 0 only when nothing needs an operator's attention. The code is
also in the `run_summary` log line (`exitCode`, plus a `problems` object).
When several apply, the first row in this table wins.

| Code | Meaning |
|---|---|
| 0 | Clean run (including SIGTERM, time limit, budget reached), or the crawler is switched off on the server (503), even if findings were then left unsent |
| 2 | The API rejected the service key (401/403), at load or mid-run |
| 4 | Contract error: the server refused a request as malformed (400) and the batch was dropped, or rejected a finding as `page_not_in_source` (a crawler scope bug) |
| 3 | Findings were still undelivered at exit (API down past all retries) |
| 5 | The pool could not be re-synced within 60 minutes, so the run stopped early |
| 1 | Invalid configuration or an unexpected failure |
| 64 | Bad command line |

A failing source (site down, DNS failure, robots.txt unreachable, timeouts)
is not a run failure; it is counted in the summary only.

## Safety guarantees and the tests that enforce them

| Guarantee | How | Test |
|---|---|---|
| **No SSRF.** Only http/https on ports 80/443, no credentials in URLs; every resolved address must be public (private, loopback, link-local, CGNAT, multicast, reserved, IPv4-mapped/compatible IPv6, NAT64, 6to4, Teredo, ULA incl. `fd00:ec2::254`, metadata `169.254.169.254`, `100.100.100.200`). | `net/policy.ts`, `net/ip.ts` (IPv6 is an allowlist: only `2000::/3` minus special ranges). | `tests/unit/ssrf.test.ts` (84 cases: decimal/octal/hex/short IPv4, IPv6 forms, mapped, NAT64, schemes, ports, credentials) |
| **No DNS rebinding.** The address checked is the address dialled. | undici custom connector: resolves ALL addresses itself, rejects if any is blocked, then connects to the validated IP literal with the original hostname as TLS `servername` (SNI + certificate check) and Host header. Not a pre-check followed by a normal fetch. | `ssrf.test.ts` "SafeFetcher connects only to the address it validated" (resolver called once per connection; rebinding answer refused; mixed public/private records refused) |
| **TLS on the pinned IP.** SNI, the certificate hostname check and Host use the hostname; verification is never disabled. | Same connector; tests trust an in-memory CA through a test-only fetcher option that production wiring never sets. | `tests/unit/tls.test.ts` (matching cert succeeds with SNI = hostname; wrong-name cert, untrusted issuer and un-injected CA fail with `tls_failed`; HTTPS redirects to private/metadata/mapped addresses refused); `config-policy.test.ts` |
| **Redirects re-validated.** Manual, max 5, each hop re-checked (scheme, port, credentials, address, robots, page scope). | `SafeFetcher.fetch` loop + `beforeHop`. | `ssrf.test.ts` redirect cases; `tests/integration/crawl.test.ts` (redirect to 10.0.0.1 and 169.254.169.254, loop, off-domain page redirect) |
| **Byte caps** (10 MB images, 2 MB HTML, 500 KiB robots.txt) while streaming AND after decompression; stacked/unknown encodings refused. | `readCapped`, `decode` (`maxOutputLength`). | `tests/unit/bytes.test.ts` (gzip/brotli/deflate bombs, declared length, chunked stream, timeouts) |
| **Timeouts**: connect, headers, body idle, and an overall per-request deadline (stops slow drips). | undici options + `AbortSignal.timeout`. | `bytes.test.ts`, fixture `/img/slow.png` |
| **Memory only.** Image bytes live in one Buffer, dropped after hashing; no temp files or disk caches. | No `node:fs` in `src/` (ESLint + static test), `toBuffer()` only, `sharp.cache(false)`; container sets `VIPS_DISC_THRESHOLD=2g`, an unwritable `TMPDIR` and runs with a read-only root FS. | `tests/integration/memory-only.test.ts` (full crawl with every `fs` write API, `fs.promises` writers, `createWriteStream`, `mkdtemp` patched to throw; control assertions prove the patch is active); `tests/unit/config-policy.test.ts` |
| **Decoder safety.** Magic-byte allowlist (JPEG, PNG, GIF, WebP, AVIF) runs before sharp sees any byte; sharp's detected format must agree (AVIF must be AV1, so HEIC cannot pass); 25 MP pixel limit checked from the header; SVG/PDF/TIFF never decoded; truncated files decode tolerantly (`failOn: "none"`) but stay bounded by the byte cap and pixel limit. | `image/hash-image.ts`, `prepare.ts`. | `tests/unit/image.test.ts` (pixel bomb, 30 MP image, SVG, TIFF, HTML served as image, chimera files, light and heavy truncation, AVIF); fixtures `cut.jpg` (matches), `cut-heavy.jpg` (does not) and `pic.avif` |
| **Service key only to Asmita.** | `AsmitaClient` has its own agent, builds URLs only from `ASMITA_API_URL`, refuses redirects. The crawl fetcher sends no auth or cookie headers. | `crawl.test.ts` "never sends credentials or cookies to crawled hosts"; `client-findings.test.ts` "refuses redirects" |
| **No URLs, hostnames, fingerprints or bodies in logs.** Field allowlist, string sanitiser, errors reduced to fixed codes; uncaught errors and Node warnings routed through the logger. | `log.ts`, `errors.ts`, `cli.ts`. | `crawl.test.ts` log scan; `tests/integration/process.test.ts` runs the real `runMain` in a child process and scans all of stdout and stderr |
| **Politeness.** robots.txt per origin (cached for the run), `Crawl-delay` honoured up to a cap, meta robots / `X-Robots-Tag` / `rel` nofollow, per-host delay, global concurrency cap, retries with exponential backoff and full jitter, `Retry-After`. | `crawl/robots.ts`, `crawl/limits.ts`, `retry.ts`. | `url-robots-extract.test.ts`, `log-retry-limits.test.ts`, `crawl.test.ts` |
| **Real addresses.** URLs are fetched and reported as the site wrote them (fragment removed, query untouched, so signed CDN URLs work); tracking-param stripping and sorting apply only to the dedup key. | `crawl/url.ts` (`normalizeUrl` vs `urlKey`). | `url-robots-extract.test.ts` |
| **Scope.** A page is in scope only if its host EQUALS the approved source `domain` or is a subdomain of it: approving `example.com` covers `www.example.com`; approving `forum.example.com` does not cover `example.com` or `shop.example.com`. Checked on every page hop including redirects. Source domains must be bare hostnames (no IP, port, path or bare public suffix). BFS to `MAX_DEPTH`, `pageBudget` per source. | `crawl/url.ts` (`sourceHost`, `inScope`), `crawler.ts`. | `url-robots-extract.test.ts`; `tests/integration/scope.test.ts` (parent, sibling, sub-subdomain, redirect to sibling) |
| **Image hosts.** Only image candidates extracted from an in-scope page are fetched; no image URL discovered any other way is ever requested. Such an image may live on another public host (sites serve images from CDNs), but every hop still passes all safe-fetch checks and robots.txt, and per source and run at most `MAX_OFFSITE_IMAGE_HOSTS` (default 50) distinct off-scope hosts that have **returned an image** are used, plus at most `MAX_OFFSITE_HOST_FAILURES` (default 20) distinct off-scope hosts that were tried and did not. A host counts against the first cap only after it answers with an image, so junk hosts on a hostile page cannot use it up and starve the real CDN; the second cap bounds requests to junk. Both are checked on every hop, before robots.txt or the image is requested. Counted as `imagesOffHost`, `imageHostsCapped` and `imageHostFailuresCapped`. | `crawler.ts` (`processImage`, `admitHost`, `settleHosts`). | `tests/integration/scope.test.ts` (5 CDN hosts plus a redirect to a 6th, cap 3: only 3 contacted; 4 junk hosts before the real CDN with cap 1: the CDN image still matches; failure cap 2: only 2 junk hosts contacted) |
| **Bounded frontier.** At most `MAX_LINKS_PER_PAGE` (500) links and `MAX_IMAGES_PER_PAGE` (200) image candidates are taken from any page. The queue lives in the app: the crawler holds only the batch it claimed (at most `FRONTIER_CLAIM_LIMIT` entries) and the report built from it, split into body-bounded chunks under the server's 256 KiB limit — that is its whole frontier memory, and `batchPeak` in the summary proves it. The app dedups stored links per source on a keyed digest and caps a source at `pageBudget` pages per day. Summary: `linksDropped`, `batchPeak`. | `crawl/extract.ts`, `crawler.ts`, the app's `crawl-pages.ts`. | `tests/integration/frontier.test.ts` (pages of 40,000 links: the crawler's batch never exceeds the claim limit, the app's frontier grows by at most MAX_LINKS_PER_PAGE per fetched page, the daily budget holds, the planted image is still reported); `tests/integration/frontier-app.test.ts` (second run 304s, two processes, killed run); `url-robots-extract.test.ts` |
| **Withdrawn fingerprints stop matching.** Pool re-synced at least hourly; a pool older than 60 minutes stops the run; queued findings for removed ids are dropped; a `fingerprint_not_accepted` rejection removes the id from the in-memory pool at once. | `crawler.ts`, `findings.ts`, `match/matcher.ts`. | `tests/integration/lifecycle.test.ts`, `client-findings.test.ts` |
| **Fail closed config**, no setting that loosens the network policy. Loopback access for tests is a policy object injected in code from `tests/support/test-policy.ts`. | `config.ts`. | `config-policy.test.ts` (schema has no such key; `src/` network code never mentions loopback) |
| **Same PDQ as the browser.** | `src/pdq.ts` re-exports `asmita/src/lib/pdq/pdq.ts` (bundled at build). | `tests/unit/pdq-contract.test.ts` (exact export list, version, types, golden hash) |

### Robots.txt failure policy

| robots.txt response | Treated as |
|---|---|
| 2xx | parsed and obeyed (group for our UA token, else `*`) |
| 404, 410, other 4xx | no robots.txt: allowed (RFC 9309) |
| 401, 403 | disallow all (stricter than RFC 9309, on purpose) |
| 429, 5xx, network error, timeout, over 500 KiB, redirect loop | disallow all for this run (RFC 9309 "unreachable") |

Meta robots `noindex` does not stop image checks (nothing is indexed or
republished); `nofollow`/`none` stops link following.

## PDQ: where fingerprints come from

The crawler imports `asmita/src/lib/pdq/pdq.ts` (read-only) through
`src/pdq.ts`; esbuild inlines it into `dist/main.js`, so the container does not
need the app tree. Dihedral (rotated/flipped) variants are not generated:
`pdq.ts` does not offer them and the crawler does not reimplement PDQ.

Decoding follows `src/prepare.ts`, copied from the PDQ agreement experiment
(`tools/pdq-agreement/src/prepare.ts`, commit `876ad33`, branch
`feat/crawler-pdq-agreement`) and kept as one swappable module: sharp with
`failOn: "none"`, `limitInputPixels: 25_000_000`, `animated: false` ->
`.rotate()` -> `.toColourspace("srgb")` -> `.ensureAlpha()` -> `.raw()`, no
resize, canvas alpha round-trip emulation, and a naive CMYK conversion for CMYK
images without an ICC profile.

Measured agreement with browser-computed hashes on 74 synthetic images:
maximum distance 10, p95 0, 71 exact matches (verdict: go for Node + sharp +
pdq.ts). Caveats: the fixtures were synthetic, the browser side was Chromium on
Windows only, and CMYK is best-effort.

**Truncated images (`failOn: "none"`, as in the harness).** A cut-short copy
of a survivor's image on a site is still that image, so it should still be
found. Measured on synthetic 640x480 images: JPEG or PNG cut to 99% of its
bytes stays within distance 10 of the intact file, cut to 90% within 28
(match); heavier truncation drifts to 60+ (no match). Truncated WebP, and a
JPEG with almost no data, fail to decode and are skipped (`truncated` or
`decode_failed`). Well-formed images hash identically under every `failOn`
setting, so the agreement numbers above are unaffected.

This deliberately differs from the survivor's browser: Chromium's
`createImageBitmap`, which produces survivor fingerprints, rejects truncated
files outright (measured: all 30 truncated JPEG/PNG/WebP test files), so a
survivor never submits a fingerprint of a partial image. The crawler, by
contrast, hashes a partial copy it finds, because that copy may still be the
survivor's image. A truncated image gets no special treatment: it becomes a
finding only under the normal rules (PDQ quality at least 50 and distance
within the pool threshold, at most 31), exactly like an intact image.
Stricter behaviour, if wanted, belongs in a policy check in
`src/image/hash-image.ts`, not in the recipe.

Matching: images with PDQ quality below 50 are skipped; brute-force Hamming
over a packed `Uint32Array` with SWAR popcount; threshold = pool `threshold`
capped at 31. Every pool entry within the threshold becomes its own finding,
best first (one picture can be in several survivors' submissions).
`npm run bench:matcher` on a laptop (Node 22): about **0.9 ms per query at
100,000 fingerprints** and about 13 ms at 1,000,000.

## Decoder isolation

Image decoding (sharp/libvips, native code fed attacker-controlled bytes) and
PDQ hashing run in separate **child processes** (`src/image/decoder-pool.ts`,
`src/image/decoder-worker.ts`, bundled as `dist/decoder-worker.js`). The
crawler process holds the fingerprint pool, the matcher and the service key,
and never loads sharp itself (`dist/main.js` contains no sharp import; tested).

What crosses the boundary: the parent sends `{ id, bytes, minSide }`; the
child answers `{ id, ok: true, pdq, quality, rss }` or
`{ id, ok: false, code, rss }` with `code` from the fixed error list and `rss`
its resident memory in bytes. Replies are validated strictly; any other
shape, field or id kills the child as compromised.

Each child:

- gets a scrubbed environment (`VIPS_DISC_THRESHOLD`, `TMPDIR`/`TMP`/`TEMP`
  only; on Windows libuv also copies its required system variables such as
  `PATH` and `SYSTEMROOT`), so no service key or config, and nothing secret on
  its argv;
- runs under Node's permission model (`--permission`): no filesystem writes,
  no child processes, no worker threads, and filesystem reads only of its own
  bundle (`dist/decoder-worker.js`) and `node_modules/{sharp,@img,detect-libc,semver}`
  (not `package.json`, `src/`, `dist/main.js` or a local `.env`);
- has a JS heap cap (`--max-old-space-size=256`);
- is recycled by the parent after 500 answered images or when the RSS it
  reports is above 768 MB, before it is handed another image, so no image is
  lost to a recycle; this also bounds how long a compromised child lives;
- has a per-image deadline (`DECODE_TIMEOUT_MS`, default 20 s): on timeout,
  crash or a bad reply it is SIGKILLed and replaced. An image whose child
  died before answering is retried once on a fresh child (never twice, so a
  poison image cannot loop); a timeout or bad reply is not retried. Skipped
  images are counted (`decoder_timeout` / `decoder_crashed`);
- has stdout and stderr discarded, so crash output (which could contain image
  bytes) never reaches the logs; only counters are reported (`decoder` in the
  run summary).

`child_process` was chosen over `worker_threads` because worker threads share
the parent's address space: a native-code exploit there could read the pool
directly. The process boundary costs one IPC copy per image; measured on a
laptop (80 mixed 640x480 to 1600x1200 JPEG/PNG/WebP images, decode + PDQ +
match against 100,000 fingerprints; `npm run bench:decode`): with one decoder
33-39 images/s in-process vs 34-37 isolated; with two, 48 in-process vs 47-63
isolated. The difference is within run-to-run noise. Matching itself is about
1 ms per image at 100k fingerprints (`npm run bench:matcher`).

**What the isolation gives.** The pool, the matcher and URLs are only in the
parent's memory, never sent to a child; the key is never in a child's
environment, argv or messages. Code that stays inside JavaScript in the child
cannot write files, spawn processes or read outside its bundle and sharp. A
child is a separate address space, so a bug that only lets an attacker read
the decoder's own memory gets one image's bytes, not the pool.

**What this does not protect against.** sharp is a native addon, so the child
needs `--allow-addons`, and native code is not constrained by Node's
permission model at all: `--allow-fs-read` binds only Node's own file APIs.
The child also runs as the **same OS user** as the parent. So an attacker who
achieves code execution inside libvips can make system calls directly:

- open network connections (Node 22's permission model has no network
  restriction; the crawler needs outbound internet, so the container has it);
- read any file that user can read, including `/proc/<parent pid>/environ`
  and the key file. On Linux `/proc/<pid>/environ` is the process's
  **initial** environment: `runMain` deletes `CRAWLER_SERVICE_KEY` from the
  live environment before any child exists (`src/secrets.ts`), but if the key
  was given as an env var it is still readable there. Giving it as a file
  (`CRAWLER_SERVICE_KEY_FILE`) keeps it out of every environment, but the
  file is still readable by that user;
- attach to or read the parent's memory (`ptrace`, `/proc/<pid>/mem`), and so
  the pool, wherever the kernel allows same-user tracing of a non-descendant
  (Yama `ptrace_scope` 0, or no Yama). Not tested here;
- write wherever that user may write (the read-only image filesystem and the
  unwritable `TMPDIR` still apply).

Parent-side recycling (above) limits how long one compromised child lives;
it does not prevent any of these within that time.

Deployment hardening that closes the rest (none of it is configured or tested
here):

1. Run the decoder children as a **different UID** from the parent, with the
   key file readable only by the parent's UID, or put them in a syscall
   sandbox (seccomp/gVisor/nsjail) that denies `ptrace`, `open` outside the
   bundle and `socket`. This needs a launcher change (Node's `fork` has `uid`
   and `gid` options, which need the parent to have `CAP_SETUID`).
2. Give the decoder **no network**: a separate network namespace or a seccomp
   rule against `socket`/`connect`. Cloud Run offers no per-process egress
   control, so on Cloud Run this needs (1).
3. Provide the key **as a file** from Secret Manager (below), never an env
   var, so `/proc/<pid>/environ` holds nothing.
4. Where possible, set `kernel.yama.ptrace_scope` to at least 1.

Cloud Run's own sandbox wraps the whole container (the first generation
execution environment is gVisor, the second a microVM; check which one the
job uses). Either way it separates the container from the host, not the
decoder child from the parent inside it.

Tests: `tests/unit/decoder-isolation.test.ts` (same hash as in-process; env
and argv contain no key; writes, spawning, worker threads and reads outside
the bundle and sharp are denied; hung, crashing, malformed, wrong-id and
out-of-memory children are killed and replaced; parent-side recycling by
task count and reported RSS; a dying child's image is retried once, a poison
image only once), `tests/unit/secrets.test.ts` (key deleted from the given
environment before anything else; key file) and
`tests/integration/memory-only.test.ts` (full crawl through the child process
with every parent `fs` writer patched to throw).

## Asmita API contract

Base URL `ASMITA_API_URL`, header `Authorization: Bearer <CRAWLER_SERVICE_KEY>`.

- `GET /api/crawler/pool` -> `{ version, generatedAt, threshold, fingerprints: [{ id, pdq, quality }] }`
- `GET /api/crawler/sources` -> `{ sources: [{ id, kind: "site", domain, pageBudget, delayMs, origin: "admin" | "reported" | "discovered", hops, render: "http" | "browser" | "auto" }] }`. `origin` says how a site entered the list: an admin added it, a survivor's submitted link or an approved finding named its host (crawler v2 WP1; the app copies the host only, never the link or the case), or the crawler discovered it by following links (WP5). `hops` is how far it sits from a human-added or survivor-reported site. The crawler treats every enabled source the same whatever its origin.
- `POST /api/crawler/frontier/claim` `{ sourceId, limit (1..200) }` -> `{ urls: [{ id, url, depth, etag?, lastModified? }] }` (crawler v2 WP3). The app's frontier: the next due pages of one source, claimed for 30 minutes so two crawler instances never get the same URL. A source with no rows yet gets its seed (`https://<domain>/`) created on the first claim. An empty batch means nothing is due (the daily `pageBudget` counts too); an unknown or disabled source answers empty, never an error.
- `POST /api/crawler/frontier/report` `{ sourceId, runId, pages: [{ id, status: "fetched" | "not_modified" | "gone" | "blocked" | "error", etag?, lastModified?, links: [{ url, kind: "page" | "sitemap" | "feed" }] (max 500) }] }` -> `{ accepted: number }` (crawler v2 WP3). The app schedules the next visit (24 h after fetched, doubling after not_modified up to 14 days, 1 h / 6 h / 24 h after error and dead after five failures, gone dead), stores the new in-scope links deduplicated per source on a keyed digest and counts the pages against the source budget. Retry-safe: a report the server applied but the crawler never saw answered only moves schedules forward. The scope check the crawler does is repeated by the app on every link.
- `POST /api/crawler/findings` `{ runId, findings: [{ fingerprintId, pageUrl, imageUrl, distance, quality, observedAt, sourceId }] }` -> `{ results: [{ status: "accepted" | "rejected", reason? }] }`. `accepted` covers new and already-known findings alike, so the crawler cannot tell whether two pool ids belong to one case; the old `"created"` / `"duplicate"` are still tolerated and counted as accepted. A page must be on its source's host or a subdomain (`page_not_in_source`, which also sets exit code 4); the image may be on another public host. A page or image address with credentials or a non-default port is refused (`invalid_url`); the crawler never fetches one

Responses are validated with Zod. Findings are validated locally with the
server's rules (strict objects, `runId` `[A-Za-z0-9_.:-]{1,64}`, integer
`distance` 0..31, `observedAt` with offset) and batched by count (50) and size
(240 KiB of the server's 256 KiB). `pageUrl` is the page as crawled (before
any redirect of the page); `imageUrl` is the image address after its
redirects.

| Status | Crawler behaviour |
|---|---|
| 503 | crawler switched off: stop, exit 0 |
| 401/403 | stop, exit 2 |
| 400 | our bug: log the code, drop the batch, no retry |
| 413 | split the batch and resend |
| 429, 5xx, network | retry with backoff + jitter (`Retry-After` honoured); a batch still failing is retried at the final flush. Safe: the server dedups |
| 3xx | refused (the key never follows a redirect) |

Per-item rejection reasons (`invalid_finding`, `media_payload_rejected`,
`invalid_url`, `unknown_source`, `fingerprint_not_accepted`,
`page_not_in_source`) are counted in the summary (`rejectedByReason`);
`fingerprint_not_accepted` withdraws that fingerprint immediately, and
`page_not_in_source` makes the run exit 4. Accepted findings are counted as
`findingsAccepted`.

## Run summary

The last log line, `run_summary`, holds: outcome, duration, sources crawled,
pages attempted/fetched/not-modified/non-HTML, the largest claimed frontier
batch (`batchPeak`), links dropped by the per-page cap, images
seen/hashed/skipped by reason, matches, findings
queued/posted/accepted/rejected (by reason)/withdrawn/invalid/failed/unsent,
pool syncs, robots outcomes, errors by code, page and image budget used.

## Running locally

```bash
cd crawler
npm ci
npm run check            # lint + type-check + tests + build
npm run mock             # full crawl of a local fixture site against a mock API
npm run bench:matcher    # matcher benchmark (default 100k fingerprints)
```

`npm run mock` uses the test-only loopback policy (injected in code) and
synthetic images. To exercise the real build end to end without crawling
anything, start the mock API with no sources and point the binary at it:

```bash
npm run mock:api                 # prints the mock URL and a throwaway key
npm run build
VIPS_DISC_THRESHOLD=2g ASMITA_API_URL=http://127.0.0.1:8787 \
  CRAWLER_SERVICE_KEY=<printed key> CRAWLER_USER_AGENT="AsmitaCrawler/0.1 (local)" \
  node dist/main.js run
```

Never point a local run at real sites with real fingerprints.

## Configuration

Validated with Zod at startup; anything invalid stops the process before any
network activity and the log names only the offending variable names. See
`.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `ASMITA_API_URL` | required | https origin of the Asmita app (http only for a loopback mock) |
| `CRAWLER_SERVICE_KEY_FILE` | one of these two | path to a file holding only the key (one trailing newline is dropped). Recommended in production |
| `CRAWLER_SERVICE_KEY` | one of these two | the key itself, 32-512 printable chars; for local runs. Setting both is refused. Either is deleted from the environment at startup |
| `CRAWLER_USER_AGENT` | required | `Token/version (+contact URL)`; the token is matched in robots.txt |
| `MAX_RUN_MINUTES` | 50 | wall-clock limit, then graceful stop |
| `MAX_PAGES` / `MAX_IMAGES` | 5000 / 20000 | global budgets (attempts, not successes) |
| `MAX_DEPTH` | 5 | BFS depth from the source home page |
| `MAX_LINKS_PER_PAGE` / `MAX_IMAGES_PER_PAGE` | 500 / 200 | candidates taken from one page |
| `FRONTIER_CLAIM_LIMIT` | 50 | pages claimed from the app's frontier per request (1..200); the crawler's whole frontier memory is one batch plus its report |
| `GLOBAL_CONCURRENCY` | 4 | concurrent requests across all hosts |
| `DECODE_CONCURRENCY` | 1 | decoder child processes (a 25 MP decode is ~100 MB) |
| `DECODE_TIMEOUT_MS` | 20000 | per-image decode deadline; the child is killed and replaced |
| `MAX_HTML_BYTES` / `MAX_IMAGE_BYTES` | 2 MiB / 10 MiB | body caps (also after decompression) |
| `MIN_IMAGE_SIDE` | 64 | smaller images are skipped |
| `OFFSITE_HOST_DELAY_MS` | 1000 | delay per off-source image host (CDNs) |
| `MAX_OFFSITE_IMAGE_HOSTS` | 50 | distinct off-scope hosts that returned an image, per source per run |
| `MAX_OFFSITE_HOST_FAILURES` | 20 | distinct off-scope hosts tried without returning an image, per source per run (1..1000) |
| `MAX_CRAWL_DELAY_MS` | 30000 | cap on honoured robots `Crawl-delay` |
| `POOL_RESYNC_MINUTES` | 30 | 1..60 |
| `CONNECT_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`, `BODY_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS` | 10s, 15s, 15s, 30s | fetch timeouts |
| `FETCH_ATTEMPTS` | 3 | per crawl request |
| `API_TIMEOUT_MS`, `API_ATTEMPTS` | 30s, 4 | Asmita API calls |
| `SHUTDOWN_GRACE_MS` | 5000 | after SIGTERM/time limit, in-flight work gets this long before being aborted |
| `LOG_LEVEL` | info | debug, info, warn, error |

The source's own `delayMs` applies to its hosts; `pageBudget` caps its pages.

## Deployment notes (Cloud Run job, documentation only)

Nothing here has been deployed.

- Build from the repository root: `docker build -f crawler/Dockerfile -t asmita-crawler .`
  (BuildKit picks up `crawler/Dockerfile.dockerignore`). Image: distroless
  `nodejs22-debian12:nonroot`, runs as non-root, sharp's prebuilt libvips.
- Region `asia-south1` (Mumbai). Create a Cloud Run **job**, not a service:
  `gcloud run jobs create asmita-crawler --region asia-south1 --image <image> --tasks 1 --max-retries 0 --task-timeout 3600s --memory 2Gi --cpu 1`.
  Keep `MAX_RUN_MINUTES` below the task timeout so the run ends gracefully.
- Secrets: store the key in Secret Manager and mount it **as a file**, then
  point `CRAWLER_SERVICE_KEY_FILE` at it (for example
  `--set-secrets /secrets/crawler-service-key=crawler-service-key:latest` with
  `CRAWLER_SERVICE_KEY_FILE=/secrets/crawler-service-key`; check the exact
  flag form against the Cloud Run docs, not verified here). Not as an env
  var: see "What this does not protect against". Give the job's service
  account only `roles/secretmanager.secretAccessor` on that secret. Other
  settings as plain env vars.
- Filesystem: the process writes nothing. Cloud Run's filesystem is in-memory
  and cannot be made read-only, so verify with `docker run --read-only` (CI
  does) and rely on the unwritable `TMPDIR` in the image.
- Schedule with Cloud Scheduler calling the job's `run` endpoint (e.g. nightly
  IST), with a dedicated invoker service account.
- Egress: the job needs outbound internet. Do not attach it to a VPC with
  private routes it could reach; the SSRF guard blocks private ranges anyway.
- On SIGTERM (Cloud Run gives 10 s) the crawler stops new work, gives
  in-flight work `SHUTDOWN_GRACE_MS`, flushes findings and exits 0.

## Known limits

- No JavaScript execution: content rendered client-side is invisible.
- PDQ does not survive crops, rotations, flips, heavy overlays or large
  borders; only near-duplicates are found.
- Public pages only. The crawler never logs in, never sends cookies, and never
  bypasses logins, paywalls, CAPTCHAs or robots.txt.
- CMYK images are best-effort; JPEG/WebP decoders differ slightly from
  Chromium's (see the agreement numbers above).
- AVIF is accepted (AV1 only); HEIC/HEVC is not, since this libvips build
  cannot be relied on to decode it and browsers' support varies.
