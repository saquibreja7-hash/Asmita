# Crawler on Cloudflare Containers

Runs the crawler service (`crawler/`, ADR 006) on Cloudflare. Worker
`asmita-crawler` has a cron trigger at minute 5 of every hour. It asks one
Durable Object to start a crawler container from `crawler/Dockerfile`
(unchanged) if none is running. The container runs one pass (`run`, stopped at
`MAX_RUN_MINUTES` = 50) and exits. The Worker has no public URL.

Needs the Workers Paid plan (Containers) and `ENABLE_CRAWLER=true` on
`asmita-production` (set in `asmita/wrangler.jsonc`).

## Deploying

GitHub Actions (`.github/workflows/crawler-deploy.yml`) builds the image and
deploys on every push to master that touches `crawler/`, `asmita/src/lib/pdq/`
or this folder, after the same checks as Crawler CI. It can also be run by
hand from the Actions tab. It needs two repository secrets:
`CLOUDFLARE_API_TOKEN` (Account: Workers Scripts Edit, Containers Edit,
Account Settings Read) and `CLOUDFLARE_ACCOUNT_ID`.

## Service key

Run the workflow by hand with **rotate_service_key** ticked. It generates a
new key, stores it as the Worker secret `CRAWLER_SERVICE_KEY` and prints only
its sha256 in the job summary; the key itself is never shown. Register that
hash in `CrawlServiceKey` (the app stores only hashes), then revoke the old
key with `asmita/scripts/issue-crawler-service-key.mjs revoke <id>`.

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
