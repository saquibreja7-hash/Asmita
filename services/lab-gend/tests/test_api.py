"""HTTP behaviour: auth, health, response shape, limits, queue, timeout."""

from __future__ import annotations

import asyncio

import cv2
import httpx
import numpy as np
import pytest
from conftest import (
    TEST_TOKEN,
    FakeDetector,
    FakeScorer,
    jpeg_bytes,
    make_settings,
    png_bytes,
    synthetic_face_detections,
)
from starlette.testclient import TestClient

from gend.service import create_app


def make_client(tmp_path, detections=None, scorer=None, **overrides):
    settings = make_settings(tmp_path, **overrides)
    app = create_app(
        settings,
        detector=FakeDetector(detections if detections is not None else []),
        scorer=scorer if scorer is not None else FakeScorer(scores=[0.42]),
    )
    return TestClient(app), app


def post_image(client, data=None, token=TEST_TOKEN, field="image", filename="x.png", content_type=None):
    files = {field: (filename, data if data is not None else png_bytes(), content_type or "image/png")}
    headers = {"Authorization": f"Bearer {token}"} if token is not None else None
    return client.post("/v1/score", files=files, headers=headers)


def test_healthz_open_without_auth(tmp_path):
    client, _ = make_client(tmp_path)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_required(tmp_path):
    client, _ = make_client(tmp_path, detections=synthetic_face_detections(1))
    assert post_image(client, token=None).status_code == 401
    assert post_image(client, token="wrong-token").status_code == 401
    # auth is checked before the body: an oversized upload with a bad token
    # is still 401, never parsed
    assert post_image(client, data=b"x" * (11 * 1024 * 1024), token="wrong").status_code == 401


def test_score_success_shape(tmp_path):
    detections = synthetic_face_detections(3)
    scorer = FakeScorer(scores=[0.1, 0.9, 0.3])
    client, _ = make_client(tmp_path, detections=detections, scorer=scorer)
    response = post_image(client)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert set(body) == {"model", "detector", "faces", "image_p_fake", "status", "timings_ms"}
    assert body["model"].startswith("GenD_CLIP_L_14@")
    assert body["detector"] == "YuNet@2023mar"
    assert body["status"] == "ok"
    assert body["image_p_fake"] == 0.9
    assert [f["p_fake"] for f in body["faces"]] == [0.1, 0.9, 0.3]
    for face in body["faces"]:
        assert len(face["box"]) == 4 and all(isinstance(v, int) for v in face["box"])
    assert set(body["timings_ms"]) == {"decode", "detect", "score", "total"}


def test_score_no_face(tmp_path):
    client, _ = make_client(tmp_path, detections=[])
    response = post_image(client)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "no_face"
    assert body["faces"] == []
    assert body["image_p_fake"] is None


def test_score_missing_field_is_422(tmp_path):
    client, _ = make_client(tmp_path, detections=synthetic_face_detections(1))
    response = client.post(
        "/v1/score",
        files={"not_image": ("x.png", png_bytes(), "image/png")},
        headers={"Authorization": f"Bearer {TEST_TOKEN}"},
    )
    assert response.status_code == 422


def test_score_file_too_large(tmp_path):
    client, _ = make_client(tmp_path)
    data = b"\x89PNG\r\n\x1a\n" + b"0" * (10 * 1024 * 1024 + 512)
    response = post_image(client, data=data)
    assert response.status_code == 413
    assert response.json() == {"error": "file_too_large"}


def test_score_image_too_many_pixels(tmp_path):
    client, _ = make_client(tmp_path)
    ok, buffer = cv2.imencode(".png", np.zeros((7000, 6000, 3), dtype=np.uint8))
    assert ok
    response = post_image(client, data=buffer.tobytes())
    assert response.status_code == 413
    assert response.json() == {"error": "image_too_large"}


def test_score_undecodable(tmp_path):
    client, _ = make_client(tmp_path)
    response = post_image(client, data=b"junk-bytes-not-an-image", filename="x.png")
    assert response.status_code == 415
    assert response.json() == {"error": "undecodable_image"}


