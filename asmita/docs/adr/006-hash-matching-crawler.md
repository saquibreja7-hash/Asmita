# ADR 006: Targeted Hash-Matching Crawler

Status: accepted by owner (2026-11-16) for build and test with non-intimate fixtures; real-case use gated on legal review. Decision owner: Saquib. Built and switched off: `ENABLE_CRAWLER` is off in every deployed environment (branch `feat/crawler`, 2026-11-16). Operations and the go-live checklist: `docs/ops/crawler-runbook.md`.

The two levels mean:

- **Accepted for build and test.** The `crawler/` service, the pool route, findings, the review queue and the two new templates may be built, merged and tested, using only non-intimate test images, test fingerprints and test sites. Everything stays behind `ENABLE_CRAWLER`, off in every deployed environment.
- **Gated for real-case use.** No real survivor fingerprint enters the pool, no real third-party site is crawled, and no crawler-found link is sent to a platform until every go-live gate below is met. Until then this ADR does not authorise any of those things, whatever the flag says.

## Context

Survivors report links one at a time, after they or someone close to them has found the content. Re-uploads to sites the survivor has not found are invisible to Asmita. The survivor-security roadmap (`docs/product/survivor-security-roadmap.md`, item 10) and ADR 002 both name opt-in resurfacing monitoring as a goal.

Asmita already holds PDQ fingerprints that survivors computed in their own browsers and chose to submit (`HashSubmission`, encrypted at rest). PDQ is built for near matching by Hamming distance, so the same fingerprints can recognise a re-uploaded copy of an image without Asmita ever holding the original.

Two rules stand in the way of using them for discovery:

- ADR 001 and the "No media on the server" principle in `CLAUDE.md`: the application never fetches a URL and never processes image content.
- ADR 002 (proposed, blocked on legal sign-off), which would allow media processing under strict conditions, including in-memory detection, and names resurfacing monitoring among the features it would enable.

On 2026-11-16 the owner decided to build a targeted crawler that compares images on an admin-approved list of public sites with the fingerprints of survivors who opted in. An earlier plan referred to as "FEG" is set aside by this decision and is not described further here.

## Decision

1. **A separate service.** A new top-level folder `crawler/`, outside `asmita/`, holds a separate service with its own dependencies, lint configuration, tests and deployment. It is not part of the Next.js app, the Worker bundle or the `asmita/` lint scope.
2. **What it does.** For each source on an admin-approved list, it fetches public web pages and the images they reference, holds each image in memory only, computes its PDQ fingerprint, compares it with the matching pool, and discards the image. Nothing is written to disk. The container filesystem is read-only. No image bytes appear in logs.
3. **What it reports.** For a match, and only for a match, it reports to Asmita: page address, image address, matched pool id, Hamming distance, PDQ quality, and time of the match. It stores no media and reports nothing about images that did not match.
4. **Findings.** Asmita stores each report as a finding on the survivor's case, with the page and image addresses encrypted, and purges findings on the same 30-day schedule as submitted links (`URL_RETENTION_MS` in `src/lib/url-retention.ts`).
5. **Matching pool.** The pool contains only approved fingerprints of survivors who have opted in and not withdrawn. Asmita serves it to the crawler through a pool route, with each fingerprint under an opaque id and no case, user or person data. The crawler re-syncs the pool at least once an hour.
6. **Survivor opt-in.** One tick box. Ticking it means signing a standing authorisation (a new template, created unreviewed) that covers (a) comparing her fingerprints with images found online and (b) Asmita sending takedown notices on her behalf for matches. She can withdraw at any time. Withdrawal removes her fingerprints from the pool at the next sync (within one hour) and deletes her findings that an analyst has not yet approved.
7. **Human review.** Every finding is reviewed by a human analyst before any notice is prepared. Nothing is sent automatically from a match.
8. **Representative notices.** A notice for a crawler-found link is sent by Asmita as the survivor's authorised representative, citing her signed authorisation. Her signature is never copied onto a notice she has not seen. The representative-notice template is a second new template, also created unreviewed. The `reviewedByLegal` and `lastContactVerifiedByHuman` gates apply to it exactly as to existing templates, and only a human legal reviewer sets `reviewedByLegal: true`.
9. **Kill switch.** `ENABLE_CRAWLER` is a deployment switch, off by default, that turns off the pool route, so the crawler has nothing to match. Each source also has its own on/off flag.
10. **Minors.** Pool fingerprints come only from the adult case flow. The crawler never classifies or surfaces images that did not match.
11. **The app still never fetches.** `asmita/` never fetches a submitted URL or a discovered URL. The crawler is the only component that fetches, and it fetches only from the approved source list.

