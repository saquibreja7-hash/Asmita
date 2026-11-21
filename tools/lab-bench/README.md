# lab-bench

Experiment E1 of the Meri Asmita AI Lab (charter: `asmita/docs/lab/charter.md`):
which "AI-made / manipulated" detectors, and which matching methods, hold up
on Indian faces and WhatsApp-compressed morphs?

A standalone Node 22 + TypeScript package. It builds a variant test set from a
local folder of portraits, scores four matching methods and up to four
"AI-generated / manipulated" detectors over it, and writes a local HTML +
Markdown report. Method and aggregate numbers go to `asmita/docs/lab/e1.md`
after a real run; nothing else about a run leaves this machine.

**Research data never enters git**: `data/`, `runs/` and `models/` are
gitignored. Tests use tiny generated images only (solid shapes, gradients) and
invented fixtures on `example.test` hosts; no real photos, model weights or
run outputs are committed.

## Commands (Node 22)

```bash
npm ci
npm run models:fetch        # once: the two pinned ONNX weights (see below)
npm run build-set -- <portraits-dir> <out-dir>
npm run match -- <set-dir>
npm run detect -- <set-dir>
npm run trace -- <set-dir>
npm run report -- <run-dir>
npm test                    # vitest
npm run check               # type-check + tests
```

- **build-set** makes, for every portrait, an untouched original (the
  matching gallery, byte-identical) plus the charter's variants: a crop, a
  0.6x resize, a mirror, a text/sticker overlay, a screenshot with borders, a
  WhatsApp-style re-encode (long edge 1600, JPEG quality about 70), a
  landmark-aligned face-swap composite (CPU only), and the face-swap put
  through the WhatsApp re-encode — the stop-rule combination. Pixel-only
  transforms re-encode losslessly (PNG) so each row measures its alteration
  alone; the re-encode and the composite are JPEG. A folder with `real/` and
  `fake/` subfolders is imported as-is instead (a labelled public deepfake
  dataset), keeping its labels.
- **match** hashes/embeds every item and reports, per method and per
  transform, recall at a 1% false-match rate: PDQ (whole image, the
  production baseline with its quality floor of 50), SSCD, PDQ on the face
  crop only, and PDQ on the background with the face masked out. A probe's
  genuine pair is the original it was built from; its impostor pairs are
  every other original plus the gallery-vs-gallery noise floor. The
  threshold is calibrated per transform on those impostor pairs (with N
  portraits there are N(N-1) impostor probe pairs per transform plus the
  gallery floor — use N >= 30 so 1% means something), and the reported recall
  is the share of genuine pairs matched at it.
- **detect** runs the detector adapters over every item, skipping any whose
  key (or, for the local model, whose weights file) is unset, and reports
  accuracy and AUC per transform (AUC pools the transform's items with the
  untouched originals; a pool with one class gets accuracy only). With no
  adapter available at all (no keys, no fetched weights) the command stops
  with a message listing what was skipped — it never invents scores.
- **trace** runs the site's trace scoring core (the exact code the
  survivor-facing tool runs, imported from `asmita/src/lib/lab/trace/`)
  over every probe x original pair of a built set and reports the charter
  E3 metric: the share of probes whose right source ranks first, and the
  share of probe-vs-non-source pairs the tool calls a strong match.
  Against the charter targets (right source 95% of the time, at most 1%
  wrong-source) the run's `trace.md` and stdout report the measured
  numbers. A missing SSCD model or an unavailable face locator degrades
  honestly — the pairs are scored without that signal and the results note
  it.
- **report** writes `report.md` and `report.html` into the run directory
  (aggregate tables only — no image bytes).

## Package choices (recorded per the work package)

- **sharp** — image decode/encode/composite everywhere (the same library the
  crawler and the PDQ agreement harness use).
- **@vladmandic/human 3.3.6** — face detection + landmark model that runs in
  plain Node; the only maintained npm option (face-api.js is unmaintained
  since 2019). Runs here on its `node-wasm` build: pure tfjs WASM on CPU, no
  native TensorFlow binding. Its dist subpaths are misdeclared in the package
  exports map, so the code imports `dist/human.node-wasm.js` by direct path
  and points tfjs's WASM loader at the installed `wasm-out/` binaries — both
  quirks are handled once in `src/landmarks.ts`.
