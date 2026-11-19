# ADR 008: SSCD as a second matching layer, seeded from confirmed copies

- Status: Proposed (not accepted; nothing here is enabled by default)
- Owner decision: 19 November 2026 (Saquib). Work package WP28 of the crawler
  v2 lane (defined outside `full-crawler-spec.md`; that spec's "Rules that do
  not change" still apply).
- Scope: the `asmita/` app and the `crawler/` service.

## Context

PDQ finds near-duplicates. It does not survive crops, rotations, borders,
heavy re-encoding, mirror flips or screenshot-style rescaling, so an attacker
who alters a copy even moderately defeats the first layer. Survivors asked for
more: the crawler should find *altered* versions of images an analyst has
already confirmed.

SSCD ("A Self-Supervised Descriptor for Image Copy Detection", Pizzi et al.,
CVPR 2022, Meta AI Research) is a deep image-copy-detection descriptor built
exactly for this: robust to the transformations above, and the released
`sscd_disc_mixup` model is the reference copy-detection model for the
DISC21 benchmark.

## Decision

1. PDQ stays the first layer, unchanged. A survivor's device is unchanged:
   no model runs there and nothing new is sent from it.
2. When an analyst ACCEPTS a crawler finding, the crawler — never the Worker
   app — computes an SSCD embedding of that confirmed image at the moment it
   next holds the image's bytes in memory (a PDQ match on a revisit), and
   sends only the embedding to the app. The app stores it encrypted at rest
   (new `FindingEmbedding` table) and only for findings an analyst has
   already confirmed. Never an image, crop or thumbnail crosses to the app.
3. The crawler pool (`GET /api/crawler/pool`) serves those embeddings back,
   under the existing gating (consented, approved, non-withdrawn
   fingerprints), and the crawler keeps them in memory, matching by
   brute-force cosine (fine at Asmita's scale; the bound is below).
4. Images that PDQ did not match are compared with those embeddings on a
   budget: only on sources where a finding was already accepted
   (`SSCD_SCOPE=matched_sources`, default) or everywhere (`SSCD_SCOPE=all`),
   with a per-run cap on SSCD inferences (`SSCD_MAX_PER_RUN`). An SSCD hit
   above the threshold becomes a finding with a new `method` field
   (`pdq | vpdq | sscd`) and goes to the same analyst review; analysts see
   which layer matched. Borderline PDQ matches (distance 25–31) also get an
   SSCD score against that fingerprint's embeddings when one exists, shown to
   the analyst — never an automatic accept or reject.
5. Off by default: `ENABLE_SSCD=false` in the crawler and the app; nothing
   changes when it is off.
6. Model: SSCD `sscd_disc_mixup`, run with `onnxruntime-node` (CPU) in an
   isolated child process equivalent to the decoder child — memory only,
   under time and memory budgets, never writing an image to disk. Weights are
   never committed to git: the Dockerfile downloads them at image build time
   from a pinned URL and checks a sha256.

## Licence (checked before any use)

- **Code**: the repository `facebookresearch/sscd-copy-detection` is MIT
  ("Copyright (c) Meta Platforms, Inc. and affiliates.",
  https://github.com/facebookresearch/sscd-copy-detection/blob/main/LICENSE).
  The repo was relicensed from CC-NC to MIT on 2022-07-14 (commit `6db4262`,
  "Relicense to MIT.").
- **Weights**: also MIT. The project's lead author, Ed Pizzi, answered the
  question directly (GitHub issue #12, "Model Weight License",
  2023-09-26): *"The entire project, including model weights, is licensed
  under the MIT license."*
  (https://github.com/facebookresearch/sscd-copy-detection/issues/12#issuecomment-1736328008).
  The checkpoints hosted at `https://dl.fbaipublicfiles.com/sscd-copy-detection/`
  carry no separate licence file; the repo's MIT licence plus that statement
  govern them. MIT's only obligation is preservation of the copyright and
  permission notice, which the container image ships beside the weights.
- **The artifact we run**: an ONNX export of `sscd_disc_mixup` —
  `https://huggingface.co/nutszebra/sscd_onnx/resolve/main/sscd_disc_mixup.onnx`
  (98,156,202 bytes, sha256
  `e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8`).
  There is no first-party ONNX export, so this is a third-party format
  conversion of the official MIT-licensed torchscript; its provenance was
  verified before pinning (the export's recorded source sha256 matches the
  official `sscd_disc_mixup.torchscript.pt` downloaded and hashed from
  `dl.fbaipublicfiles.com` —
  `9f26bd4c848cc19b73d2ae92eea6e04886f61a7b764ceb7a13aeee62e6a6db56`).
  The alternative — pinning the official torchscript and exporting ONNX in
  the Docker build stage — would drag PyTorch into the image for no licence
  benefit; the conversion carries no new licence terms. If the owner prefers
  a first-party-only artifact, the pin can be swapped for the torchscript
  sha256 above at the cost of a PyTorch build stage.
- Verdict: **permitted**. MIT grants everyone the right to use, copy, modify
  and redistribute, with no commercial/non-commercial restriction; Asmita's
  non-commercial survivor-support use is unambiguously covered, and the only
  obligation is shipping the MIT notice with the weights.

## Model details (pinned)

- Model: `sscd_disc_mixup` — ResNet-50 trunk with generalized-mean pooling,
  trained on DISC21 (the repo's recommended default for copy detection).
- Input: `images`, float32 NCHW `[1, 3, 320, 320]` — the repo's square-tensor
  recipe ("Copy detection using square tensors benefits from directly
  resizing the image to the target tensor size"): convert to RGB, resize
  straight to 320x320 (aspect skewed, no crop), scale to [0,1], normalise
  per channel with the ImageNet mean `[0.485, 0.456, 0.406]` and std
  `[0.229, 0.224, 0.225]` (RGB order).
- Output: `embeddings`, float32 `[1, 512]`, already L2-normalised, so cosine
  similarity is a plain dot product.
- Reference operating point from the SSCD docs: on DISC21 pairs, cosine
  similarity greater than 0.75 marks copies with 90% precision. Our own
  threshold, measured on our synthetic evaluation set, is below.

## Design details

### Seeding: how an embedding is created

The crawler, not the app, computes embeddings (the app must never hold image
bytes; the crawler already holds them in memory while hashing). The simpler
correct timing was chosen: **at the moment of a PDQ match while the bytes are
still held**, not on some later encounter. On every image-kind PDQ hit, when
SSCD is enabled, the crawler embeds the image once and posts it to the new
`POST /api/crawler/embeddings` service route. The app resolves the pool id,
recomputes the finding's location digest exactly as `recordCrawlFindings`
does, and stores the embedding **only if that finding exists and is APPROVED**
(analyst-confirmed) under a live authorisation. Unconfirmed findings' vectors
are discarded (`finding_not_confirmed`); repeats are idempotent
(`embedding_exists`). So the set of stored embeddings is exactly "embeddings
of analyst-confirmed copies", and the analyst's acceptance — not the
crawler's guess — is the gate. Cost of the simple design: the crawler burns
one inference per match sighting even when the finding is not (yet) confirmed
or is already embedded; bounded by `SSCD_MAX_PER_RUN` and small because
matches are rare (recorded as a known cost, not a defect).

The second layer never samples videos and never runs on sprite tiles; an
embedding is a whole image only.

### What is stored

New table `FindingEmbedding` (RLS on, deny by default, `asmita_app` only —
the same rule as every crawler table, see migration
`20261117050000_crawler_v2_rls`):

- `findingId` (unique) — the confirmed finding the embedding was seeded from.
- `hashSubmissionId`, `caseId` — the fingerprint it belongs to (denormalised
  for the pool lookup and the deletion paths).
- `model`, `version` — which descriptor produced it (`sscd_disc_mixup` /
  `onnx-1` today). The pool serves, and the embeddings route accepts, only
  the model id + version the deployment is configured for, so a model change
  never mixes incomparable vectors.
- `vectorEncrypted` — the 512-dim vector, `encryptField` at rest like every
  other secret.
- `createdAt`.

`CrawlFinding` gains `method` (`PDQ`/`VPDQ`/`SSCD`, default `PDQ`; a data
backfill relabels pre-existing video findings as `VPDQ`) and
`sscdSimilarity` (the borderline score shown to the analyst); `distance`
becomes nullable because an SSCD finding has no PDQ distance (a widening —
old code always wrote a distance, old rows are untouched).

### What the pool serves

Under `ENABLE_SSCD=true`, an image fingerprint's pool entry gains
`sscd: { model, version, vectors }` — the decrypted vectors of its confirmed
copies (at most 16 per fingerprint), under exactly today's pool gating: the
fingerprint is approved, a live authorisation lists it, nothing else is
disclosed. The crawler holds them in memory for the run and re-syncs on the
existing schedule; withdrawal, rejection or erasure removes the vectors from
the next pool build, and a withdrawn pool id stops matching at once as today.

Scale bound (documented as the "brute-force is fine" limit): each 512-dim
vector is 2 KiB of Float32 in the crawler's memory; 10,000 confirmed-copy
embeddings are ~20 MB and scan in well under a millisecond per query. The
pool JSON caps at 16 vectors per fingerprint. Beyond tens of thousands of
embeddings an ANN index would be needed; at Asmita's scale (confirmed copies
per case are few) that is far away, and the per-run inference cap bounds the
work regardless.

### The second layer

Per image whose PDQ (and vPDQ) match found nothing, when the pool carries at
least one embedding:

1. Scope gate: `SSCD_SCOPE=matched_sources` (default) runs the layer only on
   sources the app has flagged as having an accepted finding
   (`matched: true` on `GET /api/crawler/sources`, served only while SSCD is
   enabled); `SSCD_SCOPE=all` runs everywhere. One gate covers all SSCD
   inferences on a source (the second layer, the borderline score and the
   seeding) — the seeding loses nothing by it, because a confirmed finding's
   own source always carries that flag.
2. Budget gate: at most `SSCD_MAX_PER_RUN` SSCD inferences per run (default
   2000); images beyond it are counted (`sscdSkippedBudget`), never run.
3. The image is embedded once in the isolated child (the same bytes buffer it
   was hashed from, still in memory) and compared with every embedding by
   cosine. Every fingerprint whose best similarity is at least
   `SSCD_THRESHOLD` becomes a finding: `method: "sscd"`, `sscdSimilarity`
   set, no `distance`, same analyst review as any other finding.
4. Borderline PDQ matches (distance 25–31) get an SSCD score against that
   fingerprint's own embeddings, carried on the finding as `sscdSimilarity`
   and shown to the analyst. It is information for the reviewer, never an
   automatic accept or reject; the second-review rule alone decides.
   An SSCD finding (no PDQ distance) always requires the second reviewer,
   like the least-certain PDQ matches: a new layer starts strict.

An image that already matched PDQ is never scanned against other
fingerprints' embeddings (the spec's words: images PDQ did not match).

### Where the model runs

`crawler/src/image/sscd-worker.ts` — a fourth child process
(`dist/sscd-worker.js`), isolated exactly like the decoder child: image bytes
in, `{ vector, rss }` out, strict protocol, scrubbed environment (no key, no
config; the model path and its expected sha256 ride its argv, which is not
secret), Node permission model (no fs writes, no child processes, no worker
threads, reads confined to its own bundle, sharp/libvips, onnxruntime-node
and the model file), JS heap cap, parent-side recycling by task count and
reported RSS, per-task timeout with kill-and-replace, stdout/stderr
discarded. A separate child rather than the decoder child because
onnxruntime's native memory profile (~300 MB with the model resident) is very
different from sharp's; the decoder child's budgets, protocol and tests stay
untouched, and nothing about it changes when SSCD is off (the child is never
spawned). Image bytes never touch the disk: sharp decodes from the buffer in
memory, resizes to 320x320, and the tensor goes straight into
onnxruntime-node.

Weights distribution: `crawler/Dockerfile` downloads the pinned ONNX URL at
image build time and refuses to build on a sha256 mismatch
(`SSCD_MODEL_URL` / `SSCD_MODEL_SHA256` build args, defaults pinned above);
the weights are never committed to git, and `.dockerignore`/gitignore keep
them out. In the image the file is read-only for the `node` user.

### Counters, never vectors

Logs carry counts only: `sscdInferences`, `sscdMatches`, `sscdSkippedBudget`
(and `sscdSkippedScope`, `sscdEmbeddingsPosted`, `sscdEmbeddingsStored`),
present in `run_summary` only while SSCD is enabled. No embedding value, no
vector dimension, no similarity of an individual image is ever logged.

## Evaluation (synthetic set, generated images only)

`crawler/scripts/eval-sscd.ts` (not part of `npm test`) generates its own
images — shapes, gradients, rendered text and sharp test patterns only, never
a photo of a person — and measures, through the real isolated child:

- PDQ recall over the variant set at the pool threshold (31),
- PDQ+SSCD recall (a hit is either layer firing),
- false matches between unrelated synthetic images (the base images and their
  variants against each other),
- SSCD seconds per image in the container,
- and the cosine threshold we chose and why.

Numbers from the run on 2026-11-19 (Node 22 container, one core; the run
also re-verified the pinned sha256 at download):

- Base images: 12 synthetic (blob/stripe/noise patterns, rendered text
  panels on gradients). Variants per base: crop 10%, crop 30%, crop 50%,
  5% border, 2-degree rotation, colour filter (desaturation), gaussian
  blur, JPEG q30 re-encode, screenshot-style rescale to 480px with fake
  browser chrome bars, mirror flip — 10 variants per base, 120 variant
  queries in all. ffmpeg test patterns were not used (no ffmpeg in the
  container); sharp rasterisation covers the same ground.
- **PDQ recall: 30.0% (36/120)** — exactly its known shape: it caught every
  colour filter, blur and JPEG re-encode (12/12 each, near-duplicates) and
  **nothing else** — 0/12 for every crop, the border, the rotation, the
  screenshot and the mirror.
- **PDQ+SSCD recall at the chosen threshold 0.85: 58.3% (70/120)** — nearly
  double PDQ alone (at 0.75: 64.2%; 0.80: 62.5%; 0.90: 43.3%; 0.95:
  37.5%). What SSCD added at 0.85: the 10% crops 10/12, the border 9/12,
  the 2-degree rotation 3/12 and **every mirror flip 12/12** (cosine
  0.91-0.97). What still escapes: heavy crops (30%: cosine 0.44-0.66;
  50%: 0.56-0.77) and the screenshot with chrome bars (0.34-0.75) —
  honest limits of the layer, recorded here.
- **False matches between unrelated synthetic images at 0.85: 31 of 1,452
  unrelated pairs (2.1%)** — 12 of 132 base-vs-base pairs, 19 of 1,320
  variant-vs-other-base pairs; the highest cosine any unrelated pair
  reached was 0.867. Caveat that cuts both ways: this synthetic set is
  deliberately hard (the generator makes structurally similar images —
  blobs over smooth gradients — far more alike than real photographs),
  so the 2.1% is an upper bound on confusion, and the recall numbers are
  for images that share a generator, not a camera. SSCD's own published
  calibration on real image pairs (DISC21) puts 90% precision at cosine
  0.75.
- **Chosen threshold: 0.85** (the `SSCD_THRESHOLD` default). It nearly
  doubles recall over PDQ while keeping the unrelated-pair false rate on
  this hard set at ~2% — and every SSCD hit costs an analyst review, not
  an automatic action, and always needs the second reviewer. A deployment
  that wants fewer candidates raises the knob toward 0.90 (zero false
  matches here, 43.3% recall); one that trusts the review queue can
  lower it toward SSCD's own 0.75.
- **SSCD time per image: 198 ms mean** (decode + 320x320 resize +
  inference, through the real isolated child process, one core) over 120
  variant embeds — about 5 images/second/child, so the 2,000-inference
  default budget is roughly 6.5 minutes of the run.

## Retention and deletion

Deleting or withdrawing the fingerprint, the consent or the case deletes its
embeddings, on every backend (memory, Worker Kysely, Prisma):

- Withdrawing the crawl authorisation deletes the case's embeddings at once
  (the pool stops serving them on the next build, exactly as a withdrawn
  pool id stops matching today).
- Rejecting a fingerprint (admin reject) deletes its embeddings.
- Account erasure / case hard delete deletes the case's embeddings with the
  findings.
- Embeddings are NOT subject to the 30-day URL blanking: the address of a
  confirmed copy expires, the descriptor of the confirmed copy must keep
  working, or the second layer would silently die a month after every
  confirmation. They leave with the fingerprint, consent or case above —
  nothing else holds them.

## Risks

- **An embedding is more informative than a PDQ hash.** A 512-dim deep
  descriptor of an intimate image could, in principle, be probed to infer
  coarse visual properties, which a 64-bit hash cannot. Mitigations: vectors
  are encrypted at rest (`vectorEncrypted`) like every other survivor secret;
  they never leave Asmita except to the crawler service over the
  service-key-authenticated channel under the same consent gating as the PDQ
  hashes it already carries; they are never logged (counts only); they are
  deleted with the fingerprint, the consent or the case; the crawler holds
  them in memory for one run only, in the parent process that already holds
  the fingerprint pool, and the child that computes them never sees a vector
  it did not compute from the bytes it was handed.
- **Model supply chain.** The weights come from a third-party ONNX export
  (provenance verified against Meta's official torchscript, both MIT). A
  sha256 check at image build and again at child start bounds substitution;
  pinning the first-party torchscript instead would trade a PyTorch build
  stage for the same licence.
- **Cost.** Each second-layer image costs one CPU inference (measured below);
  the scope rule (matched sources only) and the per-run cap bound the total,
  and the runbook tells operators what memory to give the job when the
  feature is switched on.
- **Model change.** Vectors are comparable only within one model id + version;
  the app serves and accepts only the configured pair. Changing the model
  requires re-seeding from confirmed copies (the old rows stop being served;
  they are deleted with their cases, or by the owner's migration if a
  deployment wants the space back sooner).
- **Review load.** A low threshold trades analyst hours for recall; the
  threshold is a config knob and the evaluation below is the calibration
  record.

## Consent change (for the owner's approval)

The crawl authorisation text (`CRAWL_AUTHORISATION`, `prisma/template-seeds.ts`)
gains one sentence in item 2, seeded **unreviewed** (the seed logic resets
`reviewedByLegal` when the legal text changes; it is never set by code):

> "Where a person at Asmita has confirmed that a copy matches, Asmita may
> also keep a numerical description of that confirmed copy — never the image
> itself — so that altered versions of it can be found too."

The exact sentence is listed in the WP28 commit message for the owner's
approval. `reviewedByLegal` is not set anywhere by this work package.

## Open items

- Nothing here is deployed; `ENABLE_SSCD` stays off in every environment
  until the owner turns it on, and the crawl authorisation sentence needs
  his (and counsel's) approval before it is signed by anyone.
- The real SSCD child ran end to end only in the evaluation script (in the
  Node 22 container, against the pinned weights); `npm test` exercises the
  child's protocol and isolation through a fake worker and the second
  layer's pipeline through an in-process stand-in, because the weights are
  never committed. The Docker image build (which downloads and verifies the
  weights and installs onnxruntime-node) was not run in this work package.
