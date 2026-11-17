# Crawler on Cloudflare Containers

Runs the crawler service (`crawler/`, ADR 006) on Cloudflare. Worker
`asmita-crawler` has a cron trigger at minute 5 of every hour. It asks one
Durable Object to start a crawler container from `crawler/Dockerfile`
(unchanged) if none is running. The container runs one pass (`run`, stopped at
`MAX_RUN_MINUTES` = 50) and exits. The Worker has no public URL.

Needs the Workers Paid plan (Containers) and `ENABLE_CRAWLER=true` on
`asmita-production` (set in `asmita/wrangler.jsonc`).

## First deploy

1. Docker running locally (wrangler builds the image from the Dockerfile).
2. Issue a service key and store it as the Worker's secret without printing
   it: see "Service key" below.
3. From this folder: `npm ci && npm run check && npx wrangler deploy`.

## Service key

The app stores only the key's sha256 (`CrawlServiceKey`). Generate the key,
put it in the Worker secret `CRAWLER_SERVICE_KEY` (`npx wrangler secret put
CRAWLER_SERVICE_KEY`, reading from stdin) and insert its hash with
`asmita/scripts/issue-crawler-service-key.mjs` or an equivalent one-off that
never prints the key. Revoke with `issue-crawler-service-key.mjs revoke <id>`.

## Settings (`wrangler.jsonc` vars)

| Var | Value |
| --- | --- |
| `ASMITA_API_URL` | `https://meriasmita.org` |
| `CRAWLER_USER_AGENT` | `AsmitaCrawler/2.0 (+https://meriasmita.org)` |
| `MAX_RUN_MINUTES` | 50 |
| `INSTANCE_TYPE` | `standard-2` (1 vCPU, 6 GiB) |

Other crawler settings keep their defaults (`crawler/README.md`). To pass one,
add it to the `env` object in `src/index.ts`.

## Operating

- Stop crawling: delete the cron trigger (or the Worker), or switch
  `ENABLE_CRAWLER` off on the app; the crawler then exits at its first API call.
- Logs: Workers Observability for `asmita-crawler` (container stdout is the
  crawler's JSON log lines: counts and codes only, no addresses).
- Browser rendering (sources set to BROWSER/AUTO) stays off for real sites
  until the Chromium worker is sandboxed (runbook go-live item). Containers
  give no `--shm-size` option, so do not enable it here without testing.