Items 1 to 11 are the owner's decisions. Details elsewhere in this ADR that go beyond them are proposed by this ADR to make those decisions enforceable, and are marked "(proposed)".

## What is and is not allowed

Each item is meant to be checkable by a test, a lint rule, a configuration check or a review question.

### Allowed, in `crawler/` only

- A1. Fetching HTML pages over HTTP(S) only on a host on the admin-approved source list whose per-source flag is on, or a subdomain of it (amended 2026-11-16: scoped to the approved host, not the registrable domain), never following a page link off that host; and fetching the images those pages embed, which may be on other public hosts (for example a CDN), because that is how sites serve images. Every fetch, page or image, passes every network-safety check in N5. The owner is asked to confirm the image rule (runbook).
- A2. Holding a fetched image in process memory long enough to decode it and compute one PDQ fingerprint, then releasing it.
- A3. Comparing that fingerprint with the pool in memory, by Hamming distance against a threshold set in configuration.
- A4. Sending one match report per match to Asmita, containing only: page address, image address, opaque pool id, Hamming distance, PDQ quality, time.
- A5. Logging counts and fixed event names (pages fetched, images hashed, matches, errors by kind), with no addresses and no fingerprints.

### Allowed, in `asmita/`

- B1. A pool route that returns, only when `ENABLE_CRAWLER=true` and to an authenticated crawler, the approved fingerprints of opted-in, non-withdrawn survivors, each under an opaque id.
- B2. A route that accepts match reports from an authenticated crawler, validates them with a schema, and stores them as encrypted findings.
- B3. Showing a finding's page and image addresses to an analyst as text, in the same way submitted URLs are shown today. Whether and when the survivor is shown them is an open item.
- B4. Sending a representative notice for an analyst-approved finding through the existing dispatch gates.

### Not allowed, anywhere

- N1. `asmita/` fetching, previewing, thumbnailing, proxying or rendering any submitted or discovered URL. ADR 001 is unchanged for the app.
- N2. Any image bytes, decoded pixels, data URLs or base64 image content in `asmita/`, in a match report, in a log line, in a database row, or on disk in `crawler/`.
- N3. The crawler writing to the filesystem at all (no cache, no temp files, no core dumps containing images where the platform allows that to be disabled).
- N4. Any path from `SubmittedUrl` or any survivor-supplied address to the crawler's fetch list. Sources come only from the admin-approved list.
- N5. The crawler fetching a page on a host that is not an approved host or its subdomain, including hosts reached by redirect or by following a link; or fetching anything (page or embedded image) from a private, loopback, link-local, carrier-grade NAT or metadata address, checked after DNS resolution and on every redirect.
- N6. The pool carrying a case id, user id, email, name, URL or any other personal data. Pool ids are random and are not derived from the fingerprint or from `HashSubmission.hashDigest`.
- N7. A fingerprint in the pool from a survivor who has not signed the standing authorisation, who has withdrawn, or whose fingerprint is not approved.
- N8. Classifying, labelling, storing, counting by content type, or surfacing any image that did not match. The crawler has no nudity, age or abuse classifier.
- N9. Logging page addresses, image addresses or fingerprints, in either service.
- N10. Sending any notice for a finding that no analyst has approved, or sending a representative notice that carries, copies or implies the survivor's signature on text she did not see.
- N11. Using the crawler, the pool or findings for any purpose other than the opted-in survivor's own case (no research, no training, no identifying other people), in line with ADR 002 condition 6.
- N12. A fingerprint in the pool from any flow other than the adult case flow (a case routed to the minor or POCSO pathway never contributes to the pool).
- N13. Storing a match report whose pool id is no longer in the current pool, for example one sent in the hour after a withdrawal (proposed).
- N14. Real survivor fingerprints or real third-party sites before the go-live gates are met.

