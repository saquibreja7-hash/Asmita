# Meri Asmita AI Lab: progress

One section per work package, appended as each WP lands. Each entry records what was built, what was not verified on the machine that wrote it, the user-facing sentences for the owner to approve, and the decisions the implementer made alone.

---

## WP51 — Lab foundation plus experiment E2 (branch feat/ai-lab, 20 November 2026)

### What was built

- Charter committed as `docs/lab/charter.md`, verbatim.
- Foundation:
  - `ENABLE_LAB` read in one helper (`src/lib/lab/flags.ts`), on in dev and test, explicit value wins both ways, off in `wrangler.jsonc` (staging and production vars) until the owner turns it on.
  - `lab:manage` permission: SUPER_ADMIN only (`src/lib/auth/admin-permissions.ts`), wired into `page-permission.tsx` and the admin nav ("Lab · AI Lab").
  - ESLint boundary both ways (`eslint.config.mjs`): lab paths (`src/lib/lab/**`, `src/app/**/lab/**`, `tools/lab-*/**`) cannot import complaint-workflow modules (`case-*`, `notice-*`, `hash-*`, `escalation-*`, `case-ops`, `store`); everything outside the lab (tests and scripts excluded) cannot import lab code.
  - The no-URL-fetch lint rule narrowed: complaint files keep every fetch selector exactly as before; lab paths keep only the Zod body checks. Proven by `tests/unit/eslint-lab-boundary.test.ts` (a lab path may fetch a URL-named variable, a complaint path still may not). `tests/integration/no-url-fetch.test.ts` is untouched and still covers complaint code.
  - Prisma: enums, `LabService`/`LabChokepoint`/`LabReport` models, nine `LAB_*` audit event types, migration `20261120000000_lab_e2_tables` (additive, RLS + asmita_app policy like every table).
- E2 in full:
  - Admin pages under `/admin/lab` (English): dashboard, services (`/admin/lab/services`), chokepoints, reports — each with add and edit, all through `/api/lab/*` routes.
  - Per-kind report templates (`src/lib/lab/report-templates.ts`), English, invented placeholders (`{{SERVICE_NAME}}` etc.), unverified facts marked `<TO_BE_VERIFIED_BY_HUMAN>`.
  - Review-then-send: draft from the template filled with service data, editable until sent; email goes through the existing Resend sender under a new lab sender address (`LAB_EMAIL_FROM`, idempotent per report), or the analyst copies the text for a web form and records the submission; outcome (actioned / refused / no reply) recorded afterwards. A sent report never changes.
  - DNS+RDAP lookup helper (`src/lib/lab/lab-lookup.ts`): host from the URL, name servers from DNS, registrar from an operator-configured RDAP base (`LAB_RDAP_BASE_URL`), time-boxed (5 s) and size-capped (64 KB), never throws.
  - Daily liveness check (`GET /api/lab/cron/liveness`, CRON_SECRET, cron `45 2 * * *` in `cronRoutes` and wrangler.jsonc): one HEAD request per tracked URL (8 s timeout, response body never read, private/loopback hosts never fetched, run capped at 200 services / 1,000 URLs), marking each URL and service up or down, with `downSince` tracking. It lives under `/api/lab/cron/liveness`, not `/api/cron/`, because it is lab code and the import boundary would otherwise block its lab imports; `cronRoutes` maps any path.
  - Dashboard: services by status, reports outstanding, median days from first report to down per provider kind, and the E2 metric (share of services down within 30 days of the first report).
  - Public `/lab` page (en + hi, every string in `src/i18n/en.json` and `hi.json`; new Hindi keys listed as machine-translated in `hi-review-status.json`), linked from the footer only; aggregate numbers (tracked, taken down, median days) render only while `ENABLE_LAB` is on, and the page never names or links a service.
- All `/api/lab/*` routes: admin auth with `lab:manage`, CSRF on mutations, Zod validation, shared rate limiter; every mutation audited with its own `LAB_*` event name, audit data carrying ids and counts only.
- Tests added: `lab-flags`, `lab-lookup` (mocked fetch), `lab-liveness` (mocked fetch, secret required, private-host and cap cases), `lab-report-templates`, `lab-services` (memory CRUD, audit, dashboard and public aggregates), `lab-api-routes` (auth, CSRF, validation, flag off, send/outcome flow, audit data policy), `eslint-lab-boundary`; `admin-permissions` and `admin-nav-permissions` extended. Playwright: `tests/e2e/lab.spec.ts`, with `ENABLE_LAB=true` added to the e2e webServer env.

