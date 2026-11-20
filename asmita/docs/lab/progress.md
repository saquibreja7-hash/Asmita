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
