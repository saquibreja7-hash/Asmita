"""The scoring pipeline: decode -> YuNet -> align -> GenD -> scores.

Runs entirely in memory: the image bytes are decoded to one numpy array,
faces are detected, up to 5 largest crops are aligned and scored, and every
intermediate is dropped when the request ends. Nothing is written to disk
and nothing about the image is logged — the caller logs status, face count
and timings only.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from .align import align_face
from .faces import DETECTOR_ID, FaceDetection
from .runtime import FaceScorer, model_id


class DecodeError(Exception):
    """Bytes are not a decodable JPEG/PNG/WebP image."""


class FileTooLargeError(Exception):
    """The upload exceeds the byte cap."""


class ImageTooLargeError(Exception):
    """The decoded image exceeds the pixel cap."""


class ModelNotLoadedError(Exception):
    """Detector or scorer weights are not available on this instance."""


@dataclass(frozen=True)
class FaceScore:
    box: tuple[int, int, int, int]
    p_fake: float


@dataclass(frozen=True)
class ScoreOutcome:
    model: str
    detector: str
    faces: list[FaceScore]
    image_p_fake: float | None
    status: str
    timings_ms: dict[str, int]

    def to_response(self) -> dict:
        return {
            "model": self.model,
            "detector": self.detector,
            "faces": [{"box": list(f.box), "p_fake": f.p_fake} for f in self.faces],
            "image_p_fake": self.image_p_fake,
            "status": self.status,
            "timings_ms": dict(self.timings_ms),
        }


def decode_image(data: bytes, max_file_bytes: int, max_pixels: int) -> np.ndarray:
    """Bytes -> BGR image, in memory. Raises on size or format violations."""
    if len(data) > max_file_bytes:
        raise FileTooLargeError()
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = (probe.format or "").upper()
            width, height = probe.size
    except Exception as exc:
        raise DecodeError() from exc
    if fmt not in ("JPEG", "PNG", "WEBP"):
        raise DecodeError()
    if width * height > max_pixels:
        raise ImageTooLargeError()
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise DecodeError()
    if image.shape[0] * image.shape[1] > max_pixels:
        raise ImageTooLargeError()
    return image


class Pipeline:
    def __init__(
        self,
        detector,
        scorer: FaceScorer,
        *,
        max_file_bytes: int,
        max_pixels: int,
        align_scale: float,
    ):
        if detector is None or scorer is None:
            raise ModelNotLoadedError()
        self._detector = detector
        self._scorer = scorer
        self._max_file_bytes = max_file_bytes
        self._max_pixels = max_pixels
        self._align_scale = align_scale

    def score_image(self, data: bytes) -> ScoreOutcome:
        started = time.perf_counter()
        image = decode_image(data, self._max_file_bytes, self._max_pixels)
        decode_ms = _ms_since(started)

        detect_started = time.perf_counter()
        detections: list[FaceDetection] = self._detector.detect(image)
        score_started = time.perf_counter()

        # Per the WP112 spec: up to 5 largest faces (the detector returns
        # them largest-first), each aligned with GenD's template at scale
        # 1.3 (the size GenD's own inference path computes), then the model.
        if detections:
            crops = [
                Image.fromarray(
                    cv2.cvtColor(
                        align_face(image, d.landmarks, target_size=None, scale=self._align_scale),
                        cv2.COLOR_BGR2RGB,
                    )
                )
                for d in detections
            ]
            p_fakes = self._scorer.score_crops(crops)
        else:
            p_fakes = []

        faces = [FaceScore(box=d.box, p_fake=float(p)) for d, p in zip(detections, p_fakes)]
        # One swapped face is enough to matter, so the image score is the
        # maximum over faces, never an average.
        image_p_fake = max((f.p_fake for f in faces), default=None)
        total_ms = _ms_since(started)

        return ScoreOutcome(
            model=self._scorer.model_id,
            detector=DETECTOR_ID,
            faces=faces,
            image_p_fake=image_p_fake,
            status="ok" if faces else "no_face",
            timings_ms={
                "decode": decode_ms,
                "detect": _ms_between(detect_started, score_started),
                "score": _ms_between(score_started, time.perf_counter()),
                "total": total_ms,
            },
        )


def _ms_between(start: float, end: float) -> int:
    return int(round((end - start) * 1000))


def _ms_since(start: float) -> int:
    return _ms_between(start, time.perf_counter())
