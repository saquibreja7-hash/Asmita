"""Pipeline behaviour: decode limits, face filtering, scoring, no-face path."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from conftest import FakeDetector, FakeScorer, jpeg_bytes, make_settings, png_bytes, synthetic_face_detections

from gend.faces import FaceDetection
from gend.pipeline import (
    DecodeError,
    FileTooLargeError,
    ImageTooLargeError,
    Pipeline,
)


def make_pipeline(tmp_path, detector=None, scorer=None, **overrides):
    settings = make_settings(tmp_path, **overrides)
    return Pipeline(
        detector if detector is not None else FakeDetector(),
        scorer if scorer is not None else FakeScorer(),
        max_file_bytes=settings.max_file_bytes,
        max_pixels=settings.max_pixels,
        align_scale=settings.align_scale,
    )


def test_decode_accepts_jpeg_png_webp(tmp_path):
    pipeline = make_pipeline(tmp_path)
    assert pipeline  # constructible
    from gend.pipeline import decode_image

    for data in (jpeg_bytes(), png_bytes()):
        image = decode_image(data, 10 * 1024 * 1024, 40_000_000)
        assert image.ndim == 3 and image.shape[2] == 3
    ok, buffer = cv2.imencode(".webp", np.zeros((32, 32, 3), dtype=np.uint8))
    assert ok
    image = decode_image(buffer.tobytes(), 10 * 1024 * 1024, 40_000_000)
    assert image.shape[:2] == (32, 32)


def test_decode_rejects_oversized_file(tmp_path):
    from gend.pipeline import decode_image

    with pytest.raises(FileTooLargeError):
        decode_image(b"x" * (10 * 1024 * 1024 + 1), 10 * 1024 * 1024, 40_000_000)


def test_decode_rejects_huge_pixels_before_decoding(tmp_path):
    """A tiny PNG declaring 42 MP is refused from its header, before any
    big allocation."""
    from gend.pipeline import decode_image

    ok, buffer = cv2.imencode(".png", np.zeros((7000, 6000, 3), dtype=np.uint8))
    assert ok
    data = buffer.tobytes()
    assert len(data) < 1024 * 1024
    with pytest.raises(ImageTooLargeError):
        decode_image(data, 10 * 1024 * 1024, 40_000_000)


def test_decode_rejects_non_image_and_wrong_format(tmp_path):
    from gend.pipeline import decode_image

    with pytest.raises(DecodeError):
        decode_image(b"not an image at all", 10 * 1024 * 1024, 40_000_000)
    ok, buffer = cv2.imencode(".bmp", np.zeros((32, 32, 3), dtype=np.uint8))
    assert ok
    with pytest.raises(DecodeError):  # BMP decodes but is not allowed
        decode_image(buffer.tobytes(), 10 * 1024 * 1024, 40_000_000)
    with pytest.raises(DecodeError):  # truncated PNG
        decode_image(png_bytes()[:200], 10 * 1024 * 1024, 40_000_000)


def test_pipeline_scores_each_detected_face(tmp_path, face_detections):
    detector = FakeDetector(face_detections)
    scorer = FakeScorer(scores=[0.1, 0.9, 0.3])
    pipeline = make_pipeline(tmp_path, detector=detector, scorer=scorer)

    outcome = pipeline.score_image(png_bytes())
    assert outcome.status == "ok"
    assert outcome.model == "GenD_CLIP_L_14@testrev"
    assert outcome.detector == "YuNet@2023mar"
    assert [f.p_fake for f in outcome.faces] == [0.1, 0.9, 0.3]
    # image score is the max over faces, not an average: one swapped face
    # is enough to matter
    assert outcome.image_p_fake == 0.9
    assert scorer.batches == [len(face_detections)]
    assert detector.seen[0].shape[2] == 3


def test_pipeline_face_order_is_largest_first(tmp_path):
    detections = list(reversed(synthetic_face_detections(3)))
    detector = FakeDetector(detections)
    pipeline = make_pipeline(tmp_path, detector=detector, scorer=FakeScorer(scores=[0.5]))

    outcome = pipeline.score_image(png_bytes())
    areas = [f.box[2] * f.box[3] for f in outcome.faces]
    assert areas == sorted(areas, reverse=True)


def test_pipeline_no_face_never_scores_zero(tmp_path):
    """No face means an explicit status and a null score — never 0."""
    pipeline = make_pipeline(tmp_path, detector=FakeDetector([]), scorer=FakeScorer(scores=[0.5]))
    outcome = pipeline.score_image(png_bytes())
    assert outcome.status == "no_face"
    assert outcome.faces == []
    assert outcome.image_p_fake is None
    assert outcome.model == "GenD_CLIP_L_14@testrev"
    assert outcome.timings_ms.keys() >= {"decode", "detect", "score", "total"}


def test_detector_filters_small_and_low_score_faces(tmp_path, monkeypatch):
    """The real YuNet wrapper keeps score >= threshold, width and height
    >= 48 px, at most 5 faces, largest first — tested against a stubbed
    cv2.FaceDetectorYN so no weights are needed."""
    from gend.faces import YuNetFaceDetector

    rows = []
    # six "valid" faces of decreasing size -> the 5 largest survive, in order
    for i in range(6):
        side = 300 - 40 * i
        rows.append([10.0, 10.0, float(side), float(side)] + [50.0] * 10 + [0.9])
    # a low-score face and a tiny face are dropped
    rows.append([10.0, 10.0, 500.0, 500.0] + [50.0] * 10 + [0.399])
    rows.append([10.0, 10.0, 20.0, 20.0] + [50.0] * 10 + [0.9])
    rows.append([10.0, 10.0, 60.0, 30.0] + [50.0] * 10 + [0.9])  # height below 48

    class StubYN:
        def __init__(self):
            self.input_size = None

        def setInputSize(self, size):
            self.input_size = size

        def detect(self, image):
            return 0, np.asarray(rows, dtype=np.float32)

    monkeypatch.setattr(cv2.FaceDetectorYN, "create", lambda *a, **k: StubYN())

    detector = YuNetFaceDetector("stub.onnx", score_threshold=0.4, min_face_px=48, max_faces=5)
    detections = detector.detect(np.zeros((480, 640, 3), dtype=np.uint8))
    assert len(detections) == 5
    sides = [d.box[2] for d in detections]
    assert sides == sorted(sides, reverse=True)
    assert sides[0] == 300
    assert all(d.box[2] >= 48 and d.box[3] >= 48 for d in detections)
    assert all(d.score >= 0.4 for d in detections)
    assert all(d.landmarks.shape == (5, 2) for d in detections)


def test_detector_returns_empty_when_none_found(tmp_path, monkeypatch):
    from gend.faces import YuNetFaceDetector

    class StubYN:
        def setInputSize(self, size):
            pass

        def detect(self, image):
            return 0, None

    monkeypatch.setattr(cv2.FaceDetectorYN, "create", lambda *a, **k: StubYN())
    detector = YuNetFaceDetector("stub.onnx")
    assert detector.detect(np.zeros((480, 640, 3), dtype=np.uint8)) == []