### Not verified on this machine

- No Postgres or Docker here, so the Prisma and Kysely paths of every lab module, the migration SQL itself, and `prisma migrate deploy` were never executed; only the memory path runs in vitest. The migration is hand-written to Prisma's conventions and `prisma validate` and `prisma generate` pass; the e2e global-setup (`prisma migrate deploy` into a throwaway database) is the place it first runs.
- The full Playwright suite does not run on this machine (that is the separate verify step); `tests/e2e/lab.spec.ts` has never been executed and follows the conventions of crawler-journey.spec.ts.
- The ESLint boundary was verified by linting throwaway text at lab and complaint paths (tests/unit/eslint-lab-boundary.test.ts), not by linting a future `tools/lab-*` directory (none exists yet; asmita's eslint only covers asmita/, so the tools globs take effect when those tools land).
- No real DNS or RDAP call was ever made: RDAP needs `LAB_RDAP_BASE_URL`, which is unset by default.

### For the owner to approve (user-facing sentences)

English:
- "Asmita now runs a research Lab. Its public page (AI Lab, in the site footer) explains its experiments and, once switched on, shows only aggregate numbers — never a service's name or address."
- "Lab analysts track services that make 'undress' or face-swap images, record the companies those services depend on, and send each one an abuse report drafted from a per-kind template, reviewed by the analyst before it goes out."
- "Every tracked address is checked once a day and marked up or down; the console dashboard shows how many services went down within 30 days of the first report, and the median days from first report to down per provider kind."
- "Nothing about the Lab is live in production until you set ENABLE_LAB to true in wrangler.jsonc; until then the console is read-only and the public page shows no numbers."

Hindi (machine-translated, pending native review, listed in hi-review-status.json):
- "अस्मिता अब एक शोध लैब चलाती है। इसका सार्वजनिक पृष्ठ (AI लैब, साइट के फ़ुटर में) अपने प्रयोगों के बारे में बताता है और, चालू होने पर, केवल समग्र आँकड़े दिखाता है — किसी सेवा का नाम या पता कभी नहीं।"

### Decisions made on my own

- Admin lab pages live directly under `src/app/admin/lab/` (not the `(admin)` group with a re-export twin): a `(admin)/lab` page would collide with the public `/lab` route. The nav-permission test was pointed at the real file accordingly.
- `LabServiceKind` uses `CHAT_BOT` where the charter says "Telegram or chat bot": the repo is public and must not name a real service.
- RDAP's base URL is operator configuration (`LAB_RDAP_BASE_URL`), not a constant in code: the repo must hold no real service URL. Unset, the lookup still suggests host and name servers; the registrar appears once the owner configures an endpoint.
- The Lab's audit event types are dedicated enum values (`LAB_*`); their data carries ids, counts and field names only — never a service name, URL or report text (tested).
- `downSince` was added to `LabService` (beyond the charter's field list): it is what makes "median days from first report to down" and the 30-day metric computable; the charter named the metrics, not the column.
- The liveness check sends HEAD only, follows redirects, never reads a body, and treats any answer below 500 as up (bot-check 403 pages are still a live host); a 5xx, timeout or unreachable host is down. Private, loopback and link-local addresses are never fetched.
- Services have no delete: rows are the map's history (a service that returns is still the same service). Reports likewise never delete; a sent report is immutable.
- The public `/lab` page renders its explanation always and its numbers only while the Lab is on, so the footer link is never a dead end while the switch is off.
- The liveness cron answers `{ skipped: "lab_disabled" }` (200) while off, so a scheduled run on a switched-off Lab does not page anyone.
# Meri Asmita AI Lab — progress

One section per work package, newest last. The charter lives at
`asmita/docs/lab/charter.md`; experiment cards at `asmita/docs/lab/<id>.md`.

## WP52 — E1 benchmark harness (tools/lab-bench)

Branch `feat/lab-bench`, 20 November 2026. Defined outside
`crawler/docs/full-crawler-spec.md` (this entry is the lab-side record;
`crawler/docs/v2-progress.md` carries a short pointer entry per the work
package's instruction to log there too).

### What was built

- The Lab charter, committed verbatim as `asmita/docs/lab/charter.md`.
- `tools/lab-bench/`: a standalone Node 22 + TypeScript package (own
  `package.json` and lockfile, vitest, `npm run check` = type-check plus
  tests), in the house style of `tools/pdq-agreement` and
  `tools/pdq-robustness`:
  - `build-set <portraits-dir> <out-dir>` — the charter's variants per
    portrait: untouched original (the gallery, byte-identical), 90%x90%
    crop, 0.6x resize, mirror, caption-sticker overlay, screenshot with
    status bar and borders, WhatsApp-style re-encode (long edge 1600, JPEG
    quality 70, 4:2:0, never upscaling), a landmark-aligned face-swap
    composite (exact eye alignment: rotation, scale, translation; colour
    matched patch through a Gaussian-feathered elliptical mask — CPU only,
    OpenCV-free) and that composite through the WhatsApp re-encode (the
    stop-rule combination). A folder with `real/` and `fake/` subfolders is
    imported as-is (labelled public deepfake dataset). Writes `images/` plus
    a strict `set.json` manifest (ids, transforms, labels; nothing about a
    person).
  - `match <set-dir>` — the four methods: whole-image PDQ (the site's own
    `asmita/src/lib/pdq/pdq.ts`, imported never copied, decode via a
    faithful copy of the crawler's measured `prepare.ts` recipe, production
    quality floor 50), SSCD (pinned `sscd_disc_mixup.onnx`, loaded exactly
    as on `origin/feat/crawler-sscd`), PDQ on the face crop, PDQ on the
    background with the face masked out. Metric: recall at 1% FMR per
    transform, threshold calibrated per transform on that transform's
    impostor pairs plus the gallery noise floor.
  - `detect <set-dir>` — adapters behind one interface, each skipped unless
    configured: OpenAI vision (`OPENAI_API_KEY`), Hive (`HIVE_API_KEY`),
    Sightengine (`SIGHTENGINE_USER`/`SIGHTENGINE_SECRET`), and the local
    Community Forensics ViT-S/16 384 (MIT, arXiv 2411.04125) through
    onnxruntime-node. Metric: accuracy and AUC per transform.
  - `report <run-dir>` — `report.md` + `report.html` (aggregate tables
    only). Run directories under `runs/` (gitignored) hold `results.json`,
    per-pair / per-item scores and the reports.
  - `npm run models:fetch` — downloads the two pinned ONNX weights with a
    sha256 check (the crawler image-build discipline); `models/` is
    gitignored, weights are never committed.
- `asmita/docs/lab/e1.md` — the experiment card: method plus empty results
  tables, to be filled only after a real run.

### Verified on this machine (Node 22 container)

- `tools/lab-bench npm run check`: type-check clean, 11 test files / 82
  tests passing.
- `npm ci` reproduces the lockfile; `models:fetch` downloaded and
  sha256-verified both pinned artifacts (98,156,202 and 143,845,409 bytes).
- End-to-end CLI smoke on synthetic portraits: build-set → match (real
  SSCD embeddings; the production face locator loaded and ran) → detect
  (the real local ViT-S scored every item; the three hosted adapters were
  skipped keyless) → report. The report tables render with real numbers,
  and honest "—" rows where the synthetic flat fixtures fall below PDQ's
  production quality floor.
- Face landmarks verified working in the container: @vladmandic/human 3.3.6
  on the tfjs WASM backend (CPU) loads in ~0.3 s and runs detection
  (0 faces on synthetic shapes, as expected for a photograph-trained
  detector).
- Full repo checks (`check.sh`, Node 22, both packages re-verified on the
  committed tree): crawler — lint, type-check, 29 test files / 350 tests,
  build; asmita — lint 0 errors, type-check clean, `prisma validate` ok,
  152 test files / 1250 tests. `check.sh` printed ALL CHECKS PASSED.

### Not verified on this machine

- No real E1 run: there is no portraits folder of Indian faces here. The
  `e1.md` tables stay empty for the owner's real run; only aggregate
  numbers from a real run would ever be published.
- The hosted detectors' live response schemas: the adapters are written
  from the providers' public API docs and tested against invented fixtures
  with an injected fetch. The first keyed run must spot-check the recorded
  raw responses in the run directory.
- Human/blazeface detection quality on real Indian-face portraits (the
  locator is exercised here only on synthetic images).
- The face-swap composite is verified to the pixel on synthetic geometry
  (eye alignment pinned in tests); its realism on real faces is a
  research-run judgement.
- The full Playwright e2e suite runs in a separate verify step; this WP
  touches no site code, so it is unaffected.

### Decisions made on my own

1. Both progress files: the WP text both says progress goes here (its
   "IMPORTANT" note) and asks for an entry in `crawler/docs/v2-progress.md`
   (its final instruction). Both readings are satisfied: the full record
   here, a short pointer entry there.
2. No lint narrowing was needed for WP52. Asmita's ESLint runs from
   `asmita/` and its `no-url-fetch` test is behavioural (store-level), so
   `tools/lab-bench` sits outside both, and complaint coverage is exactly
   as before (the full checks pass unchanged). The charter's narrowing
   becomes live with the first lab WP that adds `src/lib/lab/**` or
   `src/app/**/lab/**`.
3. The "one open local model" is the Community Forensics ViT-S/16 384
   (MIT). Rejected alternatives: Organika/sdxl-detector (ships ONNX but
   CC-BY-NC-3.0), umm-maybe / ninini1 AI-image-detector (ships ONNX, CC-BY,
   but an obsolete 2022 art-image detector whose own card says it is not a
   deepfake photo detector), BitMind's detectors (MIT but PyTorch-only
   weights). Pinned URL + sha256, the same discipline as the crawler's SSCD
   pin; both models are MIT (SSCD licence analysis recorded in ADR 008 on
   `origin/feat/crawler-sscd`).
4. Face landmarks: @vladmandic/human 3.3.6, its `node-wasm` build (pure
   tfjs WASM, no native TensorFlow binding) — the only maintained npm
   package that runs landmark models in plain Node. Two upstream quirks are
   handled once in `src/landmarks.ts` and documented: its package exports
   map misdeclares the dist subpaths (imported by direct path), and its
   node defaults for the WASM binary location and model base are URLs node
   cannot read — both are passed through the constructor config
   (`wasmPath` → the installed tfjs package's binaries, `modelBasePath` →
   the author's CDN, overridable with `LAB_HUMAN_MODEL_BASE`).
5. Region methods in `match`: the CLI passes the production locator; if it
   cannot initialise, the region methods are reported skipped with the
   reason instead of failing the run. Tests inject deterministic fakes so
   the suite never downloads models or runs WASM.
6. Encoding per transform: pixel-only transforms re-encode losslessly (PNG)
   so each row measures its alteration alone; the WhatsApp re-encode and
   the composite are JPEG (they model real re-encodes); originals are
   copied byte-identical so the gallery hashes exactly what production
   would.
7. The face-swap variant's manifest source is the background portrait (the
   base image); the pasted face comes from the next portrait in sort order
   (i + 1 mod n). Operationally a morph of her photo should match HER
   original, so the background owner is the correct genuine pair; scoring
   the pasted-face portrait too belongs to E3's trace question, not E1.
8. Threshold calibration is per transform at the target FMR (1%), each
   transform's impostor pool being its own probe-vs-unrelated-original pairs
   plus the gallery noise floor; ties resolve to the most permissive
   threshold still inside the budget. Thresholds and pair counts are
   recorded in every run so a single global operating point can be derived
   later.
9. Hosted adapters never throw: per-item fixed error codes, defensive
   parsing, raw responses recorded (truncated) in the run directory for the
   first keyed spot-check.
10. AUC per transform pools that transform's items with the untouched
    originals; a pool with a single class reports accuracy only — an
    honest detector's false-flag rate on innocent transforms shows up in
    the accuracy column instead.

### Sentences for the owner to approve

- "The Lab's first experiment tool is ready: it measures how well our image
  matching survives WhatsApp compression and face swaps, and how well four
  AI-image detectors catch morphs — before we decide what powers the trace
  tool."
- "The public repo still contains no real photos, no keys and no results;
  the tool runs on a portrait folder you provide locally, and only the
  aggregate table would ever be published in e1.md."
- "Nothing in the survivor complaint workflow changed."

---

## WP76 — E3 morph-to-source tracing (branch feat/lab-trace, 21 November 2026)

The charter's experiment E3: `/lab/trace`, the browser-side tracing library,
the evidence PDF and the lab-bench `trace` command.

### What was built

- The tracing library under `src/lib/lab/trace/`, inside the Lab import
  boundary, all pure TypeScript over RGBA buffers so the browser page and
  the harness run the same code:
  - `geometry.ts` — the pixel ops: crop, grey-mask, nearest-neighbour
    resize, the eye-pair similarity transform and its inverse sampling, the
    2048-long-edge working-copy cap;
  - `score.ts` — the comparison: whole-image / face-crop / background-mask
    PDQ (the site's own pdq.ts; E1's margins and grey), SSCD cosine, the
    aligned 16x16 tile heat map, the honest notes, the evidence bands and
    the verdict (strong / possible / none; thresholds documented in
    docs/lab/e3.md and pinned by tests);
  - `sscd.ts` — the sscd_disc_mixup input tensor (a faithful port of
    crawler/src/image/sscd-model.ts's tensor half) and the cosine;
  - `pdf.ts` — the evidence PDF: images side by side with highlighted
    regions, scores, date/time, method statement, tool version; built with
    pdf-lib (the notices' library — it is isomorphic, so the browser runs
    it), English-only with the shared isPdfSafeText guard, standalone
    (explicitly not part of complaint filing);
  - `browser.ts` — the in-browser analysis: canvas decode, the landmark
    tool, onnxruntime-web for SSCD, orchestration with timeouts; every
    model failure degrades into an honest note, never a failed run.
- `/lab/trace` (public, behind ENABLE_LAB, en + hi — 51 new keys in both
  dictionaries, listed as machine translated in hi-review-status.json),
  linked from the E3 card on `/lab` while the Lab is on. The page states
  that images stay in the browser, shows each comparison's verdict band
  with an honest explanation, the notes, the scores, the side-by-side
  images with the heat-map overlay, and offers the PDF.
- Models as operator configuration (`src/lib/lab-models.ts`, documented in
  .env.example): `LAB_SSCD_MODEL_URL` (unset: hashing-only, stated on the
  page) and `LAB_HUMAN_MODEL_BASE` (default: the landmark library author's
  model host, the E1 harness's default too). CSP: buildCsp gained a
  `labTrace` option — `'wasm-unsafe-eval'` (WebAssembly compilation only)
  and the configured model origins on connect-src, on /lab/trace only, in
  next.config.ts (dev) and the Worker entry (production).
- The onnxruntime-web WASM engine and the landmark library's browser IIFE
  build are copied from node_modules to `public/ort` / `public/human` at
  install time (`scripts/copy-lab-assets.mjs`, the copy-c2pa-assets
  discipline), gitignored, never committed. No model weights in the repo.
- `tools/lab-bench trace <set-dir>` (built by a subagent, reviewed): the
  same scoring over an E1 set — per probe, all gallery originals ranked,
  reporting the share of probes whose right source ranks first and the
  wrong-source strong rate, overall and per transform, against the charter
  targets (95% / 1%); results.json + pairs.jsonl + trace.md per run.
- Tests: `tests/unit/lab-trace-score.test.ts` (geometry, tensor, region
  split, notes), `lab-trace-verdict.test.ts` (every band boundary, the
  verdict rules, the morph signature, flat-image honesty),
  `lab-trace-pdf.test.ts` (content builder, WinAnsi refusal, assembled PDF
  with both images); `tools/lab-bench/tests/trace.test.ts` (ranking,
  never-strong on unrelated pairs, results shape, degraded modes).
  Playwright: `tests/e2e/lab-trace.spec.ts` — identical pair → strong band,
  unrelated pair → no-evidence band, the /lab link, the honest notes and
  the PDF offer (ENABLE_LAB was already set in the e2e webServer env).

### Verified on this machine

- Real-browser exercise of the full tool (dev server + driven browser):
  identical synthetic pair → strong band; unrelated pair → no-evidence
  band; the hashing-only and landmarks-unavailable notes render; the PDF
  button appears; no console errors, no CSP violations, no horizontal
  overflow at desktop or 375 px; contrast 7.6–19:1 on every checked element.
- `npx tsc --noEmit` clean; the three new unit test files pass (38 tests);
  `tools/lab-bench npm run check` green (12 files / 85 tests, subagent-run
  and including the imported asmita core).
- The full repo checks (`check.ps1 -Scope asmita`) ended with ALL CHECKS
  PASSED: lint 0 errors (4 pre-existing warnings, none in the new files),
  type-check clean, 201 test files / 1901 tests passed.

### Not verified on this machine

- No real morphs, no real faces, no SSCD model (no LAB_SSCD_MODEL_URL set
  here): every number came from synthetic images. The SSCD path in
  `browser.ts` (onnxruntime-web session create + embed) has never executed
  against the real 98 MB weights; its tensor math is pinned by unit tests
  and mirrors the crawler's, but the first configured run must be
  spot-checked.
- WebGL-backed face detection never ran here (headless Chromium without a
  GPU): the landmark path was exercised only through its honest degradation
  (script loads, model init fails, tool continues). Detection on real
  Indian-face portraits is unmeasured, as in E1.
- The full Playwright suite runs in the separate verify step;
  `tests/e2e/lab-trace.spec.ts` follows the conventions of lab.spec.ts and
  hash-flow.spec.ts but has itself never executed.
- `npm run build` / workerd smoke were not run (this machine runs lint,
  type-check and vitest only, per the work package).

### For the owner to approve (user-facing sentences)

English:
- "The Lab's trace tool is ready to try: on /lab/trace you choose the
  image under investigation and the original photos it may have come from,
  and the comparison runs entirely in your browser — nothing is uploaded."
- "The tool shows what the similarity measures do and do not prove, and the
  evidence PDF it can produce is a standalone document for NGOs and the
  police, not part of filing a complaint."
- "The model-based score switches on only when you configure where the
  model lives (LAB_SSCD_MODEL_URL); until then the tool says so and
  compares with image hashing only."
- "Nothing about this is live in production until you set ENABLE_LAB to
  true in wrangler.jsonc."

Hindi (machine-translated, pending native review, listed in
hi-review-status.json):
- "लैब का ट्रेस उपकरण आज़माने के लिए तैयार है: /lab/trace पर आप जाँच की जाने
  वाली तस्वीर और वे असली तस्वीरें चुनते हैं जिनसे वह बनी हो सकती है, और पूरी
  तुलना आपके ब्राउज़र में ही होती है — कुछ भी अपलोड नहीं होता।"

### Decisions made on my own

1. The landmark library is loaded in the browser from our own origin
   (public/human, copied at install) as a plain script, not bundled: its
   package's exports map misdeclares the dist subpaths (the E1 harness hit
   the same quirk in Node), so any bundler's server-side pass resolves the
   bare import to the Node build and fails on its native TensorFlow
   dependency. The vendored-script route is bundler-proof in dev and both
   production builds, and CSP-closed ('self').
2. onnxruntime-web runs single-threaded on the main thread with proxy
   disabled (wasmPaths '/ort/'), so the page CSP needs only
   'wasm-unsafe-eval' — the same keyword /check-image already uses — and
   no worker-src changes.
3. Both compared images are capped at a 2048-long-edge working copy and
   every signal (including whole-image PDQ) runs on that copy: both sides
   pass through the same pipeline, which is what makes the comparison fair.
   This means the page's whole-image hash can differ from what the
   complaint flow's fingerprinting would compute on a huge photo; the trace
   tool compares pairs, it never submits hashes, so nothing cross-matches
   wrongly. Documented in e3.md.
4. The evidence PDF is English-only (pdf-lib's standard fonts cannot draw
   Devanagari, exactly why the site's signing texts are English-only);
   the page says so in the visitor's language. The tool version
   (trace-1.0.0) travels on every result and PDF.
5. Verdict thresholds are provisional (documented in e3.md, pinned by
   tests) until a real E1/E3 run: strong needs 3.5 evidence points across
   at least two measures plus one clear signal; pixel-identical images are
   strong outright — byte equality needs no inference and no thresholds.
6. The face-region score counts as evidence only when it matches; a
   mismatching face never subtracts evidence (with a matching background it
   IS the morph signature). The breakdown shows both bands so a human sees
   the signature, not just a number.
7. The face-landmark backend is pinned to WebGL: it is the fast path on
   every real phone and desktop this audience uses; where WebGL is absent
   (headless CI) the tool degrades honestly instead of falling back to a
   slow CPU or a third-party WASM CDN the CSP does not admit.
8. The `trace` harness command was built by a parallel subagent against the
   frozen core API, then reviewed: it imports the site's scoring (never a
   copy), and its fixture fakes bin embeddings deterministically because
   the existing E1 fake's statistics collide on same-palette images.
9. No admin surface was added: E3 produces no stored data (images stay in
   the browser, results are never persisted), so there is nothing to
   administer and no `Lab*` table.