## Reconciliation with existing ADRs

### ADR 001 (submitted URLs are never fetched)

ADR 001 stays in force, unchanged, for the `asmita/` application. This ADR makes a narrow exception for the `crawler/` service only:

- The crawler fetches from an admin-approved list of sites. It never receives a survivor-submitted URL (N4), so the property ADR 001 protects, that nothing a survivor or attacker types into Asmita is ever opened by the server, still holds.
- Discovered addresses enter `asmita/` only as text in a match report and are treated exactly like submitted URLs: text tokens for routing, notices, deduplication and audit (B3, N1).
- The existing enforcement (`asmita/eslint.config.mjs` `no-restricted-syntax`, `asmita/tests/integration/no-url-fetch.test.ts`, `asmita/src/lib/no-fetch-monitor.ts`) is unchanged and keeps applying to all of `asmita/`. Because `crawler/` is outside `asmita/`, it is outside that lint scope and needs its own enforcement (below), not an exemption.

### ADR 002 (consented, encrypted media)

ADR 002 is still proposed and still blocked on legal sign-off. It names opt-in resurfacing monitoring among the features it would enable. This ADR takes from it, as binding conditions for the crawler:

- adults only (condition 1), for the survivor's side: fingerprints come only from the adult case flow;
- explicit consent recorded in the audit log (condition 2), through the standing authorisation. This is only partly met: condition 2 asks for separate consent per feature, and the owner's single tick box covers both comparison and representative notices (see open items);
- in-memory processing, nothing written to disk or database (condition 5);
- purpose-bound use (condition 6, N11);
- results never gate help (condition 7): a survivor who does not opt in, or for whom nothing is found, gets every existing service.

ADR 002's conditions were written for images a survivor chooses to give Asmita. The crawler processes something ADR 002 never covered: images of unknown people, on third-party sites, who gave no consent and may be minors. Conditions 1 and 2 cannot be met for those people. The safeguards for them are that every image is discarded after fingerprinting, that nothing is stored or reported unless it matches an opted-in survivor's fingerprint, and that no image is classified (N2, N3, N8). Whether that is enough is part of the legal read in go-live gate 2.

What stays blocked under ADR 002: storing any media at all, the evidence vault, server-side authenticity detection, and every other media path. This ADR does not accept ADR 002 and does not change its status. The crawler stores no media, so it does not need ADR 002's storage conditions (3 and 4), but it does process third-party images in memory, which is close to what ADR 002 is waiting on counsel for. That is why real-case use is gated on legal review here too.

Building behind an off flag with non-intimate fixtures matches ADR 002's final paragraph ("built behind a flag that is off in all environments, or built only up to the point where no real media is stored"). This ADR does not follow the provenance-check precedent recorded in ADR 002, where a feature went live before legal sign-off: the crawler does not go live before its gates are met.

### ADR 004 (platform stack; deferred hash bank)

ADR 004 deferred a hash bank: "runs in India, hashes envelope-encrypted at rest (AES-256-GCM, key outside the database), matched in memory". The pool route is a first, limited form of it:

- It holds only fingerprints Asmita already stores, for survivors who opted in, and serves them to one consumer, Asmita's own crawler.
- Matching is in memory, as ADR 004 requires. Fingerprints stay reversibly encrypted at rest in `HashSubmission`; keyed hashing is still ruled out because it breaks Hamming matching.
- ADR 004's hash bank is "envelope-encrypted, key outside the database". That is not what exists today: per ADR 005, every encrypted column, including `HashSubmission.hashEncrypted`, uses the single `ENCRYPTION_KEY` held as a Worker secret, with no envelope and no separate key for fingerprints. The pool route decrypts with that key. ADR 005's suggested separate keyring for fingerprints is not decided here.
- Where the crawler runs is not decided. ADR 004's constraint that survivor data stays in India applies to the pool held in the crawler's memory, so the crawler must run in India. Hosting is an open item. (Superseded: proposed Cloud Run job in `asia-south1`, see open items and the runbook.)

