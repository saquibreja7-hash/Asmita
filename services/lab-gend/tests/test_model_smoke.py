"""Model-loading smoke tests. Skipped when the pinned weights are absent
(the weights are never committed; see scripts/fetch_weights.py)."""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pytest

WEIGHTS_DIR = Path(os.environ.get("GEND_WEIGHTS_DIR", Path(__file__).resolve().parent.parent / "weights"))
GEND_PRESENT = (WEIGHTS_DIR / "gend" / "model.safetensors").is_file()
YUNET_PRESENT = (WEIGHTS_DIR / "yunet" / "face_detection_yunet_2023mar.onnx").is_file()
ONNX_EXPORT_PRESENT = (WEIGHTS_DIR / "gend" / "gend_clip_l_14.onnx").is_file()

pytestmark = pytest.mark.skipif(not GEND_PRESENT, reason="GenD weights not present")


@pytest.fixture()
def settings():
    from gend.settings import Settings

    return Settings(
        token="test-token",
        weights_dir=WEIGHTS_DIR,
        runtime="torch",
        host="127.0.0.1",
        port=8080,
        max_file_bytes=10 * 1024 * 1024,
        max_pixels=40_000_000,
        min_face_px=48,
        face_score_threshold=0.4,
        max_faces=5,
        align_scale=1.3,
        queue_waiting=4,
        request_timeout_s=60.0,
    )


def test_torch_runtime_smoke(settings):
    from gend.runtime import TorchGenD, model_id
    from gend.synth import synthetic_aligned_crops

    scorer = TorchGenD(settings)
    assert scorer.model_id == model_id()
    assert scorer.model_id.startswith("GenD_CLIP_L_14@")
    p_fakes = scorer.score_crops(synthetic_aligned_crops(3, seed=7))
    assert len(p_fakes) == 3
    for p in p_fakes:
        assert 0.0 <= p <= 1.0


def test_numpy_preprocess_matches_hf_processor(settings):
    """The torch-free CLIP preprocessing used by the ONNX runtime is the
    HF processor's exact resize/crop/normalise."""
    import torch
    from transformers import CLIPProcessor

    from gend.preprocess import clip_preprocess_224
    from gend.synth import synthetic_aligned_crops

    processor = CLIPProcessor.from_pretrained(str(settings.clip_base_dir))
    for crop in synthetic_aligned_crops(5, seed=3):
        expected = processor(images=crop, return_tensors="pt")["pixel_values"][0].numpy()
        actual = clip_preprocess_224(crop)
        assert actual.shape == expected.shape == (3, 224, 224)
        assert float(np.abs(expected - actual).max()) == 0.0
    # a non-square crop exercises the shortest-edge + center-crop math
    from PIL import Image

    non_square = Image.fromarray(np.full((200, 500, 3), 120, dtype=np.uint8))
    expected = processor(images=non_square, return_tensors="pt")["pixel_values"][0].numpy()
    actual = clip_preprocess_224(non_square)
    assert float(np.abs(expected - actual).max()) == 0.0


@pytest.mark.skipif(not ONNX_EXPORT_PRESENT, reason="ONNX export not present")
def test_onnx_runtime_matches_torch(settings):
    from gend.runtime import OnnxGenD, TorchGenD
    from gend.synth import synthetic_aligned_crops

    crops = synthetic_aligned_crops(20, seed=11)
    torch_p = TorchGenD(settings).score_crops(crops)
    onnx_p = OnnxGenD(settings).score_crops(crops)
    max_diff = max(abs(a - b) for a, b in zip(torch_p, onnx_p))
    assert max_diff < 1e-3, f"max abs diff {max_diff}"
    assert [p >= 0.5 for p in torch_p] == [p >= 0.5 for p in onnx_p]


@pytest.mark.skipif(not YUNET_PRESENT, reason="YuNet weights not present")
def test_real_yunet_detects_a_face(settings):
    """End-to-end with the real detector on a synthetic image: noise has no
    face; a local sample photo (if provided via GEND_TEST_FACE_IMAGE, never
    committed) must produce landmarks that align to the template."""
    import cv2

    from gend.faces import YuNetFaceDetector

    detector = YuNetFaceDetector(settings.yunet_path)
    noise = np.random.default_rng(0).integers(0, 255, (480, 640, 3), dtype=np.uint8)
    assert detector.detect(noise) == []

    sample = os.environ.get("GEND_TEST_FACE_IMAGE")
    if not sample:
        pytest.skip("GEND_TEST_FACE_IMAGE not set (local check only)")
    image = cv2.imread(sample)
    assert image is not None
    faces = detector.detect(image)
    assert faces, "expected at least one face in the sample photo"

    # chirality: the first landmark (image-left eye per the template) must
    # sit left of the second for a frontal face, and the eye pair above the
    # mouth pair — a mirrored mapping would fail here
    landmarks = faces[0].landmarks
    assert landmarks[0][0] < landmarks[1][0]
    assert landmarks[0][1] < landmarks[3][1]

    from gend.align import align_face

    aligned = align_face(image, landmarks, target_size=None, scale=1.3)
    h, w = aligned.shape[:2]
    expected = (np.array([[0.34, 0.46], [0.66, 0.46], [0.5, 0.64], [0.37, 0.82], [0.63, 0.82]]) + 0.15) * (w / 1.3)
    warped, _ = cv2.estimateAffinePartial2D(landmarks, expected.astype(np.float32), method=cv2.LMEDS)
    assert warped is not None
    # real faces are not template-symmetric: a few pixels of residual is
    # the honest bound (a mirrored or rotated mapping would be far worse)
    residual = np.abs(cv2.transform(landmarks[None, :, :], warped)[0] - expected).max()
    assert residual < 8.0, f"alignment residual {residual}"
    # re-detection on the aligned crop: the eye pair must sit at the
    # template position (0.34 + 0.15) / 1.3, proving orientation, not a
    # mirror (which would put it at (0.66 + 0.15) / 1.3)
    re_detected = detector.detect(aligned)
    assert re_detected
    rel = re_detected[0].landmarks[0] / np.array([w, h], dtype=np.float32)
    assert abs(rel[0] - (0.34 + 0.15) / 1.3) < 0.05, f"re-detected eye at {rel[0]}"
    assert abs(rel[1] - (0.46 + 0.15) / 1.3) < 0.05, f"re-detected eye at {rel[1]}"
