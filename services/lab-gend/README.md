# lab-gend: GenD deepfake-detector inference service

A small FastAPI service that wraps the open **GenD** deepfake detector
(Yermakov, Čech, Matas, Fritz — WACV 2026, MIT code and weights) with the
**YuNet** face detector (OpenCV Zoo, MIT). It is one of the Asmita AI Lab's
research tools (research-tools spec WP112): a separate, hostable service the
Lab's detector panel calls. It runs outside the Asmita Worker; the owner
chooses the host. Everything here is AI Lab scope — the complaint-workflow
rules in the repository root do not apply (see `asmita/docs/lab/charter.md`).

What it answers: **is there a face in this image that looks like a face swap
or face reenactment?** GenD is a face-swap/reenactment detector, not a
general "AI-made image" detector: an image without a detectable face gets
`status: "no_face"`, never a score. The paper reports mean cross-dataset
video AUROC 91.2 (CLIP variant) and notes demographic failure cases and no
adversarial testing; JPEG compression and low resolution are known to hurt
such detectors (Pirogov & Artemev, arXiv:2507.21905). A score is a signal
for human review, not a verdict.

## API

`POST /v1/score` — multipart field `image` (JPEG/PNG/WebP, ≤ 10 MB,
≤ 40 MP), header `Authorization: Bearer <GEND_TOKEN>`.

```json
{
  "model": "GenD_CLIP_L_14@<pinned-revision>",
  "detector": "YuNet@2023mar",
  "faces": [{"box": [x, y, w, h], "p_fake": 0.87}],
  "image_p_fake": 0.87,
  "status": "ok",
  "timings_ms": {"decode": 12, "detect": 5, "score": 950, "total": 967}
}
```

- Up to 5 largest faces (box in pixels, top-left corner + size), each
  aligned with GenD's own 5-point template at scale 1.3 and scored.
- `image_p_fake` is the **maximum** over faces — one swapped face is enough
  to matter, so an average would understate the risk.
- No face: `{"faces": [], "image_p_fake": null, "status": "no_face"}` —
  never a score of 0.
- Errors: `{"error": "<code>"}` with 401 (`unauthorized`), 413
  (`file_too_large`, `image_too_large`), 415 (`undecodable_image`), 429
  (`busy`), 503 (`model_not_loaded`, `not_configured`), 504 (`timeout`).

`GET /healthz` — `{"status": "ok"}`, no auth.

## Safety properties

- **Images stay in memory.** Uploads are never spooled to a temp file (the
  multipart spool threshold is raised above the accepted size and a
  middleware rejects larger bodies before parsing), never written, never
  logged. Logs carry status, face count and timings only. Tests enforce all
  of this (`tests/test_privacy.py`).
- **One worker, bounded queue.** One inference at a time, at most
  `GEND_QUEUE_WAITING` requests waiting (more get 429), every request
  bounded by `GEND_REQUEST_TIMEOUT_S` (504). A timed-out request still
  holds its slot until its work item really finishes, so inference never
  overlaps.
- **No remote code.** The Hugging Face checkpoint ships a `modeling_gend.py`
  behind `auto_map` that would need `trust_remote_code=True`; we vendor the
  minimal model code instead (`gend/modeling.py`, MIT, source and commit in
  the header) and load pinned local weights only.

## Configuration (env)

| Variable | Default | Meaning |
|---|---|---|
| `GEND_TOKEN` | unset | shared secret with the Worker; unset → scoring answers 503 `not_configured` |
| `GEND_WEIGHTS_DIR` | `./weights` | where the pinned weights live |
| `GEND_RUNTIME` | `torch` | `torch` (reference) or `onnx` (no torch at runtime) |
| `GEND_HOST` / `GEND_PORT` | 0.0.0.0 / 8080 | bind address |
| `GEND_MAX_FILE_BYTES` | 10485760 | upload byte cap |
| `GEND_MAX_PIXELS` | 40000000 | decoded pixel cap |
| `GEND_MIN_FACE_PX` | 48 | faces smaller than this (width or height) are ignored |
| `GEND_FACE_SCORE_THRESHOLD` | 0.4 | YuNet detection threshold (GenD's own default) |
| `GEND_MAX_FACES` | 5 | largest faces scored per image |
| `GEND_ALIGN_SCALE` | 1.3 | GenD's alignment scale |
| `GEND_QUEUE_WAITING` | 4 | requests that may wait while one runs |
| `GEND_REQUEST_TIMEOUT_S` | 20 | request deadline |

## Running locally

```bash
cd services/lab-gend
python3.12 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu "torch==2.8.0"
.venv/bin/pip install -e ".[torch,dev]"
.venv/bin/python scripts/fetch_weights.py          # pinned revisions, sha256-verified
GEND_TOKEN=dev-token .venv/bin/python -m gend.service
.venv/bin/python -m pytest                          # model smoke tests skip if weights absent
```

Weights are never committed (`.gitignore`); `scripts/fetch_weights.py`
downloads the exact pinned revisions listed in `gend/weights_manifest.json`
and verifies every file's sha256. The GenD checkpoint is ~1.2 GB, the CLIP
base backbone ~1.7 GB, YuNet ~230 KB.

## ONNX mode (optional)

`scripts/export_onnx.py` exports GenD's forward on a 1×3×224×224 input;
`scripts/validate_onnx.py` runs the WP112 acceptance gate: max absolute
difference vs PyTorch on 50 synthetic aligned crops < 1e-3 and the same
decision at 0.5 on all 50. If the gate passes, `GEND_RUNTIME=onnx` runs the
service on `onnxruntime` alone (the exported graph plus a torch-free
reimplementation of the CLIP 224 preprocessing, `gend/preprocess.py`), so
the runtime image carries no torch. Sizes and latencies of both runtimes
are recorded in `asmita/docs/research/progress.md` (WP112).

## Docker

Multi-stage (`Dockerfile`): the builder installs the torch runtime,
downloads and verifies the pinned weights, and (for `RUNTIME=onnx`) exports
and validates the ONNX graph; the runtime stage installs only what the
chosen runtime needs and runs as the non-root `gend` user.

```bash
docker build -t lab-gend:onnx  --build-arg RUNTIME=onnx  .
docker build -t lab-gend:torch --build-arg RUNTIME=torch .
docker run --rm -p 8080:8080 -e GEND_TOKEN=<secret> lab-gend:onnx
```

## Licences

The service code is Apache-2.0 (repository licence). Vendored GenD files
are MIT (`LICENSE-GenD.txt`); full licence chain with pins:
`THIRD_PARTY.md`.