- **onnxruntime-node 1.22** — the SSCD embedder and the local detector, both
  CPU, single-threaded, deterministic — the same runtime and loading options
  as the SSCD branch (`origin/feat/crawler-sscd`, `crawler/src/image/sscd-pool.ts`).

Two pinned ONNX weights are fetched by `npm run models:fetch` and never
committed (`models/`, sha256-checked, both MIT):

| file | what | pin |
|---|---|---|
| `sscd_disc_mixup.onnx` | SSCD copy-detection descriptor, input `images` [1,3,320,320], output `embeddings` [1,512] L2-normalised | `e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8` |
| `communityforensics-vit-s.onnx` | Community Forensics ViT-S/16 384 fake-image detector (Park & Owens, arXiv 2411.04125), single logit | `55602c73f457858f0b48c19bfa03bc6bd218f37027cb1f6b569ee24e2f954d03` |

The face-landmark models are fetched by human itself on first use from the
author's CDN (override `LAB_HUMAN_MODEL_BASE` for an offline bench).

## Detector adapters

Behind one interface (`src/detectors/`), each skipped unless configured:

| adapter | environment | notes |
|---|---|---|
| `openai` | `OPENAI_API_KEY` (+ `OPENAI_VISION_MODEL`, default `gpt-4o-mini`, `OPENAI_BASE_URL`) | vision chat, strict-JSON verdict folded into one score |
| `hive` | `HIVE_API_KEY` (+ `HIVE_BASE_URL`) | multipart upload, ai-generated class score |
| `sightengine` | `SIGHTENGINE_USER` + `SIGHTENGINE_SECRET` (+ `SIGHTENGINE_BASE_URL`) | `models=ai-generated` check |
| `communityforensics` | local weights file | the pinned ViT-S above, sigmoid on one logit |

The three hosted adapters are written from each provider's public API docs
and are tested here only against invented fixtures with an injected fetch —
no key is used by the test suite and none is committed. The first keyed run
should spot-check the recorded raw responses in the run directory
(`detections.jsonl`); the parsers are deliberately defensive.

## Sets, runs and safety

- `build-set` writes `images/` plus a `set.json` manifest: ids, transforms,
  labels (a transform of a real photo is `real`; a composite or a dataset
  fake is `fake`), dimensions. Nothing about a person is recorded.
- `match`/`detect`/`trace` write `runs/<timestamp>-<kind>/` with `results.json`,
  per-pair (`pairs.jsonl`) / per-item (`detections.jsonl`) scores, and the
  report after `report` (`trace` writes its `trace.md` directly). All
  gitignored.
- Portraits folders are research data on local disk: clothed, non-intimate
  photos of consenting adults only. The Lab never generates sexual content.
- The Pdq hashing is the site's own code (`asmita/src/lib/pdq/pdq.ts`),
  imported — never copied — and decoding follows the crawler's measured
  recipe (`src/prepare.ts`, a faithful copy of `crawler/src/prepare.ts`), so
  the numbers are directly comparable to production PDQ hashes.

## Reading the numbers

- Matching: recall at 1% FMR per transform, threshold calibrated per
  transform. `results.json` also carries the thresholds and pair counts; the
  report's threshold table shows them.
- Detection: accuracy per transform (the detector's own verdict when it
  gives one, otherwise score >= 0.5) and AUC where both classes are present.
- Stop rule (charter E1): if no method beats plain PDQ by 20 recall points on
  face-swap plus WhatsApp, E3 uses PDQ plus SSCD only.

## Known limits

- The face-swap composite is a low-tech composite (aligned paste, colour
  match, feathered mask), not a deep-learning face swap; it models the
  cheap morphs actually seen in Indian WhatsApp circulation, not
  GAN-grade deepfakes — the labelled-dataset import covers those.
- Hosted detector response schemas are not verified against live keys (see
  above); the local ViT-S was verified against its published config only.
- SSCD and the local detector run in-process here; the crawler's
  child-process isolation is a service-safety property, not needed by an
  offline tool that only touches local files.
