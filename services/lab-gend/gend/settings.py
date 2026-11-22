"""Environment-driven settings, validated at startup.

Every knob has a fixed default from the WP112 spec; an invalid value stops
the process before it can serve a request, and the error names only the
variable name (never a value).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent

DEFAULT_WEIGHTS_DIR = _PACKAGE_DIR.parent / "weights"


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"invalid integer in {name}") from None


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        raise ValueError(f"invalid number in {name}") from None


def _str(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    """All runtime knobs. See README.md for the meaning of each."""

    token: str
    weights_dir: Path
    runtime: str
    host: str
    port: int
    max_file_bytes: int
    max_pixels: int
    min_face_px: int
    face_score_threshold: float
    max_faces: int
    align_scale: float
    queue_waiting: int
    request_timeout_s: float

    @property
    def yunet_path(self) -> Path:
        return self.weights_dir / "yunet" / "face_detection_yunet_2023mar.onnx"

    @property
    def gend_dir(self) -> Path:
        return self.weights_dir / "gend"

    @property
    def clip_base_dir(self) -> Path:
        return self.weights_dir / "clip-base"

    @property
    def gend_onnx_path(self) -> Path:
        return self.gend_dir / "gend_clip_l_14.onnx"

    @classmethod
    def load(cls) -> "Settings":
        settings = cls(
            token=_str("GEND_TOKEN", ""),
            weights_dir=Path(_str("GEND_WEIGHTS_DIR", str(DEFAULT_WEIGHTS_DIR))),
            runtime=_str("GEND_RUNTIME", "torch"),
            host=_str("GEND_HOST", "0.0.0.0"),
            port=_int("GEND_PORT", 8080),
            max_file_bytes=_int("GEND_MAX_FILE_BYTES", 10 * 1024 * 1024),
            max_pixels=_int("GEND_MAX_PIXELS", 40_000_000),
            min_face_px=_int("GEND_MIN_FACE_PX", 48),
            face_score_threshold=_float("GEND_FACE_SCORE_THRESHOLD", 0.4),
            max_faces=_int("GEND_MAX_FACES", 5),
            align_scale=_float("GEND_ALIGN_SCALE", 1.3),
            queue_waiting=_int("GEND_QUEUE_WAITING", 4),
            request_timeout_s=_float("GEND_REQUEST_TIMEOUT_S", 20.0),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.runtime not in ("torch", "onnx"):
            raise ValueError("GEND_RUNTIME must be 'torch' or 'onnx'")
        if self.max_file_bytes <= 0:
            raise ValueError("GEND_MAX_FILE_BYTES must be positive")
        if self.max_pixels <= 0:
            raise ValueError("GEND_MAX_PIXELS must be positive")
        if self.min_face_px <= 0:
            raise ValueError("GEND_MIN_FACE_PX must be positive")
        if not 0.0 < self.face_score_threshold < 1.0:
            raise ValueError("GEND_FACE_SCORE_THRESHOLD must be between 0 and 1")
        if self.max_faces < 1:
            raise ValueError("GEND_MAX_FACES must be at least 1")
        if self.align_scale <= 0:
            raise ValueError("GEND_ALIGN_SCALE must be positive")
        if self.queue_waiting < 0:
            raise ValueError("GEND_QUEUE_WAITING must be 0 or more")
        if self.request_timeout_s <= 0:
            raise ValueError("GEND_REQUEST_TIMEOUT_S must be positive")
        if self.port <= 0 or self.port > 65535:
            raise ValueError("GEND_PORT out of range")