Still deferred under ADR 004: a standalone hash bank service, sharing fingerprints with or receiving them from other organisations (StopNCII, I4C or any partner), multi-index or other indexing for large pools, the native Rust matcher, and a separate keyring for fingerprints. At the expected pool size a linear Hamming scan in memory is enough; the ADR 004 revisit numbers (about 1 to 3 million hashes) still apply.

### ADR 005 (keyed hashing and key rotation, proposed)

ADR 005 is proposed and not implemented. New columns and digests added for the crawler must be written so they can move to its formats without a special case:

- Finding addresses are encrypted with the existing `encryptField`, one column per address, so ADR 005 Phase 4 can re-encrypt them with column AAD like `SubmittedUrl.urlEncrypted`.
- Any equality-lookup digest of an address (for example, to deduplicate findings within a case) goes through a single helper in `src/lib/hash.ts`, never an inline `sha256` call, so it is covered by the ADR 005 `url` purpose and its lint test.
- Pool ids are random identifiers stored in their own column, not digests, so they need no re-keying.
- Audit entries for opt-in, withdrawal, finding review and representative notices carry internal ids only, never digests of personal data (ADR 005 Decision 8).

This ADR does not use or decide the number 003, which ADR 005 leaves reserved.

## Enforcement

### `crawler/` (built; `npm run check` in `crawler/`, CI `.github/workflows/crawler-ci.yml`)

Tests and checks that must exist before the crawler handles anything beyond fixtures (they exist; CI on Linux and the Docker image build are still to be seen green, see open items):

- **No disk writes.** A test that runs a full crawl of a fixture site and asserts no file is created or modified (for example by running with a read-only filesystem, or by spying on every filesystem write API and failing on any call). The deployment configuration sets a read-only root filesystem, and a check fails the build if it does not.
- **Lint.** The crawler's own ESLint (or equivalent) configuration forbids importing filesystem write APIs, forbids logging calls whose arguments include address, URL, image, buffer or fingerprint variables, and forbids any persistence client.
- **SSRF controls.** Tests that a fetch is refused for: a host not on the approved list; a redirect to a host not on the list; private, loopback, link-local, carrier-grade NAT and cloud metadata addresses, checked after DNS resolution and again on every redirect; non-HTTP(S) schemes; and any host whose per-source flag is off.
- **Size and time limits.** Tests that a response over the configured byte limit, an image over the configured pixel limit, and a request over the configured timeout are each abandoned without hashing, and that the limits are bounded (a configuration with no limit fails). The values are open items.
- **No address or fingerprint logging.** A test that captures all log output during a fixture crawl with known addresses and fingerprints and asserts none of them appears.
- **Report shape.** A test that the match report contains exactly the six permitted fields (A4) and nothing derived from image bytes.
- **Fixtures.** Test images, test fingerprints and test sites are non-intimate and synthetic, in line with "Real data stays out of code".

### `asmita/`

- Existing enforcement is unchanged: the `no-restricted-syntax` rules in `asmita/eslint.config.mjs`, `asmita/tests/integration/no-url-fetch.test.ts` and `asmita/src/lib/no-fetch-monitor.ts` keep applying to all of `asmita/`, including any new crawler-facing route.
- New tests with the routes: the pool route serves nothing (proposed: 404) when `ENABLE_CRAWLER` is not `true`; the pool contains no fingerprint from outside the adult case flow, and none from a case routed to the minor pathway; the pool contains no fingerprint of a survivor who has not opted in, has withdrawn or whose fingerprint is not approved; the pool response contains no field other than opaque id and fingerprint; withdrawal removes fingerprints from the next pool response and deletes unapproved findings; a report for a pool id no longer in the pool is not stored (N13); the report route rejects any field outside A4 and anything resembling image data; findings are purged on the 30-day schedule; a representative notice cannot be dispatched without analyst approval, `reviewedByLegal` and `lastContactVerifiedByHuman`; ingesting a finding and dispatching its notice call no `fetch` on the finding's addresses.
- `ENABLE_CRAWLER` is read in one place (as `src/lib/dev-flags.ts` is for the provenance flag) so its default is off.
- Built: the `no-restricted-syntax` rule now also matches the crawler's address names (`pageUrl`, `imageUrl`, `findingUrl`, `pageAddress`, `imageAddress` and others, as variables and properties), checked by `tests/unit/eslint-no-url-fetch.test.ts`; `tests/unit/admin-no-url-content.test.ts` covers every crawler admin page.

