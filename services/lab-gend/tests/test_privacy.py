"""Privacy: images are never written to disk and never logged."""

from __future__ import annotations

import builtins
import logging
import os

import cv2
import numpy as np
import pytest
from conftest import TEST_TOKEN, FakeDetector, FakeScorer, make_settings, png_bytes, synthetic_face_detections
from PIL import Image
from starlette.testclient import TestClient

from gend.service import create_app

MAGIC = b"GEND-PRIVACY-MAGIC-7f3a"


def _forbid_writes(monkeypatch):
    """Fail the test on any file write, in-process, during the request."""

    real_open = builtins.open

    def guarded_open(file, mode="r", *args, **kwargs):
        if any(flag in mode for flag in ("w", "a", "x", "+")):
            raise AssertionError(f"image written to disk: open({file!r}, {mode!r})")
        return real_open(file, mode, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", guarded_open)

    real_os_open = os.open

    def guarded_os_open(path, flags, *args, **kwargs):
        if flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC):
            raise AssertionError(f"image written to disk: os.open({path!r}, {flags!r})")
        return real_os_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(os, "open", guarded_os_open)
    monkeypatch.setattr(cv2, "imwrite", lambda *a, **k: (_ for _ in ()).throw(AssertionError("cv2.imwrite called")))
    monkeypatch.setattr(
        Image.Image, "save", lambda *a, **k: (_ for _ in ()).throw(AssertionError("PIL save called"))
    )


def test_no_file_writes_during_request(tmp_path, monkeypatch):
    """An upload well above Starlette's 1 MB spool default (and below our
    10 MB cap) stays in memory end to end: no temp file, no imwrite, no PIL
    save."""
    _forbid_writes(monkeypatch)
    settings = make_settings(tmp_path)
    app = create_app(
        settings, detector=FakeDetector(synthetic_face_detections(1)), scorer=FakeScorer(scores=[0.5])
    )
    rng = np.random.default_rng(0)
    image = np.linspace(0, 255, 2200 * 1600 * 3, dtype=np.float32).reshape(2200, 1600, 3)
    image = (image + rng.normal(0, 6, image.shape)).clip(0, 255).astype(np.uint8)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    data = buffer.tobytes()
    # must exceed the 1 MB spool default to prove the no-spill path
    assert 1024 * 1024 < len(data) < 10 * 1024 * 1024, len(data)
    with TestClient(app) as client:
        response = client.post(
            "/v1/score",
            files={"image": ("big.png", data, "image/png")},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_image_bytes_never_logged(tmp_path, caplog):
    """Log records carry status, face count and timings only — never the
    image bytes, its filename, or an encoded form of either."""
    settings = make_settings(tmp_path)
    app = create_app(
        settings, detector=FakeDetector(synthetic_face_detections(2)), scorer=FakeScorer(scores=[0.5])
    )
    data = png_bytes(seed=9)
    with caplog.at_level(logging.INFO, logger="gend.service"):
        with TestClient(app) as client:
            response = client.post(
                "/v1/score",
                files={"image": ("photo-xyz.png", data, "image/png")},
                headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            )
            # error path too
            client.post(
                "/v1/score",
                files={"image": ("broken.png", MAGIC + b"\x89PNGgarbage", "image/png")},
                headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            )
    assert response.status_code == 200
    raw = caplog.text
    assert "photo-xyz.png" not in raw
    text = raw.encode()
    assert data not in text
    assert MAGIC not in text
    import base64
    import binascii

    for encoded in (base64.b64encode(MAGIC), binascii.hexlify(MAGIC)):
        assert encoded not in text


def test_error_responses_carry_no_image_data(tmp_path):
    settings = make_settings(tmp_path)
    app = create_app(settings, detector=FakeDetector([]), scorer=FakeScorer())
    with TestClient(app) as client:
        response = client.post(
            "/v1/score",
            files={"image": ("broken.png", MAGIC + b"\x00\x01\x02not-an-image", "image/png")},
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
        )
    assert response.status_code == 415
    assert MAGIC not in response.content
    assert "input" not in response.json()


def test_logs_carry_counts_and_timings_only(tmp_path, caplog):
    settings = make_settings(tmp_path)
    app = create_app(
        settings, detector=FakeDetector(synthetic_face_detections(2)), scorer=FakeScorer(scores=[0.5])
    )
    with caplog.at_level(logging.INFO, logger="gend.service"):
        with TestClient(app) as client:
            client.post(
                "/v1/score",
                files={"image": ("x.png", png_bytes(seed=1), "image/png")},
                headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            )
    record = [r for r in caplog.records if r.message.startswith("score ") and "faces=" in r.message]
    assert record, caplog.text
    assert "faces=2" in caplog.text
    assert "total_ms=" in caplog.text
