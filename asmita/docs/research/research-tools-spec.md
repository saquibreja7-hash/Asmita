# Research-grounded tools: spec (WP110–WP117)

Owner-approved 2026-11-22 (Saquib). Four tools, each grounded in published research or an established open-source project. The sources, with what was verified and what was inferred, are in `asmita/docs/research/2026-11-sources.md`; read the section for your WP before you start, and credit sources exactly as this spec says.

| Track | Branch | Machine | WPs |
|---|---|---|---|
| A. HMA signal exchange for platform partners | `feat/hma-exchange` | dev-vm | WP110, WP111 |
| B. GenD open deepfake detector | `feat/gend` | dev-vm | WP112, WP113 |
| C. Nudify-service registry (E2 extension) | `feat/nudify-registry` | win-desktop | WP114, WP115 |
| D. Indian sextortion message classifier | `feat/sextortion-classifier` | win-desktop | WP116, WP117 |

Each WP is done when its own checks pass and it appends an entry to `asmita/docs/research/progress.md` that starts with the exact line `### WP<number> done`, listing what was built, what was verified and how, what was NOT verified on this machine, decisions you made yourself, and any user-facing sentence the owner must approve.

---

## 0. Rules for every WP

1. **Read first:** root `CLAUDE.md` (including "Scope of the constraints below"), `asmita/AGENTS.md`, `asmita/DESIGN.md`, `asmita/docs/lab/charter.md`, this spec, and the sources file. Consult `asmita/node_modules/next/dist/docs/` before framework code.
2. **Which rules apply where.**
   - Track A touches the **survivor complaint workflow** (survivor-consented fingerprints leaving Asmita). The Safety Principles in root CLAUDE.md apply in full: no media on the server, real data never in code or tests, consent gates never weakened, nothing invented. Every existing gate in `src/lib/partner-feed.ts` and `src/lib/partner-share-consent.ts` must still hold; add tests proving it.
   - Tracks B, C, D are **AI Lab** work. The complaint-workflow constraints do not apply (server-side media processing is allowed), but the Lab charter does: `ENABLE_LAB` gate, the ESLint boundary (lab code never imports complaint modules and vice versa), public repo, no committed research data, the Lab never generates sexual content.
3. **Public repo.** No secrets, keys, real service names, real abuse URLs, real people, real messages or survivor data in code, tests, fixtures, docs or commits. Fixtures are invented (`example.test` domains, made-up names, synthetic text). Research datasets and model weights are never committed; they live in gitignored local folders or are downloaded at build time from pinned revisions.
4. **Licences.** Only use code, weights or data whose licence allows a public NGO web service, and record each one (name, licence, URL, pinned version) in a `NOTICE` or `THIRD_PARTY.md` next to the code. If a licence is unclear, do not use it; write the gap in progress.md.
5. **Design.** Admin and public pages follow `asmita/DESIGN.md`: white page, teal for actions, orange (`--coral`, `--coral-ink`) for markers, 12px corners for buttons and boxes, no coloured left-border stripes, no label above headings, both languages on public pages (Hindi may be machine translated and listed in `asmita/src/i18n/hi-review-status.json`; admin pages are English). Use the impeccable skill for layout.
6. **Quality.** Tests for every behaviour you add (vitest for TypeScript, pytest for Python). Never weaken, skip or delete a test to make it pass. Lint, type-check and unit suite must pass. Machines with Playwright run the WP's e2e specs too.
7. **Commits:** clear messages ending with `Co-Authored-By: Hermes (GLM 5.3) <noreply@example.invalid>`. Do not push from inside the session; the lane pushes after checks pass.
8. **Never ask the user anything.** When something is unclear, choose what best fits this spec and the sources, carry on, and record the decision in progress.md.

---

## Track A — HMA signal exchange for platform partners (dev-vm)

### Background (verified in source; see sources §A)

