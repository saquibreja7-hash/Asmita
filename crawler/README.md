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
       per source (parallel up to GLOBAL_CONCURRENCY), BFS within its domain:
         SafeFetcher (pinned-IP connect, robots, per-host delay) -> HTML
         extract.ts -> links (in scope, not nofollow) + image candidates
         per image: SafeFetcher -> Buffer -> hash-image.ts (sniff, sharp,
                    prepare.ts, pdq.ts) -> Matcher -> FindingsSink
       pool re-sync every POOL_RESYNC_MINUTES (<= 60)
       FindingsSink: POST /findings in batches (<= 50 items, <= 240 KiB),
                     whenever a batch fills, every 15 s, and at once on stop
  -> run_summary log line, exit code
```

### Exit codes

A run exits 0 only when nothing needs an operator's attention. The code is
also in the `run_summary` log line (`exitCode`, plus a `problems` object).
When several apply, the first row in this table wins.

| Code | Meaning |
|---|---|
| 0 | Clean run (including SIGTERM, time limit, budget reached), or the crawler is switched off on the server (503), even if findings were then left unsent |
| 2 | The API rejected the service key (401/403), at load or mid-run |
| 4 | Contract error: the server refused a request as malformed (400) and the batch was dropped |
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
| **Scope.** Pages only within the source's registrable domain (private suffixes on, so `x.blogspot.com` stays `x.blogspot.com`), BFS to `MAX_DEPTH`, `pageBudget` per source. Image hosts may differ (CDNs) but pass every safe-fetch check. | `crawl/url.ts`, `crawler.ts`. | `crawl.test.ts` (off-domain site never requested, CDN image fetched) |
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
setting, so the agreement numbers above are unaffected. Chromium's
`createImageBitmap` (the survivor path) rejects truncated files outright; that
matters for same-file agreement, not for finding copies. Stricter behaviour,
if wanted, belongs in a policy check in `src/image/hash-image.ts`, not in the
recipe.

Matching: images with PDQ quality below 50 are skipped; brute-force Hamming
over a packed `Uint32Array` with SWAR popcount; threshold = pool `threshold`
capped at 31. Every pool entry within the threshold becomes its own finding,
best first (one picture can be in several survivors' submissions).
`npm run bench:matcher` on a laptop (Node 22): about **0.9 ms per query at
100,000 fingerprints** and about 13 ms at 1,000,000.

## Asmita API contract

Base URL `ASMITA_API_URL`, header `Authorization: Bearer <CRAWLER_SERVICE_KEY>`.

- `GET /api/crawler/pool` -> `{ version, generatedAt, threshold, fingerprints: [{ id, pdq, quality }] }`
- `GET /api/crawler/sources` -> `{ sources: [{ id, kind: "site", domain, pageBudget, delayMs }] }`
- `POST /api/crawler/findings` `{ runId, findings: [{ fingerprintId, pageUrl, imageUrl, distance, quality, observedAt, sourceId }] }` -> `{ results: [{ status: "created" | "duplicate" | "rejected", reason? }] }`

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

Per-item rejection reasons are counted in the summary (`rejectedByReason`);
`fingerprint_not_accepted` withdraws that fingerprint immediately.

## Run summary

The last log line, `run_summary`, holds: outcome, duration, sources crawled,
pages attempted/fetched/non-HTML, images seen/hashed/skipped by reason,
matches, findings queued/posted/created/duplicate/rejected (by reason)/
withdrawn/invalid/failed/unsent, pool syncs, robots outcomes, errors by code,
page and image budget used.

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
| `CRAWLER_SERVICE_KEY` | required | bearer key, 32-512 printable chars |
| `CRAWLER_USER_AGENT` | required | `Token/version (+contact URL)`; the token is matched in robots.txt |
| `MAX_RUN_MINUTES` | 50 | wall-clock limit, then graceful stop |
| `MAX_PAGES` / `MAX_IMAGES` | 5000 / 20000 | global budgets (attempts, not successes) |
| `MAX_DEPTH` | 5 | BFS depth from the source home page |
| `GLOBAL_CONCURRENCY` | 4 | concurrent requests across all hosts |
| `DECODE_CONCURRENCY` | 1 | concurrent image decodes (a 25 MP decode is ~100 MB) |
| `MAX_HTML_BYTES` / `MAX_IMAGE_BYTES` | 2 MiB / 10 MiB | body caps (also after decompression) |
| `MIN_IMAGE_SIDE` | 64 | smaller images are skipped |
| `OFFSITE_HOST_DELAY_MS` | 1000 | delay per off-source image host (CDNs) |
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
- Secrets: store `CRAWLER_SERVICE_KEY` in Secret Manager and mount it as an env
  var (`--set-secrets CRAWLER_SERVICE_KEY=crawler-service-key:latest`); give the
  job's service account only `roles/secretmanager.secretAccessor` on that
  secret. Other settings as plain env vars.
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