def test_score_without_weights_is_503(tmp_path):
    """No detector/scorer injected, no weights on disk: refuse to score."""
    settings = make_settings(tmp_path)
    app = create_app(settings)  # weights dir does not exist
    with TestClient(app) as client:
        response = post_image(client)
    assert response.status_code == 503
    assert response.json() == {"error": "model_not_loaded"}


def test_missing_token_config_is_503(tmp_path):
    settings = make_settings(tmp_path, token="")
    app = create_app(settings, detector=FakeDetector([]), scorer=FakeScorer())
    with TestClient(app) as client:
        response = post_image(client)
    assert response.status_code == 503
    assert response.json() == {"error": "not_configured"}


def _async_post_all(app, bodies, token=TEST_TOKEN):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            jobs = [
                client.post(
                    "/v1/score",
                    files={"image": ("x.png", body, "image/png")},
                    headers={"Authorization": f"Bearer {token}"},
                )
                for body in bodies
            ]
            return await asyncio.gather(*jobs)

    return asyncio.run(run())


def test_queue_overflow_is_429(tmp_path):
    """One running + one waiting (queue_waiting=1); the third is refused."""
    settings = make_settings(tmp_path, queue_waiting=1, request_timeout_s=30.0)
    scorer = FakeScorer(scores=[0.5], delay_s=1.5)
    app = create_app(settings, detector=FakeDetector(synthetic_face_detections(1)), scorer=scorer)
    responses = _async_post_all(app, [png_bytes(seed=i) for i in range(3)])
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [200, 200, 429]
    busy = [r for r in responses if r.status_code == 429]
    assert busy[0].json() == {"error": "busy"}


def test_timeout_is_504_and_slot_held_until_work_done(tmp_path):
    """queue_waiting=0 admits exactly one work item. A request that times
    out answers 504, but its work item keeps its slot until it truly
    finishes: the next request gets 429 while it grinds, and succeeds only
    after it completes. Inference never overlaps."""
    settings = make_settings(tmp_path, queue_waiting=0, request_timeout_s=0.3)
    scorer = FakeScorer(scores=[0.5], delay_s=0.9)
    app = create_app(settings, detector=FakeDetector(synthetic_face_detections(1)), scorer=scorer)

    responses = _async_post_all(app, [png_bytes(seed=0)])
    assert responses[0].status_code == 504

    # the orphaned work item (0.9 s) is still running: slot held -> 429
    responses = _async_post_all(app, [png_bytes(seed=1)])
    assert responses[0].status_code == 429

    import time

    time.sleep(1.0)  # work item finished, slot released
    scorer.delay_s = 0.0  # the next request must fit inside the timeout
    responses = _async_post_all(app, [png_bytes(seed=2)])
    assert responses[0].status_code == 200
    assert responses[0].json()["image_p_fake"] == 0.5


def test_both_waiting_and_running_requests_time_out(tmp_path):
    settings = make_settings(tmp_path, queue_waiting=1, request_timeout_s=0.5)
    scorer = FakeScorer(scores=[0.5], delay_s=1.2)
    app = create_app(settings, detector=FakeDetector(synthetic_face_detections(1)), scorer=scorer)
    responses = _async_post_all(app, [png_bytes(seed=0), png_bytes(seed=1)])
    assert [r.status_code for r in responses] == [504, 504]


def test_timeout_then_recovery(tmp_path):
    settings = make_settings(tmp_path, queue_waiting=2, request_timeout_s=0.4)
    scorer = FakeScorer(scores=[0.5], delay_s=0.8)
    app = create_app(settings, detector=FakeDetector(synthetic_face_detections(1)), scorer=scorer)
    responses = _async_post_all(app, [png_bytes(seed=0)])
    assert responses[0].status_code == 504
    import time

    time.sleep(1.0)  # the orphaned work item finishes; its slot frees
    scorer.delay_s = 0.0  # the next request must fit inside the timeout
    responses = _async_post_all(app, [png_bytes(seed=1)])
    assert responses[0].status_code == 200
    assert responses[0].json()["image_p_fake"] == 0.5