- Asmita already shares survivor-consented PDQ/vPDQ fingerprints with approved platform partners: `GET /api/partner/v1/fingerprints?cursor=<seq>` (global feed, `PartnerFeedEvent` with ADD/WITHDRAW, serve-time re-check of shareability: status APPROVED|DISPATCHED + live `PartnerShareConsent` + `User.ageOver18`), `POST /api/partner/v1/outcomes`, bearer keys `ppk_…` stored as sha256 (`src/lib/partner-auth.ts`). Docs: `docs/product/partner-api.md`, `docs/product/partner-sharing-spec.md`, example adapter `docs/product/partner-hma-adapter/asmita_signal_exchange.py`.
- Meta's Hasher-Matcher-Actioner (HMA 1.2.x, Flask/Postgres, in github.com/meta/ThreatExchange, BSD) can only fetch from outside through a **`SignalExchangeAPI` Python class** installed in the platform's HMA image and listed in its `OMM_CONFIG` `exchange_types`. There is no generic HTTP/JSON exchange; `local_file` reads a local path only.
- HMA's fetcher runs every 240 s, at most 4 min per exchange, commits every 5000 records/60 s, **asserts the checkpoint time never goes backwards**, stores fetched metadata **pickled** (so the plugin's metadata class must stay importable and backward compatible), deletes a bank entry when a fetched value is `None`, and **does not use opinions/tags for matching**.
- PDQ in HMA: `^[0-9a-f]{64}$`, **lowercase only** (uppercase is dropped with a warning); match distance ≤ 31; imported hashes carry no quality and are not filtered. vPDQ (`threatexchange.extensions.vpdq`, signal name `vpdq`) is optional and not in HMA's default signal types; its signal string is `json.dumps([str(feature), ...])` where each feature string is the vPDQ feature format (see `vpdq_util.py` in the cloned repo; mirror it exactly).
- The built-in StopNCII exchange has a bug (compares `hashValue` instead of `hashStatus`), so withdrawn hashes are never deleted in HMA. **Do not copy that design: deletions must be explicit and unambiguous.**
- Gaps in our feed today: cursor is a bare seq (no time); video ADD serves only the best-frame hash, not the full frame list in `videoFramesEncrypted`; no quality filter; the Kysely `latestEventTypes` and erasure paths scan the whole `PartnerFeedEvent` table; no key scopes.

### WP110 — HMA-friendly signal feed (app side, Safety Principles apply)

Build a second read endpoint designed for HMA, without changing the meaning of the existing `/fingerprints` endpoint.

