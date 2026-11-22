# GenD evaluation: an honest measurement

Research-grounded tool WP113 (`asmita/docs/research/research-tools-spec.md`,
Track B). The tool itself is described in [`gend.md`](gend.md); this card
holds the method and the aggregate results of our own evaluation.
Methodology and aggregate numbers only, per the Lab charter.

**Question.** How well does GenD separate real portraits from face swaps —
the kind of low-tech morph actually seen in Indian WhatsApp circulation —
and how much do compression, resizing and blur damage that?

## Method

- **Set.** 44 real portrait photographs (Labeled Faces in the Wild, the
  standard face-research dataset of news and publicity photographs of
  adults; research data on local disk only, never committed or
  redistributed) and 44 face-swap composites built from them by the E1
  harness's own composite builder (`tools/lab-bench`, landmark-aligned
  eye-exact paste, colour-matched, feathered elliptical mask — the cheap
  morph, not a GAN-grade deepfake). Every face was located by the E1
  locator's real model (@vladmandic/human 3.3.6 WASM).
- **Degradations** (`tools/lab-bench/src/degrade.ts`, applied before the
  service sees the bytes, so detection and alignment run after the
  degradation exactly as in deployment): JPEG quality 95/75/50/30/10;
  the E1 WhatsApp-style re-encode at long side 1600 and 1280 (quality 70,
  4:2:0); downscale to max side 128; Gaussian blur sigma 1 and 2.
- **Service.** `services/lab-gend` as built in WP112, ONNX runtime, the
  pinned weights (`GenD_CLIP_L_14@891ce014…`, YuNet `2023mar`), run
  locally on dev-vm (2 vCPU, CPU only) for this evaluation — dev-vm is a
  test machine, not a deployment.
- **Metrics per condition**, over the 44 real and 44 fake items: ROC-AUC
  and accuracy at the 0.5 cut over the items that returned a score, and
  the no-face rate per class (a face-swap detector's honest refusal), each
  with a bootstrap 95% confidence interval (2,000 seeded replicates,
  percentile method).
- Because every portrait is a 250 px crop, the two WhatsApp conditions
  never downscaled (1600 and 1280 are above 250) — they measured the
  quality-70 re-encode alone.

## Results (dev-vm, 2026-11-22, 44 real vs 44 face-swap composites)

| condition | real n | fake n | AUC (95% CI) | accuracy @0.5 (95% CI) | no-face real | no-face fake | errors |
|---|---|---|---|---|---|---|---|
| as stored (no degradation) | 44 | 44 | 98.4% (96.2%–99.8%) | 83.0% (75.0%–89.8%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| JPEG quality 95 | 44 | 44 | 98.0% (95.1%–99.8%) | 81.8% (73.9%–89.8%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| JPEG quality 75 | 44 | 44 | 96.3% (91.8%–99.4%) | 77.3% (68.2%–85.2%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| JPEG quality 50 | 44 | 44 | 96.0% (90.7%–99.2%) | 78.4% (69.3%–86.4%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| JPEG quality 30 | 44 | 44 | 94.5% (88.8%–98.4%) | 80.7% (71.6%–88.6%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| JPEG quality 10 | 44 | 44 | 87.0% (79.8%–93.4%) | 58.0% (47.7%–68.2%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| WhatsApp-style re-encode, long side 1600 (E1) | 44 | 44 | 95.6% (90.3%–99.0%) | 78.4% (69.3%–86.4%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| WhatsApp-style re-encode, long side 1280 | 44 | 44 | 95.6% (90.3%–99.0%) | 78.4% (69.3%–86.4%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| downscaled to max side 128 | 44 | 44 | 98.2% (93.5%–100.0%) | 89.4% (80.5%–97.8%) | 47.7% (33.3%–62.9%) | 45.5% (31.3%–60.0%) | 0 |
| Gaussian blur, sigma 1 | 44 | 44 | 97.1% (93.8%–99.3%) | 80.7% (71.6%–88.6%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |
| Gaussian blur, sigma 2 | 44 | 44 | 94.5% (88.5%–98.7%) | 67.0% (56.8%–77.3%) | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) | 0 |

Reading the numbers, in plain words:

- **On clear images GenD worked well**: it ranked a face-swap composite
  above a real portrait about 98 times out of 100 (AUC 98.4%), and at the
  0.5 cut it was right about 83% of the time. Notably this held even
  though our composites are low-tech aligned pastes, not the FF++-style
  deepfakes GenD was trained on.
- **Sharing-platform compression is survivable.** The E1 WhatsApp-style
  re-encode cost about 3 points of AUC (98.4 → 95.6) and about 5 points of
  accuracy; JPEG quality down to 30 stayed in the same band.
- **The extremes hurt.** JPEG quality 10 — a re-shared, re-compressed
  screenshot — dropped accuracy to 58% (AUC 87%). Blur sigma 2 dropped
  accuracy to 67%.
- **Very small images are mostly refused, not judged.** At max side 128 px
  the service found no face in about half the images (47.7% of real,
  45.5% of fake) and answered "no face" honestly rather than guessing; the
  AUC over the half it could judge stayed high (98.2%), but that is a
  selected half. **A small image is the one condition where the tool most
  often cannot help.**

## What this does not say

- The paper's published robustness (mean cross-dataset video AUROC 91.2
  over 14 deepfake datasets) is measured on real deep-learning deepfakes;
  our numbers are on cheap aligned-paste composites — a harder match for
  a detector trained the other way, and closer to what circulates on
  WhatsApp, but a different problem. Both numbers stand on their own.
- Swappir (Pirogov & Artemev's in-the-wild set) was **not** evaluated:
  it is ~117 GB and CC BY-NC; nothing was downloaded for this run.
- No adversarial perturbations (the paper did not test them either), no
  video, no GAN-grade swaps, no demographic breakdown — the paper notes
  failure cases on Black and Asian faces that this set cannot check.
- One machine, one run, 44 portraits: the confidence intervals above show
  what that sample can and cannot support.

## The sentence the public page carries

Derived from this evaluation and shown on `/lab/detectors`:

> GenD is the Lab's own detector, and we tested it ourselves: on clear
> portraits it separated real photos from face swaps well, and it kept
> most of that strength through WhatsApp-style compression, but heavy
> JPEG compression and blur made it much less sure, and on very small
> images it often finds no face to check at all. Treat every score as a
> clue, not proof.

Reproduce with `tools/lab-bench`: `npm run build-set -- <portraits>
<set-dir>` then `LAB_GEND_URL=… LAB_GEND_TOKEN=… npm run gend-eval --
<set-dir>` (portraits are research data on local disk; the run directory
holds the per-item scores and is gitignored).
