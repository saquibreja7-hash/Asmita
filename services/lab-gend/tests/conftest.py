"""Shared fixtures: injected fakes, synthetic images, deterministic
landmark sets built from GenD's alignment template. No real data anywhere."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gend.faces import FaceDetection  # noqa: E402
from gend.settings import Settings  # noqa: E402

TEST_TOKEN = "test-token"


class FakeDetector:
    """Returns canned detections; records what it was given."""

    def __init__(self, detections=None):
        self.detections = detections or []
        self.seen = []

    def detect(self, bgr):
        self.seen.append(bgr)
        return list(self.detections)


class FakeScorer:
    """Fixed per-crop scores, optional artificial latency."""

    def __init__(self, scores=None, delay_s=0.0, model="GenD_CLIP_L_14@testrev"):
        self.scores = scores if scores is not None else [0.7]
        self.delay_s = delay_s
        self.batches = []
        self.model_id = model

    def score_crops(self, crops):
        import time

        if self.delay_s:
            time.sleep(self.delay_s)
        self.batches.append(len(crops))
        return [self.scores[i % len(self.scores)] for i in range(len(crops))]


def make_settings(tmp_path, **overrides) -> Settings:
    values = {
        "token": TEST_TOKEN,
        "weights_dir": tmp_path / "weights",
        "runtime": "torch",
        "host": "127.0.0.1",
        "port": 8080,
        "max_file_bytes": 10 * 1024 * 1024,
        "max_pixels": 40_000_000,
        "min_face_px": 48,
        "face_score_threshold": 0.4,
        "max_faces": 5,
        "align_scale": 1.3,
        "queue_waiting": 4,
        "request_timeout_s": 20.0,
    }
    values.update(overrides)
    return Settings(**values)


def png_bytes(width=640, height=480, seed=0) -> bytes:
    rng = np.random.default_rng(seed)
    image = rng.integers(0, 255, (height, width, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    return buffer.tobytes()


def jpeg_bytes(width=640, height=480, seed=1, quality=90) -> bytes:
    rng = np.random.default_rng(seed)
    image = rng.integers(0, 255, (height, width, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return buffer.tobytes()


def template_landmarks(width=640, height=480, scale=0.35, angle_deg=0.0, dx=0.0, dy=0.0) -> np.ndarray:
    """GenD-template landmarks under a similarity transform, (5, 2) float32."""
    from gend.align import GEND_TEMPLATE

    angle = np.deg2rad(angle_deg)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    base = min(width, height) * scale
    pts = (GEND_TEMPLATE - np.array([0.5, 0.6])) @ rotation.T * base
    pts += np.array([width * (0.5 + dx), height * (0.5 + dy)])
    return pts.astype(np.float32)


def synthetic_face_detections(count=3, width=640, height=480):
    """`count` face detections with template-derived landmarks, largest last."""
    out = []
    for i in range(count):
        scale = 0.18 + 0.05 * i
        pts = template_landmarks(width, height, scale=scale, angle_deg=3.0 * i, dx=0.05 * i, dy=0.05 * i)
        x, y = pts.min(axis=0)
        x2, y2 = pts.max(axis=0)
        box = (int(x), int(y), int(x2 - x), int(y2 - y))
        out.append(FaceDetection(box=box, landmarks=pts, score=0.9))
    return out


@pytest.fixture()
def face_detections():
    return synthetic_face_detections()


def crop_from(image_bgr, landmarks):
    from gend.align import align_face

    aligned = align_face(image_bgr, landmarks, target_size=None, scale=1.3)
    return Image.fromarray(cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB))