1. **`GET /api/partner/v1/signals?checkpoint=<opaque>&page_size=<1..800>`** (default 500), same bearer auth, IP and per-key rate limits as `/fingerprints` (own bucket `partner-key:<id>:signals`, 300/h), `Cache-Control: no-store`.
   - Response: `{ "checkpoint": "<opaque>", "has_more": boolean, "records": [ { "id": "<fingerprintId>", "signal_type": "pdq" | "vpdq", "hash": "<value>" | null, "deleted": boolean, "updated_at": <unix seconds>, "tags": ["asmita", "ncii", "survivor_consented"] } ] }`.
   - `checkpoint` is base64url JSON `{ "t": <updated_at ms>, "s": <seq> }`. Records are ordered strictly by `(createdAt, seq)` of `PartnerFeedEvent`; the checkpoint is the last record's pair. It must **never go backwards** for a given caller: if two events share a millisecond, seq breaks the tie. An empty or missing checkpoint starts from the beginning. A malformed checkpoint is 400 `invalid_checkpoint`.
   - **ADD → `deleted:false`** with the hash value; **WITHDRAW → `deleted:true`, `hash:null`**. Tombstones are kept forever (never prune `PartnerFeedEvent` rows).
   - PDQ hash: **lowercase** 64 hex, validated with `PDQ_HASH_PATTERN` before serving. Never serve a hash whose `HashSubmission.quality < 50` (record the decision in partner-api.md: platforms using HMA do not filter imported hashes by quality, so Asmita filters before publishing).
   - vPDQ: serve the **full frame list** from `videoFramesEncrypted` (decrypted at serve time), formatted exactly as python-threatexchange's vPDQ signal string. Drop frames whose quality < 50; if no frame remains, serve nothing for that fingerprint. Keep serving only `hash` on the old `/fingerprints` route (do not change its contract) but fix its `frames` to the full list too, with a test.
   - The **serve-time shareability re-check is identical** to `/fingerprints` (reuse the same function; do not copy it). An ADD that fails the check is skipped; the checkpoint still advances past it. A fingerprint that was ADDed and is now unshareable must already have a WITHDRAW (that is `syncPartnerFeedFingerprints`' job); add a test that an ADD whose case consent was withdrawn is never served even if the WITHDRAW event is missing.
2. **Performance fix.** Replace the full-table scans in the Kysely `latestEventTypes` path and the erasure path with indexed per-fingerprint queries. Add a Prisma migration with an index on `PartnerFeedEvent (fingerprintId, seq)` and on `(createdAt, seq)`. Additive only.
3. **Key scopes.** Add `scopes String[] @default(["feed","outcomes"])` to `PlatformPartnerKey` (migration, additive). `feed` covers `/fingerprints` and `/signals`; `outcomes` covers `/outcomes`. Wrong scope → 403 `insufficient_scope`. Admin key issue form gets checkboxes (default both). Existing keys keep both scopes.
4. **Docs.** Update `docs/product/partner-api.md` with the `/signals` contract, the checkpoint rules, tombstones, the quality rule, the vPDQ format and the human-review requirement (CDT guidance: a match is a high-signal indicator for review, not automatic removal).
5. **Tests (vitest):** ordering and tie-break; checkpoint never decreases across pages; malformed checkpoint; ADD/WITHDRAW mapping; lowercase; quality < 50 filtered; vPDQ full frames and per-frame quality filter; every consent/age/status gate; scopes; rate limit; memory, Prisma and Kysely backends where the repo already tests all three. **Playwright:** one e2e that issues a key in admin, seeds a consented synthetic fingerprint in the dev store and fetches it from `/signals`.

### WP111 — `tx-extension-asmita` package and an end-to-end HMA test

1. Create `integrations/hma/tx-extension-asmita/` (repo root, outside `asmita/`), a Python package, **BSD-3-Clause** (copy the licence text; credit Meta's ThreatExchange in `NOTICE`).
   - `pyproject.toml`: name `tx-extension-asmita`, depends on `threatexchange>=1.2.18,<2` (pin the minor you test against), Python ≥ 3.10.
   - `AsmitaSignalExchangeAPI(SignalExchangeWithAuth, SignalExchangeAPIWithSimpleUpdates)` following the pattern of `techagainstterrorism_api.py` in the cloned repo (path in the sources file).
     - Config dataclass extends `CollaborationConfigBase` with `base_url: str = "https://<owner fills>/api/partner/v1"` (use a placeholder constant, not a real domain) and nothing else.
     - `CredentialHelper` with `api_key`; env var `TX_ASMITA_API_KEY`; file `~/.tx_asmita_key`.
     - Checkpoint dataclass stores the opaque checkpoint string plus `updated_at` for `get_progress_timestamp()`; `is_stale()` returns False (tombstones are kept forever, so no forced refetch).
     - Metadata dataclass: minimal and stable (`id: str`, `tags: tuple[str, ...]`); `get_as_opinions()` returns one `SignalOpinion(is_mine=False, category=POSITIVE_CLASS, tags=…)`. Document that changing its fields breaks HMA instances that pickled it.
     - `fetch_iter` pages `/signals`, maps `deleted:true` to `None`, yields `FetchDelta` with keys `("pdq", hash)` / `("vpdq", value)`, honours `supported_signal_types` (skip vPDQ when the platform has not enabled it).
     - `report_opinion` posts to `/outcomes`: POSITIVE → `blocked_reupload`, NEGATIVE → `not_our_content`. HMA itself does not call it today; the CLI (`threatexchange label`) and platform tooling can.
     - `TX_MANIFEST = ThreatExchangeExtensionManifest(apis=(AsmitaSignalExchangeAPI,))` for the CLI.
   - pytest suite with a fake HTTP server: paging, checkpoint progress, deletions, vPDQ skip, auth header, 401/403 handling, report_opinion mapping, metadata pickle round-trip.
   - Build a wheel in CI-like fashion locally; **do not publish to PyPI** (owner decision).
2. **End-to-end test** in `integrations/hma/e2e/`: `docker-compose.yml` with Postgres, the official HMA image pinned by digest (`ghcr.io/meta/threatexchange/hma`), a derived image that `pip install`s the wheel, an `omm_config.py` that adds `AsmitaSignalExchangeAPI` (and `VPDQSignal`) to `DefaultOMMStore`, and the Asmita Next dev server (memory store) seeded with two synthetic consented fingerprints. A script `run-e2e.sh`:
   - creates the exchange with `POST /c/exchanges` (bank `ASMITA_NCII`, key from the seeded partner);
   - waits for a fetch (`GET /c/exchange/<name>/status`), then `GET /m/lookup?signal_type=pdq&signal=<hash>` must return a match in `ASMITA_NCII`;
   - withdraws one fingerprint's consent in the dev store, waits for the next fetch, and the lookup must return no match;
   - prints PASS/FAIL. Record the run output summary in progress.md. If the HMA image cannot run on this machine, say so and leave the script runnable.
3. **Admin quick start.** On `/admin/partners/[partnerId]`, add a collapsible "Connect with HMA" block: the three steps (derived image with `pip install`, one line in `exchange_types`, one `POST /c/exchanges` JSON with `"api_key": "<the key you were shown>"`), copyable code blocks. Never show a real key after issuance.
4. Move `docs/product/partner-hma-adapter/` content into the package README (keep `LICENSE-THREATEXCHANGE.txt` attribution) and leave a short pointer file behind.

---

## Track B — GenD open deepfake detector (dev-vm)

### Background (verified; see sources §B)

- GenD, "Deepfake Detection that Generalizes Across Benchmarks", Yermakov, Čech, Matas, Fritz, WACV 2026 (arXiv 2508.06248). Code github.com/yermandy/GenD, **MIT**. Weights on Hugging Face, tagged MIT: `yermandy/GenD_CLIP_L_14` (≈1.22 GB, fp32 safetensors), `yermandy/GenD_PE_L`, `yermandy/GenD_DINOv3_L`.
- Architecture: frozen ViT-L backbone (CLIP ViT-L/14 for the variant we use), only LayerNorm affine + a linear head on L2-normalised CLS features trained; output 2 logits, softmax, **index 1 = fake**. Video: mean over frames.
- Preprocessing: **face detection and 5-landmark alignment are required**: largest face, similarity transform to a fixed template, crop scale 1.3, then the model's processor to 224. Detection threshold default 0.4.
- **Licence blocker:** the repo downloads InsightFace's `buffalo_l/det_10g.onnx` (RetinaFace) from a third-party mirror; InsightFace pretrained models are non-commercial research only. **We must not use it.** Use **YuNet** (OpenCV Zoo `face_detection_yunet_2023mar.onnx`, MIT; returns a box and 5 landmarks) and keep GenD's alignment template and 1.3 scale.
- Avoid the DINOv3 variant (gated, custom Meta licence). Use **CLIP** (`openai/clip-vit-large-patch14`, MIT). Loading GenD also downloads the base backbone; pin both revisions.
- Trained on FF++ c23 (face-swap and reenactment video); reported mean cross-dataset video AUROC 91.2 (CLIP) over 14 datasets. **It is a face-swap/reenactment detector, not a general "AI-made image" detector**; it needs a detectable face; the authors note demographic failure cases (Black and Asian faces in the supplement) and no adversarial testing.
- "Evaluating Deepfake Detectors in the Wild" (Pirogov & Artemev, arXiv 2507.21905, CC BY 4.0 paper; repo has **no licence**, so do not copy its code) shows JPEG and low resolution collapse many detectors. Its protocol: JPEG quality 95/75/50/30/10, downscale to max side 128, GPEN-enhanced fakes. Its dataset Swappir is CC BY-NC 4.0 (internal evaluation only, never redistribute).

### WP112 — `services/lab-gend`: a small inference service

1. `services/lab-gend/` (repo root): Python 3.12, FastAPI + uvicorn, `torch` CPU wheel, `transformers` pinned to the version GenD's `requirements.txt` pins, `opencv-python-headless`, `onnxruntime` (CPU). Vendor only the minimal GenD model code needed (`modeling_gend.py` equivalent) with the MIT notice and a header comment naming the source file and commit.
2. **Pipeline:** decode image (JPEG/PNG/WebP, ≤ 10 MB, ≤ 40 MP) → YuNet detection (score ≥ 0.4, faces ≥ 48 px) → for each of up to 5 largest faces: 5-point similarity alignment to GenD's template, scale 1.3 → CLIP processor 224 → GenD → p_fake. Image score = max over faces (state this choice and why: one swapped face is enough to matter); also return per-face scores and boxes. No face → `{ "faces": [], "status": "no_face" }` (never a score of 0).
3. **API:** `POST /v1/score` (multipart `image`) with header `Authorization: Bearer <LAB_GEND_TOKEN>` (shared secret with the Worker); returns `{ model: "GenD_CLIP_L_14@<revision>", detector: "YuNet@2023mar", faces: [{ box, p_fake }], image_p_fake, status, timings_ms }`. `GET /healthz`. One worker process, a bounded queue (max 4 waiting, else 429), 20 s timeout.
4. **Privacy:** images are processed in memory and discarded; never written to disk, never logged (log only status, face count and timings). No request bodies in error traces.
5. **Weights:** downloaded at image build time from pinned Hugging Face revisions (commit SHAs recorded in `THIRD_PARTY.md`), checksum-verified. Never committed. `Dockerfile` multi-stage; final image runs as non-root.
6. **ONNX (optional, try it):** export GenD's forward on 1×3×224×224 with `torch.onnx.export`; accept it only if max absolute difference vs PyTorch on 50 synthetic aligned crops is < 1e-3 and the decision at 0.5 is identical on all 50. If accepted, add a `GEND_RUNTIME=onnx` mode that drops torch from the runtime image; record the size and latency of both.
7. **Tests (pytest):** alignment math against GenD's template on synthetic landmarks; no-face path; size limits; auth; queue overflow; image never written (monkeypatch open/write); a model-loading smoke test that is skipped when weights are absent.
8. Measure CPU latency per face on dev-vm (median of 20) for both runtimes; record in progress.md.

### WP113 — GenD in the Lab detector panel, with an honest evaluation

1. Add a `gend` adapter wherever the detector panel's adapters live (the WP90 `/lab/detectors` code on master; if WP90 is not on master yet, stop and record that). It calls `LAB_GEND_URL` with `LAB_GEND_TOKEN` (both env, never committed); unset → row shows "not configured". Map `image_p_fake` to the panel's 0–100 score and its bands; `no_face` shows "No face found: this detector only checks face swaps".
2. The row's label: "GenD (open model, CTU Prague)" with a short line on what it checks (face swaps and face reenactment) and a credit link to the paper and repo. Add a visible "Sources and credits" disclosure on `/lab/detectors` listing GenD (authors, WACV 2026, MIT licence, links) and YuNet (OpenCV Zoo, MIT). Both languages for public strings.
3. **Evaluation** (`tools/lab-bench`, reuse E1's harness and its face-swap composite builder): build an evaluation set from **synthetic or consenting-adult, clothed, non-intimate portraits** only (never real NCII, never minors), real vs E1 face-swap composites. Degradations: JPEG 95/75/50/30/10; long side 1600 and 1280 (WhatsApp-style, the E1 re-encode); max side 128; Gaussian blur σ 1 and 2. Detection and alignment run **after** degradation, as the service does. Report ROC-AUC, accuracy at 0.5 and the no-face rate per condition, with bootstrap 95% CIs. Optionally evaluate on Swappir locally (CC BY-NC: internal only, never commit any of it). Write aggregate tables only into `asmita/docs/lab/gend-eval.md`, plus a plain-language summary for the public page's limits line.
4. Docs: `asmita/docs/lab/gend.md` (what it is, licence chain, deployment: the service runs outside the Worker; the owner chooses the host; dev-vm is for testing only), BibTeX from the paper.
5. Tests: adapter unit tests with a mocked service (not configured, no face, score bands, timeout, 429). Playwright: the panel shows the GenD row as "not configured" when env is unset.

---

## Track C — Nudify-service registry (win-desktop)

### Background (see sources §C)

- Gibson et al., "Analyzing the AI Nudification Application Ecosystem" (USENIX Security 2025, 20 sites): most rely on or push cryptocurrency; 8/20 offered PayPal, 7/20 cards; payment processors named as an intervention chokepoint.
- ISD, "Mapping the 'Nudify' Tools Ecosystem" (2026): a small group of hosts, registrars, app stores, payment systems and platforms supports much of the industry.
- Indicator investigations (via CameraForensics, 2025): Google single sign-on, Amazon hosting and Cloudflare in front of dozens of sites (secondary source: treat as indicative).
- CIR / AI Forensics (2025–26): Telegram bots are built to survive takedowns and point users to web domains where payment happens; removing bots alone does not work.
- "It Takes a Forum" (arXiv 2604.12190, 2026): the ecosystem is resilient; promoters earn referral commissions; public model repositories are a chokepoint.
- Existing E2 (master): `LabService`, `LabChokepoint`, `LabReport`, `lab-lookup.ts` (DNS NS + optional RDAP; registrable domain naively = last two labels, wrong for `.co.in`), daily liveness HEAD check, report templates per chokepoint kind, admin pages under `src/app/admin/lab/`, `lab:manage` (SUPER_ADMIN). No deletes by design.

### WP114 — Registry data model and the infrastructure scanner

1. **Registrable domains:** use `tldts` (MIT) for the Public Suffix List. Replace the naive guess in `lab-lookup.ts`; tests for `example.co.in`, `a.b.example.com`, IP literals, IDNs.
2. **Prisma (additive migration, tables prefixed `Lab`, RLS like the existing E2 tables):**
   - `LabProvider` — the curated directory of companies a report can go to: `id, name, kind (LabChokepointKind), website, abusePageUrl?, abuseEmail?, policyUrl?, notes?, verifiedById?, verifiedAt?`. Unique on `(name, kind)`. Seed only **names and public policy/abuse page URLs that you verify from the provider's own site** while building; leave emails empty for analysts. Mark seeds `verifiedAt = null` (an analyst confirms them).
   - `LabInfraScan` — one scan of one service URL: `id, serviceId, url, finalUrl?, httpStatus?, scannedAt, signatureVersion, error?`.
   - `LabInfraFinding` — normalised evidence: `id, scanId, serviceId, category (enum: HOSTING_ASN, CDN, REGISTRAR, NAMESERVER, MAIL, TLS_ISSUER, PAYMENT, CRYPTO_ADDRESS, AUTH_SSO, ANALYTICS_ID, ADS, APP_STORE_LINK, TELEGRAM_LINK, SOCIAL_LINK, REFERRAL_LINK, MODEL_REPO_LINK), providerId?, value, evidence (short text: what matched, e.g. "script src host js.stripe.com"), confidence (HIGH|MEDIUM|LOW), firstSeenAt, lastSeenAt, active Boolean`.
   - `LabServiceLink` — clustering: `id, serviceAId, serviceBId, reason (SHARED_ANALYTICS_ID | SHARED_IP | SHARED_NAMESERVER_SET | SHARED_CRYPTO_ADDRESS | SHARED_TLS_SAN | ANALYST), value, createdAt`.
   - Enum values for new audit events: `LAB_INFRA_SCAN_RUN`, `LAB_PROVIDER_CREATED/UPDATED`, `LAB_FINDING_PROMOTED`.
3. **Scanner** (`src/lib/lab/infra/`), server side, Lab rules (fetch allowed), with hard safety limits:
   - Fetch only the service's public landing page HTML and response headers: GET, no cookies, no JS execution, ≤ 3 redirects (record the chain), 10 s timeout, read at most 1 MB, `content-type` must be HTML/text else stop. **Never request images, video or other media; never follow links; never submit forms; never store the HTML** (keep only extracted findings). Refuse private, loopback and link-local hosts (reuse the liveness guard). User-Agent `AsmitaLab/1.0 (+research; contact on /lab)`.
   - **Signatures** in a versioned JSON file `src/lib/lab/infra/signatures.json` (`signatureVersion` string), written by us (do not copy Wappalyzer or GPL forks). Each signature: `id, category, provider, match` where match is one of `scriptHost`, `linkHost`, `iframeHost`, `formActionHost`, `header` (name + regex), `htmlRegex`. Start with well-known public SDK hosts and headers for: card/wallet payment processors and checkout SDKs commonly used in India and globally, crypto payment gateways, Google/Apple/Microsoft/Discord/Telegram login widgets, CDNs/reverse proxies identifiable by headers, analytics and tag managers (extract IDs such as GA4 `G-…`, GTM `GTM-…`, Meta pixel IDs), ad networks. Each entry needs a comment-equivalent `source` field (the provider's own documentation URL showing that host/header).
   - **Extractors:** crypto addresses in visible text and links (BTC bech32/base58 with checksum validation, ETH `0x` + EIP-55 when mixed case, TRON `T…` base58check) — validate checksums to avoid false positives; Telegram links (`t.me/…`, bots end in `bot`); app store links (Play, App Store); social links; referral/affiliate query parameters on outbound links (`ref`, `aff`, `via`); links to public model repositories (Hugging Face, Civitai).
   - **DNS and network:** A/AAAA → ASN and network name via RDAP IP lookup (IANA bootstrap file, cached); NS set; MX; registrar via domain RDAP (configure the IANA RDAP bootstrap instead of a single `LAB_RDAP_BASE_URL`; keep the env var as an override). TLS: query Certificate Transparency (crt.sh JSON for the registrable domain, 10 s timeout, cap 200 entries) for issuer and SANs; SANs that are other domains become `SHARED_TLS_SAN` link candidates.
   - **Change tracking:** a finding not seen in a new scan becomes `active=false` (never deleted); a new provider in a category is shown as "switched from X to Y".
   - **Runs:** on demand from admin (rate limited, 20/h per admin) and a weekly Cron Trigger route `/api/lab/cron/infra-scan` (CRON_SECRET, Lab off → 200 skipped). Add the schedule in **both** `cronRoutes` in `src/cloudflare-worker.ts` and `triggers.crons` in `wrangler.jsonc` (keep `ENABLE_LAB` false there). Caps per run: 100 services, 300 URLs.
4. **Clustering:** after each scan, compute `LabServiceLink` candidates for services sharing an analytics ID, crypto address, IP (ignore shared-CDN anycast ranges: skip IPs whose finding category is CDN), exact nameserver set (ignore big DNS providers' shared sets: only link when the NS set is not a known large provider), or TLS SAN. Analysts confirm or dismiss links in WP115.
5. **Tests:** every extractor with invented HTML fixtures (no real sites); checksum validation; signature matching; redirect cap; size cap; media never fetched (assert requested URLs); private-host refusal; PSL cases; RDAP/CT parsing from recorded **synthetic** JSON fixtures; clustering rules; memory store plus whichever DB paths E2 already tests.

### WP115 — Registry admin UI, provider reports and public aggregates

1. **`/admin/lab/registry`** (English, `lab:manage`): a table of services (name, kind, status, last scan, number of active chokepoints by category, cluster badge). Filters by status, category, provider. Each service page shows: URLs and liveness, **Infrastructure** (findings grouped by category with evidence, confidence, first/last seen, "switched from" history), **Related services** (links with reason; confirm/dismiss), **Chokepoints** (existing E2), **Reports** (existing E2), and "Scan now".
2. **Promote a finding to a chokepoint** in one action: creates a `LabChokepoint` with the provider (from `LabProvider`), kind mapped from the category, evidence notes pre-filled from the finding's evidence; the abuse contact comes from the provider directory if verified, else the analyst must enter it (never auto-filled from unverified data).
3. **Provider directory page** `/admin/lab/providers`: list, create, edit, mark verified (records who and when). Shows, per provider, how many active services depend on it and the report history and outcomes (actioned / refused / no reply, median days to outcome).
4. **Bulk report:** select several services that depend on the same provider and draft one report listing all of them (reuse `report-templates.ts`; add a multi-service variant). Human review and send exactly as E2 does; a sent report is immutable.
5. **Public aggregates on `/lab/tracker`** (the WP92 page): add counts by chokepoint category ("services using a card payment processor", "using a crypto gateway", "behind a CDN", "with a Telegram bot") and the share that changed provider after a report. **Never name or link a service or provider on public pages** (charter rule); k ≥ 5 for any public count, else show "fewer than 5".
6. **Credits:** a "Research behind this" disclosure on `/admin/lab/registry` and `/lab/tracker` citing Gibson et al. (USENIX Security 2025), ISD (2026), "It Takes a Forum" (2026) and CIR (2025), with links.
7. **Tests:** promote flow, bulk drafting, verified-contact rule, k-anonymity on public counts, no service names in public page data (assert on rendered HTML), permissions, CSRF on mutations.

---

## Track D — Indian sextortion message classifier (win-desktop)

### Background (see sources §D)

- Documented Indian modus operandi (police and news sources, 2021–2026): fake profile → WhatsApp → nude video call screen-recorded (6–10 s) → threat with a deadline (24 h; sometimes half an hour) → payment by UPI/bank in instalments → repeat demands from new numbers → impersonated authority (Delhi Police crime branch, "IPS officer", CBI, "thanedar", "YouTube manager" demanding a "delete" fee) → sending to family/WhatsApp groups. Also: loan-app recovery agents threatening to send **morphed** images to the contact list; matrimonial/dating fake profiles; AI-morphed nudes from video-call screenshots; coercion for sex or for access to another person ("come meet me alone, I'll delete the video"; "bring X to me or I'll make it viral").
- Verbatim Devanagari phrases exist in the sources (listed there with links); no verbatim romanised Hinglish was found in authoritative sources, so romanised forms are our derivations and must be labelled as such.
- No public sextortion chat dataset exists; generic Hinglish abuse datasets (HASOC, TRAC, MACD) are research-only or unlicensed: **do not use them for training**.
- Models: MuRIL (Apache-2.0) is the strongest published encoder for Hinglish abuse classification; L3Cube HingBERT (CC BY 4.0) is a strong romanised baseline. Both are too heavy for the Worker; use them for an offline comparison only.
- Ethics (sources): dialect/script bias inflates false positives (Sap et al., ACL 2019); signals are not verdicts (Meta 2024); non-blaming language (eSafety); minors go to the minor pathway (POCSO); classify in memory, keep no text.
- Existing: WP93 `/lab/message-check` (rule patterns in `src/lib/lab/message-check/patterns.ts`, optional Sarvam summary, under-18 rule first, nothing stored). If WP93 is not on master yet, stop and record that.

### WP116 — Taxonomy, data and an evaluation set

1. **Taxonomy** in `src/lib/lab/sextortion/taxonomy.ts` and documented in `asmita/docs/lab/sextortion-taxonomy.md`. Message-level labels (multi-label):
   - `THREAT_EXPOSE` (threat to publish or send intimate/morphed media), `AUDIENCE_FAMILY` (family, relatives, contacts, WhatsApp group), `AUDIENCE_PUBLIC` (viral, social media, YouTube), `DEMAND_MONEY` (amount, UPI, bank, instalments), `DEMAND_SEXUAL` (meet alone, more images, sexual acts), `DEMAND_THIRD_PARTY` (bring/introduce another person), `DEADLINE`, `AUTHORITY_IMPERSONATION` (police, CBI, cyber cell, thanedar, FIR, arrest, "case band"), `PLATFORM_IMPERSONATION` (YouTube/Instagram/WhatsApp "manager/officer", "delete fee"), `LOAN_RECOVERY` (loan, EMI, recovery agent + morphing/contacts), `CLAIM_HAS_MEDIA` (claims to have a recording/photo), `MORPHING` (edited/AI/morphed), `REPEAT_DEMAND` (paid already, more), `VICTIM_PLEA` (the pasted text is the victim's own message pleading), `MINOR_SIGNAL` (any indication someone under 18 is involved), `NOT_THREAT`.
   - A **stage** inference from the labels (contact → capture → threat → payment → repeat → impersonated authority) used only to choose advice, never shown as a verdict.
2. **Lexicon** in `src/lib/lab/sextortion/lexicon.ts`: per label, Devanagari terms, English terms and romanised Hinglish variants with spelling noise ("viral kar dunga/doonga/denge", "ghar walon/gharwalon", "paise bhej/bhejo", "UPI kar", "24 ghante", "video delete kar dunga", "thanedar", "FIR ho jayegi"). Each Devanagari entry that comes from a source carries the source id from the sources file; romanised entries are tagged `derived`.
3. **Normalisation** (`normalise.ts`): Unicode NFC, lowercase Latin, strip zero-width and look-alike characters, collapse repeated letters (≥ 3 → 2), map digits used as letters only where unambiguous, simple romanisation of Devanagari for a second view (implement a small deterministic ITRANS-like table; no external service), keep both scripts for features.
4. **Synthetic training data** (`tools/lab-sextortion/`): a deterministic generator (seeded) that composes messages from templates × slots (threat verb, media noun, audience, demand, amount, deadline, authority, platform, politeness, script: Devanagari / romanised / mixed / English, plus typo and spacing noise), and **hard negatives**: ordinary family chat about photos and videos ("shaadi ki video bhej do"), real police or bank notices without threats, loan reminders without threats, flirting without coercion, news text about sextortion, awareness messages ("never pay"). At least 6,000 positives and 6,000 negatives, balanced across scripts. **No sexual content, no slurs, no real names, no real phone numbers** (use `98XXXXXX00`-style placeholders), no minors described in sexual contexts (MINOR_SIGNAL examples only state age or school context, e.g. "I am in class 9").
5. **Evaluation set** written by hand, separately from the generator, in `tools/lab-sextortion/eval/` (≥ 300 messages: ≥ 120 threats spread over all patterns in §D background, ≥ 180 hard negatives; each with labels and script tag), styled on the documented patterns but invented. It is never used for training or threshold tuning on the final model (use a split of synthetic data for tuning). Add `eval/README.md` saying who should replace it with human-reviewed examples later.

### WP117 — The classifier and its place in message check

1. **Model (runs on the Worker, no network):** a linear model over hashed features: character 2–5-grams on both script views, word uni/bi-grams on the normalised text, and lexicon hit features. One-vs-rest logistic regression per label, trained in TypeScript (`tools/lab-sextortion/train.ts`, plain gradient descent with L2, early stopping on the tuning split), exported to `src/lib/lab/sextortion/model.json` (weights + feature hash size + version + training date + data generator seed). Model file ≤ 2 MB. Inference in `classify.ts` in < 20 ms for 4,000 characters.
2. **Decision logic:** a message is flagged as a likely sextortion threat only when the model gives `THREAT_EXPOSE` or `CLAIM_HAS_MEDIA` ≥ its threshold **and** at least one of the demand/audience/deadline/impersonation labels ≥ its threshold (combination rule, as the sources suggest: a single keyword is never enough). Thresholds chosen on the tuning split for precision ≥ 0.95 on hard negatives; report recall.
3. **Evaluation report** `asmita/docs/lab/sextortion-eval.md`: per-label precision/recall/F1 on the hand-written eval set, **broken down by script** (Devanagari, romanised, mixed, English) to expose bias; confusion on hard negatives; the rules-only baseline (WP93 patterns) vs model vs rules+model. Optional offline comparison with MuRIL fine-tuned on the same synthetic data (Python, local only, weights never committed): report whether it beats the linear model enough to justify a hosted service; do not ship it.
4. **Integration into `/lab/message-check`:** run rules and the classifier; show "What we noticed" as plain sentences per detected element (e.g. "A threat to send a video to your family", "A deadline", "Someone claiming to be police"), never a raw score or "X% sextortion". If `MINOR_SIGNAL` fires or the rules detect under-18, route to `/minor-support` before anything else (existing rule; keep it first). Advice is chosen by stage: do not pay, do not send more, keep the messages, block after saving evidence, police/CBI never ask for money to delete videos, report at 1930 / cybercrime.gov.in, and Asmita's takedown help. Wording is non-blaming ("This is not your fault"). Add the line "This check can be wrong. It looks for patterns seen in known blackmail cases." Both languages.
5. **Credits and research note** on the page ("How this check works"): cites the documented Indian patterns (police and news sources listed in the sources file), the bias finding (Sap et al.), and that the model is trained on synthetic examples written by Asmita, with the evaluation numbers in plain words.
6. **Privacy:** nothing about the message is stored or logged (labels may be counted in aggregate per day, never with text); add a test that asserts no logging call receives the message text.
7. **Tests:** normalisation cases; lexicon coverage of every documented pattern; combination rule; each hard-negative family stays below threshold; minor routing first; model file loads; latency; no logging of text; Playwright on `/lab/message-check` with an invented threat and an invented harmless message.

---

## Order and hand-off

- dev-vm runs WP110 → WP111 on `feat/hma-exchange`, then WP112 → WP113 on `feat/gend`.
- win-desktop runs WP114 → WP115 on `feat/nudify-registry`, then WP116 → WP117 on `feat/sextortion-classifier`.
- All four branches start from `master` **after** the AI Lab beta (`feat/lab-beta`, WP89–WP96) is merged, because WP113 and WP117 extend Lab beta tools and WP115 extends `/lab/tracker`.
- A watcher on dev-vm verifies each finished branch (full checks, Playwright, worker smoke), runs fix lanes when needed, and opens one PR per branch. **Merging waits for the owner.**
