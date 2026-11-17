# Crawler runbook

Status: built, switched off everywhere (`ENABLE_CRAWLER` unset or `false`), 2026-11-16. Nothing here has been deployed. Real survivor fingerprints, real sites and real notices wait for every item in the go-live checklist at the end (ADR 006).

What it is: `docs/adr/006-hash-matching-crawler.md`. The notice path and every refusal code: `docs/product/crawler-notice-flow.md`. The service itself: `crawler/README.md`.

Several steps need the owner's own accounts (Google Cloud, Supabase, Cloudflare). They are written as instructions for him; nobody else runs them.

## 1. Service key

The crawler authenticates to Asmita with a bearer key (`cwk_` + 48 hex). Only its sha256 is stored (`CrawlServiceKey.keyHash`). A missing, wrong or revoked key gets the same 401.

Issue (from `asmita/`, with the owner's database connection, never committed):

```bash
DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs issue "cloud-run mumbai"
```

The key is printed once. Put it straight into Secret Manager (section 4) and nowhere else: not a chat, an issue, a log or a file in the repository.

List and revoke:

```bash
DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs list
DATABASE_URL=<owner connection> node scripts/issue-crawler-service-key.mjs revoke <key id>
```

Revoke at once if a key may have leaked, then issue a new one and replace the secret version. A revoked key makes the next run exit 2. Rotate at least whenever someone who saw the key leaves.

## 2. Sources

A SUPER_ADMIN (`crawler:manage`) manages hosts at `/admin/crawl-sources`.

- Add the host name only (for example `news.example-site.org`). Pages are crawled on that host and its subdomains only; links off it are never followed. Images those pages embed may come from other public hosts (CDNs). **Owner decision to confirm:** that embedded images may be fetched from other public hosts (ADR 006 A1).
- A new host starts switched off. Set a page budget (pages a run may fetch, up to 10,000) and a delay between pages (500 ms to 60 s), then switch it on in the confirmation dialog. Both can be edited later.
- Every change is audited (`ADMIN_ACTION`, `crawl_source_*`). Record the reason for each host outside the code (ADR 006 go-live gate 6).
- While `ENABLE_CRAWLER` is off, the list can be read but nothing can be changed (503 `crawler_disabled`).
- Before go-live: test fixture sites only. Never add a real third-party site until the checklist is complete.

**Sites from survivor reports (crawler v2 WP1).** Every source also records how it entered the list (`origin`):

- `admin`: a SUPER_ADMIN added it, as above.
- `reported`: created automatically when a survivor's submitted link, or an analyst-approved crawler finding, names its host. Only the host is ever copied — never the link, the case or anything identifying her — and the row carries no approver. These sources are enabled from birth with the default budget and delay (section 3), idempotent per host, and they survive the erasure of her account: nothing links them to her. An audit entry (`CRAWL_SOURCE_REPORTED`, on the source itself) records each creation with no actor. Analysing or disabling them works exactly as for admin sources.
- Hosts on the never-crawl list are never created automatically: the built-in list in `asmita/src/lib/crawl-never.ts` (major social platforms, search engines, app stores, webmail, banks and payment sites, government `*.gov.*` and `*.nic.in`, news wires, Asmita's own domains) plus the admin-managed `CrawlBlockedHost` table, where a host matches if it equals an entry or is a subdomain of one. The list is a floor: it stops the automatic paths only, never a SUPER_ADMIN adding a host by hand.

## 3. Environment variables

App (Worker vars in `asmita/wrangler.jsonc` or secrets; see `asmita/.env.example`):

| Variable | Value | Notes |
|-|-|-|
| `ENABLE_CRAWLER` | `false` until go-live | The kill switch (section 7). Read only in `src/lib/crawler-auth.ts` |
| `ENABLE_HASH_UPLOAD` | `true` | Needed for fingerprints, the authorisation and the notice annex |
| `CRAWLER_SHOW_FINDINGS_TO_SURVIVOR` | unset (on) | `false` hides found links from her: case page and case APIs (counts too), and her link actions (mark removed, platform filed, sign, preview) answer such a link's id exactly like an id not on her case. Her data export still lists them, labelled "Found by Asmita"; admin views unaffected. Read only in `src/lib/crawler-flags.ts`. Open owner decision |
| `CRAWLER_REPORTED_PAGE_BUDGET` | unset (2000) | Page budget of a source created automatically when a survivor's link or an approved finding names its host (WP1). Clamped to the admin bounds (1..10,000); an unset or invalid value falls back to the default. Read only in `src/lib/crawler-flags.ts` |
| `CRAWLER_DISCOVERED_PAGE_BUDGET` | unset (200) | Same, for sites the crawler will discover by following links (used from WP5 on) |
| `CRAWLER_DEFAULT_DELAY_MS` | unset (1500) | Delay between pages of any automatically created source (WP1). Clamped to 500..60,000 ms |
| `NOTICE_DISPATCH_PERSISTENCE` | `database` | As for every deployed Worker; needed so a sent notice is recorded |
| `DEV_SKIP_LEGAL_REVIEW` | never set | Dev only; production ignores it (`src/lib/dev-flags.ts`) |

Crawler (Cloud Run job env vars; placeholders in `crawler/.env.example`):

| Variable | Notes |
|-|-|
| `ASMITA_API_URL` | The production origin, `https` only |
| `CRAWLER_SERVICE_KEY_FILE` | Path of the key file mounted from Secret Manager (section 4). The production method |
| `CRAWLER_SERVICE_KEY` | The key itself. Local runs only: on Linux an env var stays readable in `/proc/<pid>/environ` even after the crawler deletes it at startup. Setting both is refused |
| `CRAWLER_USER_AGENT` | Identifies Asmita and links to a page explaining the crawler |
| `MAX_RUN_MINUTES` | Keep below the job's task timeout (default 50 with a 60-minute timeout) |
| Limits | `MAX_PAGES`, `MAX_IMAGES`, `MAX_DEPTH`, byte caps, timeouts, concurrency: defaults in `crawler/README.md`, "Configuration" |

## 4. Build and deploy (owner, Google Cloud)

Region: Mumbai, `asia-south1` (the pool is survivor data and stays in India, ADR 004). A Cloud Run **job**, not a service.

1. Build from the repository root (the image includes the read-only PDQ module from `asmita/`):

   ```bash
   docker build -f crawler/Dockerfile -t asia-south1-docker.pkg.dev/<project>/asmita/crawler:<git sha> .
   docker run --rm --read-only --network none asia-south1-docker.pkg.dev/<project>/asmita/crawler:<git sha> run   # must exit 1: no configuration
   docker push asia-south1-docker.pkg.dev/<project>/asmita/crawler:<git sha>
   ```

   Use the commit sha as the tag, never `latest`. Crawler CI builds the same image and runs it with `--read-only`.

2. Secret: create `crawler-service-key` in Secret Manager in the same project and add the key from section 1 as a version. Create a service account for the job (for example `asmita-crawler@<project>.iam.gserviceaccount.com`) with only `roles/secretmanager.secretAccessor` on that one secret. No other roles.

3. Job:

   ```bash
   gcloud run jobs create asmita-crawler \
     --region asia-south1 \
     --image asia-south1-docker.pkg.dev/<project>/asmita/crawler:<git sha> \
     --service-account asmita-crawler@<project>.iam.gserviceaccount.com \
     --tasks 1 --max-retries 0 --task-timeout 3600s --memory 2Gi --cpu 1 \
     --set-secrets /secrets/crawler-service-key=crawler-service-key:latest \
     --set-env-vars CRAWLER_SERVICE_KEY_FILE=/secrets/crawler-service-key,ASMITA_API_URL=https://<production origin>,CRAWLER_USER_AGENT="<agent>",MAX_RUN_MINUTES=50
   ```

   The key is mounted as a file, not an env var. The `--set-secrets <path>=<secret>:<version>` file form is written from memory and has not been run: check it against the current Cloud Run jobs documentation before use.

   What the decoder isolation gives and does not give (`crawler/README.md`, "Decoder isolation"): decoder children never receive the pool, the key or URLs, cannot write files or spawn processes from JavaScript, and are recycled by the parent. They run as the same OS user as the crawler, and native code in an exploited decoder is not bound by Node's permission model, so it could reach the network, read the key file and, where the kernel allows same-user tracing, the parent's memory. Before go-live, harden the deployment (checklist below): run the decoder children under a separate UID or a syscall sandbox (seccomp, gVisor, nsjail) with no network, the key file readable only by the crawler's own UID. Cloud Run's sandbox (gVisor in the first-generation execution environment, a microVM in the second) wraps the whole container; it does not separate the decoder from the crawler inside it, and Cloud Run has no per-process egress control.

   Read-only filesystem: the image is built for `docker run --read-only` (non-root, distroless, `TMPDIR` pointing at a path that does not exist), and the process never writes. Cloud Run's own filesystem is in-memory and cannot be mounted read-only, so the guarantee comes from the image and the tests, verified with `--read-only` in CI. Do not attach the job to a VPC with private routes.

4. Schedule with Cloud Scheduler: a dedicated invoker service account with `roles/run.invoker` on the job only, calling the job's `run` endpoint once a night (IST). The pool must be re-synced at least hourly within a run, which the crawler does itself.

5. Updating: build and push a new sha, then `gcloud run jobs update asmita-crawler --region asia-south1 --image <new image>`.

## 5. Exit codes and what to do

Each run ends with a `run_summary` log line carrying `exitCode` and a `problems` object. Logs never contain addresses, fingerprints or image data.

| Code | Meaning | Do this |
|-|-|-|
| 0 | Clean run, or the app has the crawler switched off (503) | Nothing. If findings were expected and none came, check `ENABLE_CRAWLER` and that sources are on |
| 1 | Bad configuration or unexpected failure | Read the summary's error code; fix the env vars or secret; rerun once by hand |
| 2 | Service key rejected (401/403) | The key was revoked, mistyped, or `ENABLE_CRAWLER` and the key do not match the environment. Issue a new key (section 1), add a secret version, rerun |
| 3 | Findings undelivered (Asmita API down past retries) | Check the Worker and database health; the next run reports the same matches again |
| 4 | Contract error: Asmita refused a request as malformed (400) | A crawler and app version mismatch. Do not rerun repeatedly; deploy matching versions (the crawler's client and the app's findings route must agree) |
| 5 | Pool could not be re-synced for 60 minutes; run stopped | Check the Worker and `/api/crawler/pool` (needs the key and `ENABLE_CRAWLER=true`); the stop is deliberate so withdrawn fingerprints never keep matching |
| 64 | Bad command line | The job's command or args were changed; restore `run` |

A failing site (down, robots.txt unreachable, timeouts) is not a run failure; it is counted in the summary.

## 6. Analyst work

At `/admin/findings` (`findings:review`). Interim safety guidance is on every finding page; the written procedures in the checklist replace it.

- An address is shown only after a reason is given; each reveal is logged and audited and limited to 20 an hour.
- Above distance 20 a second, different analyst must approve.
- The notice preview shows both addresses, so it counts as a reveal (logged, audited, 20 an hour). The analyst confirms that before previewing; nothing previews by itself. Send sends exactly the previewed notice, and only while the preview is on screen: it is cleared, PDF included, after 2 minutes without activity.
- Downloading the PDF asks for confirmation first: it holds both addresses and must not be kept on a personal device. The file name carries no case reference. Copying a revealed address carries the same caution.

## 7. Kill switch

Set `ENABLE_CRAWLER=false` (or remove it) on the Worker and deploy. At once:

- the pool, sources and findings routes answer 503, so a running crawler stops matching and exits 0;
- analysts can still read findings and their history, but review, notices and source changes return 503 `crawler_disabled`;
- survivors cannot sign a new authorisation, and can still withdraw.

To stop one site only, switch its source off. To stop the job running at all, pause the Cloud Scheduler trigger. To cut off a crawler whose key may have leaked, revoke the key (section 1).

## 8. Unconfirmed send

There is no admin action to resolve an unconfirmed send, for crawler notices or for survivor notices (`email_already_sent` on `/api/notices/dispatch` has none either). One was not invented. The console tells the analyst to stop and ask the SUPER_ADMIN.

What the codes mean:

- `dispatch_in_progress`: another request holds the claim. Usually a double click or two analysts at once; wait a minute and reload.
- `link_now_survivor_owned`: the survivor reported the same page herself just before the send, so the link became hers. Nothing was sent; she signs her own notice for it. Not an unconfirmed send.
- `email_already_sent`: Resend already accepted this exact notice under its idempotency key. Nothing is sent twice. If the link still shows as not sent after a reload, it reached Resend without being recorded.
- `earlier_attempt_unconfirmed`: a notice was stored on the link as a claim (`representativeNoticePdf`, `representativeNoticeDigest`) but never recorded as sent, and the notice the analyst would send now differs (usually because the date changed). It may have reached the platform.

Resolution, by the owner only:

1. Do not retry from the console.
2. In the Resend dashboard, look for an email to the platform's grievance address with the case reference in the subject, around the time of the attempt (the admin access log shows the preview time). The idempotency key is `notice:` followed by a sha256 of the case id, link id and recipient.
3. If Resend shows it was sent: the platform has the notice. Record that in the incident log with the Resend message id, tell the reviewer, and leave the link as it is until a recording procedure is agreed. Do not send it again.
4. If Resend shows nothing for that recipient and case: with a second person present, clear the claim on that one `SubmittedUrl` row (set the seven `representative*` fields to null where `id` is the link and no `Notice` row exists for it), note it in the incident log, then the analyst previews and sends again.
5. Either way, write an incident entry (`docs/ops/incident-runbooks.md`).

## 9. Go-live checklist

Every item, in writing, before a real fingerprint enters the pool, a real site is added, or a representative notice goes to a real platform.

- [ ] A legal reviewer approves the two templates, `CRAWL_AUTHORISATION` and `CRAWL_REPRESENTATIVE_NOTICE`, and sets `reviewedByLegal` on each in the console (never in code or seeds). Includes: the legal basis for acting as her representative and the removal period (both `[CITATION REQUIRED]` now); the notice's statement that she declared the images intimate and shared without consent, which rests on item 8 of the draft authorisation; the particulars and signature lines code adds (`src/lib/crawl-notice.ts`); and one tick box covering both comparison and notices (ADR 002 condition 2).
- [ ] The legal reviewer gives a written read on fetching and fingerprinting third-party images in memory, including images fetched from other hosts that approved pages embed.
- [ ] A written procedure for an analyst who meets suspected child sexual abuse material on a matched page: what to do, whom to report to, within what time.
- [ ] An analyst welfare rule: limits on viewing, support, and who may review.
- [ ] Hindi crawl strings reviewed by a native speaker (`src/i18n/hi-review-status.json`).
- [ ] Migrations `20261116000000_crawler_backend`, `20261116010000_crawler_representative_notice`, `20261116020000_crawl_finding_consent` and `20261117000000_crawl_source_origins` applied to a real Postgres, and the Kysely and Prisma paths exercised there (ingest, review, preview, dispatch, withdrawal, deletion request, reported-source creation). So far only mocks and the memory store have run them.
- [ ] **Blocking, NOT YET VERIFIED:** the Worker (Kysely) path against a real Postgres. Every crawler unit test mocks `usesWorkerKysely` to false, and the default Worker smoke makes no crawler call, so the Worker ingest path, its `FOR SHARE` consent lock racing a withdrawal, and the Case-row lock that serialises a final approval with her own report of the same page (`src/lib/case-link-lock.ts`) have never run against Postgres. Run the migrations, then a Postgres-backed test that races a finding ingest against a withdrawal and an approval against her report, and check the outcomes and that no deadlock occurs.
- [ ] **Blocking:** the Worker smoke with the crawler step: `SMOKE_CRAWLER=1` with `scripts/worker-smoke.mjs` (key lookup, sources, pool and a refused finding in workerd against the e2e database). Written, never run; turn it on in CI once it passes.
- [ ] **Blocking:** the legal reviewer also reviews the privacy-policy sentence about the data export (`privacy.s10.i1.detail` in `src/i18n/en.json` and `hi.json`: the download lists every link on the case, including links Asmita found, labelled "Found by Asmita", even when her case page does not show them), alongside the two draft templates above.
- [ ] `tests/e2e/crawler-journey.spec.ts` run green against a local Postgres.
- [ ] Crawler CI green on Linux and the Docker image built and run with `--read-only`, including a real decode in the container (the decoder child's narrowed `--allow-fs-read` list has been tested on Windows only).
- [ ] Decoder hardening decided and in place (section 4): decoder children under a separate UID or a syscall sandbox, without network, and the key given as a file (`CRAWLER_SERVICE_KEY_FILE`), never an env var. Not configured or tested today.
- [ ] Hosting confirmed in India (`asia-south1`) and the job set up as in section 4.
- [ ] Owner decisions recorded: survivors see found links (`CRAWLER_SHOW_FINDINGS_TO_SURVIVOR`); embedded images from other hosts; whether dismissed or sent findings may recur after the 30-day purge; the same-day limit on retrying a failed send.
- [ ] The MeitY SOP date discrepancy (October 2025 in `CLAUDE.md`, November 2025 in ADR 006) checked by a human against the SOP.
- [ ] Grievance contacts used have `lastContactVerifiedByHuman`.
- [ ] Each source added by a SUPER_ADMIN with a recorded reason; each automatic (reported) source accounted for in the review, with the never-crawl list (built-in and `CrawlBlockedHost`) reviewed by a human before any real site is touched.
- [ ] First run on test fingerprints and test sites only, with the results checked, before any real fingerprint is in the pool.
