# Third-party software, weights and licences (lab-gend)

Everything this service depends on, with the exact pin it was built against.
All licences permit use in a public NGO web service. Weights are never
committed; they are downloaded at image build time (or by
`scripts/fetch_weights.py`) from the pinned revisions below and verified
against the sha256 values in `gend/weights_manifest.json`.

## Model code and weights

### GenD — deepfake detection model
- Paper: Yermakov, Čech, Matas, Fritz, "Deepfake Detection that Generalizes
  Across Benchmarks", WACV 2026, pp. 773-783, arXiv:2508.06248 (CC BY 4.0):
  https://arxiv.org/abs/2508.06248
- Code: https://github.com/yermandy/GenD — MIT ("Copyright (c) 2025 Andy"),
  vendored minimally in `gend/modeling.py` and `gend/align.py`
  (see file headers), at commit
  `387a42266dd385fbe8f7626c5d3aa03eea3bfaab`. Full licence text:
  `LICENSE-GenD.txt`.
- Weights: `yermandy/GenD_CLIP_L_14` (Hugging Face, MIT) at revision
  `891ce014a0308386c4d7d25b3dcf436a22db5504`
  — CLIP ViT-L/14 backbone, "LinearNorm" head, fp32 safetensors,
  1,215,928,160 bytes.
  https://huggingface.co/yermandy/GenD_CLIP_L_14
- Base backbone weights (needed to construct the architecture and the
  processor, as GenD's own code does): `openai/clip-vit-large-patch14`
  (MIT) at revision `32bd64288804d66eefd0ccbe215aa642df71cc41`.
  https://huggingface.co/openai/clip-vit-large-patch14
- What it detects: face swaps and face reenactment (trained on
  FaceForensics++ c23), not "any AI-made image"; a detectable face is
  required. The paper reports mean cross-dataset video AUROC 91.2 (CLIP
  variant) over 14 benchmarks, demographic failure cases, and no
  adversarial testing. Pirogov & Artemev (arXiv:2507.21905, CC BY 4.0)
  show JPEG compression and low resolution collapse many deepfake
  detectors; their repository has no licence and none of its code was
  used here.

### YuNet — face detection
- OpenCV Zoo `face_detection_yunet_2023mar.onnx`
  (https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet),
  "All files in this directory are licensed under MIT License", pinned at
  OpenCV Zoo commit `48b10fa505aeb51fbd127fc60a5c660040e823b7`.
- Original model source: https://github.com/ShiqiYu/libfacedetection.train
- Chosen instead of the InsightFace `buffalo_l/det_10g.onnx` RetinaFace
  detector GenD's repository downloads: InsightFace pretrained models are
  non-commercial research only, which does not fit a public NGO service.
  YuNet returns a box and the same 5 landmarks GenD's alignment template
  expects.

## Python dependencies

| Package | Licence | Pin |
|---|---|---|
| fastapi | MIT | >=0.115 |
| uvicorn | BSD-3-Clause | >=0.30 |
| python-multipart | Apache-2.0 | >=0.0.9 |
| opencv-python-headless | Apache-2.0 | 4.12.0.88 (GenD's own pin) |
| numpy | BSD-3-Clause | >=1.26 |
| pillow | HPND (MIT-CMU) | >=10.0 |
| torch | BSD-style (BSD-3-Clause core) | 2.8.0 (CPU wheel) — GenD's pin |
| transformers | Apache-2.0 | 4.56.2 — GenD's pin |
| huggingface-hub | Apache-2.0 | >=0.24 |
| onnxruntime | MIT | 1.21.0 (CPU) |
| onnx (export only) | Apache-2.0 | >=1.16 |
| pytest / httpx / ruff | MIT / BSD-3 | dev only |

## Citation

```bibtex
@inproceedings{GenD,
    title={Deepfake Detection that Generalizes Across Benchmarks},
    author={Yermakov, Andrii and Cech, Jan and Matas, Jiri and Fritz, Mario},
    year={2026},
    booktitle={Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision},
    pages={773--783}}
```
