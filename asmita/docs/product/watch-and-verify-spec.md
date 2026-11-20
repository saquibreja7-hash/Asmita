# Watch for my images, and keeping content down: specification and work packages

Owner decision, 19 November 2026 (Saquib): build two uses of the crawler beyond filing a complaint.

1. **Keeping content down** (inside a case): after a link is reported removed, check that it really is, and keep watching for re-uploads after the case closes.
2. **"Watch for my images"** (no complaint yet): a survivor fingerprints her images and is alerted if a copy is found; nothing goes to any platform unless she chooses.

Read first: root `CLAUDE.md`, `asmita/AGENTS.md`, "Rules that do not change" in `crawler/docs/full-crawler-spec.md` (they apply here unchanged), `asmita/docs/adr/006-hash-matching-crawler.md`, `asmita/docs/product/crawler-notice-flow.md`.

## Rules for both features

1. She never sees an image. Dashboards and emails show at most a **site name** and a status.
2. Emails carry **only her case reference** and a sign-in prompt: never a link, image, site name or platform name (shared phones and inboxes).
3. Adults only: the existing age check and minor routing apply to the new entry point unchanged.
4. Nothing is sent to a platform without either her signature (existing flows) or her full crawl authorisation (existing representative-notice path). A watch-only consent never sends anything.
5. New legal text (the watch-only authorisation template, consent and email wording) is created **unreviewed**; never set `reviewedByLegal`. Record in the progress notes that counsel must read it.
6. Every new survivor-facing string goes into `en.json` and `hi.json`; new Hindi keys are listed as machine translated in `hi-review-status.json`. No left-border accent stripes in any new UI (owner rule).
7. Prisma, Kysely (Worker) and the memory store stay aligned; migrations additive only; account deletion and purge cover every new table and column.
8. The crawler service (`crawler/`) is **not** changed by these WPs: verification reuses the existing frontier claim/report and findings contract. (A separate lane is editing `crawler/` and `asmita/src/lib/crawl-pages.ts`; keep changes to `crawl-pages.ts` minimal and self-contained, preferably by calling it from a new module.)

## How this runs (Hermes)

Two parallel lanes, each on its own branch cut from `feat/watch-verify`. Progress notes go to `crawler/docs/v2-progress.md` under a `## Watch and verify` heading. Checks and commit rules are those of `crawler/docs/full-crawler-spec.md` "How to work".

- Lane W1 (`feat/watch-w1`): WP22
- Lane W2 (`feat/watch-w2`): WP23, then WP24

## WP22. "Watch for my images" (app)

**Data.** Add `CaseMode { CASE, WATCH }` with `Case.mode` (default `CASE`), and `CrawlConsentScope { SEARCH_AND_NOTICE, WATCH_ONLY }` with `CrawlConsent.scope` (default `SEARCH_AND_NOTICE`). Add `WATCH_AUTHORISATION` to `TemplateType` and a seed for it (unreviewed): she authorises Asmita to compare her fingerprints with images on public websites and to alert her; nothing is sent to any platform unless she later chooses "Take it down".

**Entry.** On the start page, next to "File a complaint", a second option "Watch for my images" leads to `/watch`. It reuses the registration flow (age check with minor routing, email, one-time code), then the fingerprinting step (images and, when `ENABLE_HASH_UPLOAD` and video support are present, videos), then one tick: "Search the web for copies of these images and alert me. Nothing is sent to any platform unless I choose." Ticking creates a `Case` with `mode = WATCH` and a `CrawlConsent` with `scope = WATCH_ONLY` (same template-review gate, record and audit as the existing tick consent). No links are asked for.

**Watch page.** `/case/[caseId]` renders a watch view when `mode = WATCH`: "Watching since <date> · No copies found so far" (or "N possible copies: see below"), buttons "Add more images" and "Stop watching" (withdraws the consent and deletes her fingerprints, with the existing withdrawal confirmation). Track your case and the Close my case button work for watches too.

**When a copy is found.** Crawler findings for a watch go to analyst review as today. When an analyst approves one: she gets an email (reference only) "We may have found a copy of your image. Sign in to see it." Her watch page lists the **site name** only, with two choices:
- **Take it down:** turns the watch into a case (`mode = CASE`) and asks for the existing full crawl authorisation tick on the spot; once given, the existing representative-notice path applies to that finding.
- **Not now:** keeps watching; nothing is sent.

**Gates.** A representative notice (`crawl-notice.ts`) is refused while the case's only live consent is `WATCH_ONLY` (new refusal code `watch_only_consent`); the admin Findings page shows "Watch only: she has not asked for removal yet". The admin Cases list shows watches with a "Watch" label and excludes them from "Needs action" unless a finding awaits review.

Done when: tests on all three backends for creating a watch, the WATCH_ONLY refusal at representative-notice preview and send, conversion by "Take it down" (mode and consent), "Not now" sending nothing, stop-watching deleting fingerprints, a minor never reaching the watch flow, and the email containing only the reference; an e2e test for the watch sign-up through to the watch page.

## WP23. Check that removed content stayed down (app)

**When.** When one of her links becomes removed (she marks it removed, or a platform's response says so), schedule verification checks at +1 day, +3 days and +7 days: a new `LinkVerification` table (`submittedUrlId`, `dueAt`, `attempt` 1..3, `outcome` PENDING | GONE | STILL_ONLINE | UNKNOWN, `checkedAt`), no URL stored in it.

**How.** The hourly cron (an existing `/api/cron/*` route, no new trigger) puts each due check into the crawler frontier as a high-priority row for that host's crawl source (creating a REPORTED source if none exists, through the existing source rules; if the host is on the never-crawl list, the outcome is UNKNOWN). The crawler visits it like any page. Two hours after the row is reported:
- page gone (404/410/gone/blocked) → GONE;
- page fetched and no approved-fingerprint match for that page in the meantime → GONE (the image is no longer there);
- a crawler finding for that page (same address digest) since the check was queued → STILL_ONLINE.

An image-level check needs her fingerprints and a live crawl consent; without them only the page status is used, and a fetched page is UNKNOWN.

**Results.** Her link shows "Verified removed (checked N times)" after three GONE results, or "Still online: we have followed up" on STILL_ONLINE, which returns the link to the notice-sent state and triggers the existing automated follow-up/escalation (`escalation-engine.ts`) and an email (reference only). Admin case page shows the verification history.

Done when: tests for scheduling on removal, enqueueing due checks, each outcome rule, the STILL_ONLINE escalation and email, never-crawl hosts, no URL in the new table, deletion/purge covering it; all three backends.

## WP24. Watch for re-uploads after the case closes (app)

When a case is resolved (or every link on it is verified removed), her live crawl consent gets `watchUntil = now + 12 months` (new nullable column). The crawler pool keeps her approved fingerprints while the consent is live and either the case is open or `now < watchUntil`; after that they leave the pool. Crawl sources created from her reported links stay as they are (no new sites are added for her).

A re-upload found and approved by an analyst appears under "Found by Asmita" on her dashboard and follows the existing representative-notice path (her full consent covers it); she gets an email (reference only). Her dashboard shows "Watching for re-uploads until <date>" with "Stop watching" (withdraws the consent).

Done when: pool-inclusion tests for open, resolved-within-window and expired cases on all three backends, the email, and stop-watching.

## For legal sign-off before real use

The watch-only authorisation template and consent wording, the alert email wording, the 12-month re-upload watch, and re-visiting pages after a takedown to verify removal.
