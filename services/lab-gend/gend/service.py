"""FastAPI service: POST /v1/score, GET /healthz.

Safety properties, each enforced by a test:
- images live in memory only: multipart bodies are kept in RAM (the
  Starlette spool threshold is raised above the accepted size, and the
  body-size middleware rejects anything larger before parsing), and the
  pipeline never writes or logs image data;
- one inference at a time, at most `queue_waiting` requests waiting, more
  are refused with 429;
- every request, queued or not, is bounded by `request_timeout_s`.

Run with `python -m gend.service` (single worker process).
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import threading
import time
from typing import Annotated

from fastapi import FastAPI, File, UploadFile
from starlette.formparsers import MultiPartParser
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import runtime as runtime_mod
from .faces import YuNetFaceDetector
from .pipeline import (
    DecodeError,
    FileTooLargeError,
    ImageTooLargeError,
    ModelNotLoadedError,
    Pipeline,
)
from .settings import Settings

log = logging.getLogger("gend.service")

SCORE_PATH = "/v1/score"
_HEALTHZ = {"status": "ok"}
# Multipart framing around a 10 MB file costs a few hundred bytes;
# the middleware cap is the file cap plus this slack.
_BODY_SLACK = 64 * 1024


class _QueueFull(Exception):
    pass


class InferenceGate:
    """One inference at a time; at most `waiting` extra requests admitted.

    A timed-out request still occupies its slot until its work item really
    finishes, so inference never overlaps and the queue cannot grow past
    waiting + running even under timeouts.
    """

    def __init__(self, waiting: int):
        self._max_active = waiting + 1
        self._active = 0
        self._counter_lock = threading.Lock()
        self._pool = ThreadPoolExecutorSingle()

    async def run(self, fn, timeout_s: float, *args):
        with self._counter_lock:
            if self._active >= self._max_active:
                raise _QueueFull()
            self._active += 1
        future = self._pool.submit(fn, *args)
        loop = asyncio.get_running_loop()

        def _release(_fut):
            try:
                loop.call_soon_threadsafe(self._release_slot)
            except RuntimeError:  # event loop already gone (shutdown)
                self._release_slot()

        future.add_done_callback(_release)
        try:
            return await asyncio.wait_for(asyncio.wrap_future(future), timeout_s)
        except (asyncio.TimeoutError, TimeoutError):
            raise TimeoutError() from None

    def _release_slot(self) -> None:
        with self._counter_lock:
            self._active = max(0, self._active - 1)


class ThreadPoolExecutorSingle:
    """A single-worker executor, created lazily so tests need no threads."""

    def __init__(self):
        self._executor = None
        self._lock = threading.Lock()

    def submit(self, fn, *args):
        with self._lock:
            if self._executor is None:
                from concurrent.futures import ThreadPoolExecutor

                self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gend-inference")
        return self._executor.submit(fn, *args)


def _json(status: int, payload: dict) -> JSONResponse:
    return JSONResponse(payload, status_code=status, headers={"Cache-Control": "no-store"})


async def _send_json(send, status: int, payload: dict) -> None:
    import json as _jsonlib

    body = _jsonlib.dumps(payload).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")],
        }
    )
    await send({"type": "http.response.body", "body": body})


class RequestGuard:
    """Auth and body-size cap, checked before any multipart parsing."""

    def __init__(self, app, token: str | None, max_body_bytes: int):
        self.app = app
        self._token = token.encode("utf-8") if token else None
        self._max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path != SCORE_PATH:
            await self.app(scope, receive, send)
            return

        if self._token is None:
            await _send_json(send, 503, {"error": "not_configured"})
            return

        auth = None
        for key, value in scope.get("headers", []):
            if key == b"authorization":
                auth = value
                break
        if auth is None or not _bearer_matches(auth, self._token):
            await _send_json(send, 401, {"error": "unauthorized"})
            return

        if scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        # Content-Length short-circuit, then a streaming cap: nothing
        # larger than the cap is ever buffered or parsed.
        for key, value in scope.get("headers", []):
            if key == b"content-length":
                try:
                    if int(value) > self._max_body_bytes:
                        await _send_json(send, 413, {"error": "file_too_large"})
                        return
                except ValueError:
                    pass
                break

        body = bytearray()
        exceeded = False
        while True:
            message = await receive()
            if message["type"] == "http.request":
                body += message.get("body", b"")
                if len(body) > self._max_body_bytes:
                    exceeded = True
                    break
                if not message.get("more_body"):
                    break
            elif message["type"] == "http.disconnect":
                return
        if exceeded:
            await _send_json(send, 413, {"error": "file_too_large"})
            return

        payload = bytes(body)
        del body

        async def replay_receive():
            return {"type": "http.request", "body": payload, "more_body": False}

        await self.app(scope, replay_receive, send)


def _bearer_matches(header: bytes, token: bytes) -> bool:
    prefix = b"Bearer "
    if not header.startswith(prefix):
        return False
    return hmac.compare_digest(header[len(prefix) :], token)


def create_app(
    settings: Settings,
    *,
    detector=None,
    scorer=None,
) -> FastAPI:
    """Build the app with everything loaded and attached.

    Tests inject a fake detector/scorer; production passes weights via
    settings and they load here, once, before the server binds (uvicorn is
    handed the finished app), so a broken or missing weight file stops
    startup instead of poisoning requests.
    """
    app = FastAPI(title="Asmita Lab GenD service", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings

    if detector is not None:
        app.state.detector = detector
    elif settings.yunet_path.is_file():
        app.state.detector = YuNetFaceDetector(
            settings.yunet_path,
            score_threshold=settings.face_score_threshold,
            min_face_px=settings.min_face_px,
            max_faces=settings.max_faces,
        )
    else:
        app.state.detector = None
        log.warning("YuNet weights not found; scoring disabled")

    if scorer is not None:
        app.state.scorer = scorer
    elif runtime_mod.scorer_available(settings):
        app.state.scorer = runtime_mod.load_scorer(settings)
    else:
        app.state.scorer = None
        log.warning("GenD weights not found under the configured dir; scoring disabled")
    app.state.gate = InferenceGate(settings.queue_waiting)

    # Keep every accepted upload in RAM, never a spooled temp file on disk:
    # the body-size middleware already rejects anything above
    # max_file_bytes (+ framing slack), so no accepted part can reach this
    # spool threshold and roll over.
    MultiPartParser.spool_max_size = settings.max_file_bytes + _BODY_SLACK

    app.add_middleware(RequestGuard, token=settings.token or None, max_body_bytes=settings.max_file_bytes + _BODY_SLACK)

    @app.get("/healthz")
    async def healthz():
        return _HEALTHZ

    @app.post(SCORE_PATH)
    async def score(request: Request, image: Annotated[UploadFile, File()]):
        started = time.perf_counter()
        data = await image.read()
        gate: InferenceGate = request.app.state.gate
        try:
            pipeline = Pipeline(
                request.app.state.detector,
                request.app.state.scorer,
                max_file_bytes=settings.max_file_bytes,
                max_pixels=settings.max_pixels,
                align_scale=settings.align_scale,
            )
            outcome = await gate.run(pipeline.score_image, settings.request_timeout_s, data)
        except _QueueFull:
            log.info("score rejected=busy")
            return _json(429, {"error": "busy"})
        except TimeoutError:
            log.info("score rejected=timeout elapsed_ms=%d", _ms_since(started))
            return _json(504, {"error": "timeout"})
        except FileTooLargeError:
            log.info("score rejected=file_too_large")
            return _json(413, {"error": "file_too_large"})
        except ImageTooLargeError:
            log.info("score rejected=image_too_large")
            return _json(413, {"error": "image_too_large"})
        except DecodeError:
            log.info("score rejected=undecodable_image")
            return _json(415, {"error": "undecodable_image"})
        except ModelNotLoadedError:
            log.info("score rejected=model_not_loaded")
            return _json(503, {"error": "model_not_loaded"})

        log.info(
            "score status=%s faces=%d decode_ms=%d detect_ms=%d score_ms=%d total_ms=%d",
            outcome.status,
            len(outcome.faces),
            outcome.timings_ms["decode"],
            outcome.timings_ms["detect"],
            outcome.timings_ms["score"],
            outcome.timings_ms["total"],
        )
        return _json(200, outcome.to_response())

    return app


def _ms_since(start: float) -> int:
    return int(round((time.perf_counter() - start) * 1000))


def main() -> None:
    """Run the service: one process, one inference worker."""
    import logging as _logging

    import uvicorn

    _logging.basicConfig(level=_logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.load()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, workers=1, log_level="info")


if __name__ == "__main__":
    main()