## Consent and notice model

- **Opt-in.** One tick box, offered only inside an adult case (proposed: and only once the survivor has at least one fingerprint). Ticking it opens the standing-authorisation text, which she signs. The signature and the template version are recorded, and an audit entry is written. Not opting in changes nothing else about her case.
- **Standing authorisation template.** New, created unreviewed by `prisma/template-seeds.ts`. It must state in plain language that Asmita will compare her fingerprints with images found on a list of public sites, that Asmita will not keep those images, what a finding is and how long it is kept, that an analyst will look at matched pages, that Asmita may send takedown notices on her behalf for approved matches, and how to withdraw. Whether such an authorisation lets Asmita act as her representative before an intermediary is a legal question `[CITATION REQUIRED — verify with legal advisor]`.
- **Withdrawal.** Available at any time from her case. Her fingerprints leave the pool at the next sync (within one hour); her unapproved findings are deleted (proposed: at once, in the same request). Reports that arrive for her pool ids before the next sync are not stored (N13, proposed). What happens to approved findings and to notices already sent is an open item. (Superseded: see "Decisions recorded since acceptance", Withdrawal; fingerprints leave the pool at once.)
- **Review.** An analyst reviews every finding. How the analyst confirms a match without the app fetching or previewing the page is an open item; until it is decided, nothing in `asmita/` may preview the address (N1).
- **Representative notice.** Sent by Asmita in its own name as the survivor's authorised representative, citing the signed standing authorisation by date and reference. It never reproduces her signature and never states that she reviewed the specific notice. Legal grounds may cite only what PRD Section 4 already supports (for example IT Rules 2021 Rule 3(2)(b) as accelerated by the 2026 Amendment Rules, and the MeitY November 2025 SOP); anything about representative standing is tagged `[CITATION REQUIRED — verify with legal advisor]`.
- **Survivor-signed path unchanged.** Links the survivor submits herself keep the existing flow: she reviews and signs the notice PDF, and `/api/notices/dispatch` refuses a URL without `signedNoticePdf`. The representative path is a separate path for findings only and must not relax that check.
- **Survivor visibility.** Not decided. Whether she can see her findings, whether she is told about each finding before a notice goes out, and how, are open items, to be settled in the consent wording with the legal reviewer. Seeing a list of addresses where her images were found may itself cause harm, so the default is not assumed either way. (Superseded in part: see "Decisions recorded since acceptance", Survivor visibility; still an owner decision.)

## Decisions recorded since acceptance (2026-11-16)

Made while building; each is in the code and its tests.

- **Survivor-reported hosts become crawl sources (2026-11-17, full-crawler spec WP1; supersedes N4 in part).** The owner decided the crawler must find sites on its own, with survivor reports as one starting point. When a survivor's submitted link or an approved crawler finding names a host, the app now makes sure an enabled `CrawlSource` with `origin = REPORTED` exists for that host. Only the host is copied — never the link, the case or anything identifying her — so N1 (the app never fetches) and N4's core protection (nothing a survivor types is ever opened by the server) still hold: the app stores a host name; the crawler, as before, fetches only hosts on its source list. Hosts on a never-crawl list (`asmita/src/lib/crawl-never.ts`, `CrawlBlockedHost`) are never auto-created. ADR 006's go-live gates now also cover these automatic sources (runbook, section 2).

