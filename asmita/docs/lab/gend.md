# GenD: the Lab's open face-swap detector

Research-grounded tool, WP113 of the research-tools spec
(`asmita/docs/research/research-tools-spec.md`, Track B; WP112 built the
service). This card records what the tool is, the licence chain, how it is
deployed, and how it appears on the site. The evaluation numbers live in
[`gend-eval.md`](gend-eval.md).

## What it is

GenD — **"Deepfake Detection that Generalizes Across Benchmarks"**, Andrii
Yermakov, Jan Čech, Jiri Matas, Mario Fritz, WACV 2026, pp. 773–783
(arXiv 2508.06248, CC BY 4.0) — is an open deepfake detector. A frozen
ViT-L backbone (the CLIP ViT-L/14 variant we use) with a trained head
classifies an aligned face crop as real or fake; the paper reports mean
cross-dataset video AUROC 91.2 over 14 datasets, trained on FaceForensics++.

What that means in plain words:

- It answers **"is there a face here that looks like a face swap or face
  reenactment?"** It is not a general "was this image made by AI" detector.
- It needs a **visible, detectable face**. No face → the service answers
  `status: "no_face"` and the panel says so — never a score of 0.
- The paper notes **demographic failure cases** (Black and Asian faces) and
  **no adversarial testing**; compression and low resolution are known to
  hurt such detectors. Our own measurements are in `gend-eval.md`.
- A score is a **signal for human review, not a verdict**.

The pipeline: decode in memory → **YuNet** face detection (OpenCV Zoo,
`face_detection_yunet_2023mar.onnx`, score ≥ 0.4, faces ≥ 48 px, up to 5
largest) → 5-landmark similarity alignment to GenD's own template at scale
1.3 → CLIP 224 preprocessing → GenD → `p_fake` per face; `image_p_fake` is
the maximum over faces (one swapped face is enough to matter; an average
would understate it).

## Licence chain (all permissive; nothing non-commercial)

| component | what | licence | where pinned |
|---|---|---|---|
| GenD model code | `gend/modeling.py`, `gend/align.py` (vendored, minimal, headers name the source files and commit) | MIT, "Copyright (c) 2025 Andy", github.com/yermandy/GenD | `services/lab-gend/LICENSE-GenD.txt` |
| GenD weights | `yermandy/GenD_CLIP_L_14` (CLIP variant) | MIT (Hugging Face model card) | `services/lab-gend/gend/weights_manifest.json` |
| CLIP base backbone | `openai/clip-vit-large-patch14` | MIT | same manifest |
| YuNet face detector | OpenCV Zoo `face_detection_yunet_2023mar` | MIT | same manifest |
| The service itself | `services/lab-gend/` | Apache-2.0 (repository licence) | `services/lab-gend/THIRD_PARTY.md` |

Deliberately **not used**: InsightFace's `buffalo_l/det_10g.onnx`, the face
detector GenD's own repository downloads — its pretrained models are
non-commercial research only, which does not fit a public NGO web service.
YuNet supplies the box and the same five landmarks instead, and the mapping
to GenD's landmark order was verified empirically (WP112).

Weights are never committed: `scripts/fetch_weights.py` downloads the pinned
revisions (commit SHAs, sha256-checked) at image build time.

## Deployment

The service (`services/lab-gend/`, FastAPI + uvicorn, Python 3.12, CPU only)
**runs outside the Asmita Worker** — the Worker image stays small and
torch-free. The owner chooses the host; dev-vm is for testing only, not a
deployment. A one-line summary of running it:

```bash
cd services/lab-gend
GEND_TOKEN=<shared secret> GEND_RUNTIME=onnx .venv/bin/python -m gend.service   # binds 0.0.0.0:8080
```

or the multi-stage Docker image (`docker build`), which runs as the non-root
`gend` user and verifies the pinned weights at build time. See
`services/lab-gend/README.md` for the full configuration list.

The app side is two environment values, never committed:

- `LAB_GEND_URL` — the service's base URL (e.g. `https://…/`).
- `LAB_GEND_TOKEN` — the shared bearer secret.

Unset → the detector panel shows the GenD row as "not configured" and no
image is sent anywhere. Set → the panel's route forwards the exact uploaded
bytes (already capped at 10 MB, sniffed to JPEG/PNG/WebP) to the service's
`POST /v1/score` and maps `image_p_fake` onto the panel's 0–100 score and
its verdict bands, like every other row.

## On the site

- The detector panel (`/lab/detectors`) shows a fourth row: **"GenD (open
  model, CTU Prague)"**, with a one-line note that it checks face swaps and
  face reenactment (not every AI-made image) and links to the paper and the
  code. A no-face answer shows "No face found: this detector only checks
  face swaps" instead of a score.
- The page carries a visible **"Sources and credits"** section naming GenD
  (authors, WACV 2026, MIT licence, links) and YuNet (OpenCV Zoo, MIT).
- The limits note on the page summarises our own evaluation
  (`gend-eval.md`) in plain words.
- Everything is in English and Hindi (Hindi machine-translated, pending
  native review, listed in `asmita/src/i18n/hi-review-status.json` under
  the `lab.detectors.*` batch).

Privacy: the panel's route already holds the image in memory for one
request only; with GenD configured the bytes go to that one additional
service, which also keeps them in memory only, never writes them and logs
only status, face count and timings (enforced by the service's tests).

## Citation

From the paper's repository (sources file, `asmita/docs/research/2026-11-sources.md` §B):

```bibtex
@inproceedings{GenD,
  title={Deepfake Detection that Generalizes Across Benchmarks},
  author={Yermakov, Andrii and Cech, Jan and Matas, Jiri and Fritz, Mario},
  year={2026},
  booktitle={Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision},
  pages={773--783}}
```