- **The app keeps the page frontier (2026-11-17, full-crawler spec WP3).** The app now stores the page addresses the crawler is to visit — one `CrawlPage` row per page URL, encrypted at rest with `encryptField`, deduplicated per source on a keyed digest, never fetched by the app (N1 holds), never linked to a case or a survivor, and purged after 30 days exactly like finding addresses, except rows still due for crawling. The crawler claims batches over the service API and reports each page's outcome, so a second run resumes where the last stopped, two crawler jobs never fetch the same page, and a killed job loses at most its claimed batch. The crawler still does the fetching, still checks scope on every hop, and the app repeats the scope check on every link it is handed (crawl-pages.ts); the addresses the app holds are exactly the addresses the crawler itself extracted from pages it was approved to visit.

- **The crawler discovers new sites by following links (2026-11-17, full-crawler spec WP5).** The owner decided the crawler must find sites on its own (full-crawler spec). The crawler now reports the hosts of out-of-scope links on in-scope pages — hostnames only, never the links — and the app decides which become `CrawlSource` rows with `origin = DISCOVERED`: one hop deeper than the site that linked it, skipped when on the never-crawl list or already a source, switched on automatically only within a hop limit (`CRAWLER_MAX_DISCOVERY_HOPS`, default 2) and a per-day cap (`CRAWLER_MAX_NEW_SITES_PER_DAY`, default 200), stored switched off beyond either. N1 and N4's core protection still hold: the app stores host names only and fetches nothing; the crawler never requests a discovered host until the app lists it as a source, so every fetch still happens only on a host the app's rules (or an admin, or a survivor's report) put on the list. A match under a discovered site promotes it (hops 0, reported-source budget); a site that spends its page budget three days running without a match is paused for 30 days by the hourly sweep. Go-live gate 6 (each source added by an admin, with a recorded reason) must be re-read for these automatic sources before real-site use.
- **Pages that need a browser are rendered by isolated Chromium (2026-11-17, full-crawler spec WP7).** A source an admin sets to `render = BROWSER` (and an `AUTO` page whose HTML has scripts and no image candidates) is rendered by headless Chromium in a third child process, because a page that builds its gallery with JavaScript is invisible to the static extractor. Every guarantee ADR 006 rests on is preserved: the browser's traffic goes through an in-process proxy that applies the same address policy as every other fetch (N3's SSRF guard holds for browser egress too), robots.txt is honoured per request, the User-Agent stays honest (Chromium's own with the crawler's appended), nothing is written to disk (the throwaway profile lives in a tmpfs, `BROWSER_TMP_DIR`), image bytes are taken from intercepted responses in memory and go through the same decoder child, and the worker never receives the pool, the key or a fingerprint (scrubbed environment, Node's permission model, strict IPC). Chromium runs with `--no-sandbox`: its own sandbox needs unprivileged user namespaces (not a setuid helper), which the container may not grant, so a renderer exploit would run as the job's user. Browser rendering therefore stays off for real sites until the worker runs sandboxed or under a separate UID; that is a blocking item on the go-live checklist (runbook section 9). Review follow-up (2026-11-17): every request of the browser context is fetched hop by hop by the worker so each redirect hop is scope- and robots-checked, popups and WebSockets are refused, WebRTC is confined to the proxy, and the proxy refuses tunnels outside a render.

- **The page address is the case link.** Final approval adds the finding's page address to the case as a `SubmittedUrl` with `source = CRAWLER`. The image address stays on the finding and appears only in the notice.
- **Crawler links never enter the survivor's sign flow.** The sign page, preview, signing and `/api/notices/dispatch` refuse them (`crawler_link_not_survivor_signed`); only the representative path sends them. If she reports the same address herself while no representative notice was sent or claimed, the link becomes hers (`SURVIVOR`) and enters her sign flow; the finding keeps its record.
- **Consent is re-checked at send.** Preview and dispatch re-check that a live authorisation lists the matched fingerprint and that the finding was recorded under that authorisation (`CrawlFinding.crawlConsentId`). Approval and finding ingest re-check it under a row lock in the same transaction as the write, so a withdrawal cannot slip between check and write.
- **Withdrawal.** Unreviewed findings are deleted, fingerprints leave the pool at once, and unsent crawler links are stopped for good; notices already sent are untouched. A later authorisation never revives a stopped link: findings are deduplicated per authorisation, so a copy found again is a new finding, reviewed from the start, with its own link. A request to delete her account withdraws the authorisation on every case at once; cancelling the deletion does not opt her back in.
- **Dismissed findings can reappear** after the 30-day purge (the dedup digest is purged with the addresses) and under a new authorisation.
- **One tick box** covers both comparison and representative notices. This is in tension with ADR 002 condition 2 (separate consent per feature); the owner accepted it, and it is on the legal reviewer's list.
- **Findings are bound to their source.** A reported page must be on the source's host or a subdomain (`page_not_in_source`); the image may be on another public host. The findings route answers `accepted` for both new and merged findings, so the crawler cannot tell whether two pool ids belong to one case.
- **Image decoding runs in separate child processes** (built: `crawler/src/image/decoder-pool.ts`). A child gets only image bytes and returns only a fingerprint and quality; it never receives the pool, URLs or the service key, runs under Node's permission model (no writes, no spawning, reads only of its bundle and sharp), and is recycled by the parent. What this does not give: native code in an exploited decoder is not bound by Node's permission model, and the child runs as the same OS user as the parent, so it could open network connections, read files that user can read (including the parent's initial environment in `/proc`, and the key file) and, where the kernel allows same-user tracing, the parent's memory and so the pool. Closing that needs deployment hardening listed in `crawler/README.md` ("What this does not protect against"): decoder children under a separate UID or a syscall sandbox, no network for them, and the key as a mounted file rather than an env var. None of that is configured yet; it is a go-live item.
- **The two draft templates agree.** The representative notice states that the survivor declared the images are intimate images of her shared without her consent; the draft authorisation now contains that declaration. Both stay draft-marked and unreviewed.
- **Survivor visibility.** Her case page lists found links by website name only, with a true status (a stopped badge after withdrawal; the date Asmita sent its notice; never an escalation ladder). `CRAWLER_SHOW_FINDINGS_TO_SURVIVOR` (default on) turns the list off; whether she should see it is still an owner decision (open items).

## Go-live gates

Real survivor fingerprints in the pool, real sites on the source list, or a representative notice to a real platform require all of:

1. A legal reviewer approves the standing-authorisation template and the representative-notice template, and sets `reviewedByLegal: true` on each.
2. A legal reviewer gives a written read on fetching and fingerprinting third-party images in memory. The owner's position is that fingerprinting in memory without saving is not "downloading" and so raises no legal hurdle. That position has not been confirmed by a lawyer and is not relied on until it is `[CITATION REQUIRED — verify with legal advisor]`.
3. A written procedure for an analyst who encounters suspected child sexual abuse material on a matched page, covering what they do, whom they report to and within what time. PRD Section 4 lists POCSO Act 2012 Sections 13 to 15 with mandatory referral; the specific reporting duty that applies to an analyst is `[CITATION REQUIRED — verify with legal advisor]`.
Gates 1 to 3 come from the owner's decision. Gates 4 to 7 are proposed by this ADR:

4. Every crawler test listed under Enforcement exists and passes, and the deployment runs with a read-only filesystem.
5. Hosting for the crawler is decided and is in India.
6. Each source on the approved list has been added by an admin, with a recorded reason.
7. Grievance contacts used for representative notices have `lastContactVerifiedByHuman` set, as for every other notice.

Production launch of Asmita as a whole remains gated on the items in `CLAUDE.md`; this list adds to them for the crawler.

## Open items

Still open after the build:

- Child-abuse-material procedure for analysts: a written procedure for suspected child sexual abuse material on a matched page (go-live gate 3). Required before go-live.
- Analyst welfare rule: how long and how often an analyst may review matched pages, and what support they get. Required before go-live.
- Legal read on the in-memory fetch and on representative standing (go-live gates 1 and 2), on the two draft templates, on the notice's consent statement resting on the authorisation's declaration (item 8 of the draft), and on one tick box covering both uses (ADR 002 condition 2).
- Hindi: the crawl and found-link strings are drafted, not reviewed by a native speaker (`src/i18n/hi-review-status.json`).
- Verification not yet done: the migrations applied and the Kysely and Prisma paths exercised on a real Postgres (only mocks and the memory store so far); crawler CI green on Linux and the Docker image built (this was built on Windows without Docker).
- MeitY SOP date: `CLAUDE.md` cites the MeitY NCII SOP as October 2025 and this ADR cites it as November 2025 (a date of 11 November 2025 has also been given). A human should confirm the correct date against the SOP itself; nothing here changes either.
- PDQ agreement: re-run with the crawler's own decode module (`tools/pdq-agreement/REPORT.md`), CMYK JPEG without a profile disagrees by 14 bits (above the 10-bit guidance, within the 31 threshold).
- Owner decisions: whether survivors see the website names of found links (`CRAWLER_SHOW_FINDINGS_TO_SURVIVOR`, default on); whether dismissed or already-sent findings may recur after the 30-day purge; whether the same admin may retry a failed send only on the same day (after the date changes the retry is refused as `earlier_attempt_unconfirmed`); confirming that embedded images may be fetched from other public hosts (A1).
- Consent granularity. ADR 002 condition 2 asks for separate consent per feature; the owner chose one tick box covering both comparison and representative notices. Whether one signature for both is acceptable is for the legal reviewer.
Earlier open items, settled for the build (values to revisit with real data before go-live):

- Hamming threshold 31 for a report (`CRAWL_MATCH_THRESHOLD`), a second analyst above 20; no quality floor beyond the crawler's own.
- Byte, pixel, page-count and time limits, crawl delay per source and `robots.txt` handling are in `crawler/` (see `crawler/README.md`).
- Hosting: proposed Google Cloud Run job in Mumbai (`asia-south1`), read-only filesystem, secrets in Secret Manager (runbook); the owner sets it up. The crawler authenticates with a bearer service key whose sha256 alone is stored.
- The pool is held in memory only and fetched over HTTPS each run; its protection inside the crawler (decoder isolation, and what it does not give) is above.
- The analyst confirms a match by reading the address as text, after a reasoned, audited, rate-limited reveal; the app never previews it. Wellbeing protections beyond the interim safety note are the open welfare rule above.
- Withdrawal: see "Decisions recorded since acceptance".
- Whether she is told about each finding before a notice goes out: not built; she sees found links on her case page after approval (owner decision above).
- Sources: a SUPER_ADMIN (`crawler:manage`) adds each host, which starts switched off; every change is audited. Two-person approval of sources is not built.

## Consequences

- Survivors who opt in can have re-uploads found on approved sites without having to find them themselves.
- Asmita gains a second component that fetches from the internet. The app's no-fetch rule stays simple and enforced; the risk moves into a small, separate service with its own tests, which must be kept as strict as the app's rules.
- Asmita begins to act as a survivor's representative, a new legal posture that depends on counsel's review and on two new templates.
- The pool is a first step towards the ADR 004 hash bank and must meet its conditions (India, in-memory matching, encrypted at rest).
- The pool is the main new exposure. It is a set of decrypted PDQ values, which ADR 005 notes can be inverted to a recognisable approximation of the image, held in a process whose job is to decode untrusted images from sites that may be hostile. A compromise of the crawler (for example through an image-decoder flaw) could expose every opted-in survivor's fingerprints. Isolating the decoder from the pool, keeping the crawler's dependencies patched and minimal, and limiting what a compromised crawler can reach are design requirements for the build, and the pool's protection in transit and in memory is an open item.
- Analysts will look at third-party pages that may contain intimate imagery or child abuse material, which needs a written procedure and wellbeing protections before go-live.
- More data is held per case (findings), purged on the existing 30-day schedule.
