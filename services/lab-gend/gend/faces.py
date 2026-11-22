"""YuNet face detection (OpenCV Zoo, MIT), 5-point landmarks for alignment.

YuNet 2023mar returns, per face, a 15-value row:
[x, y, w, h, right eye x/y, left eye x/y, nose tip x/y,
 right mouth corner x/y, left mouth corner x/y, score]
("right"/"left" are the person's: on a frontal upright face the right eye
sits on the image-left). That order is exactly GenD's alignment template
order (image-left eye, image-right eye, nose, image-left mouth corner,
image-right mouth corner), so the landmarks are passed through unmodified.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

DETECTOR_ID = "YuNet@2023mar"

# OpenCV Zoo demo parameters for the 2023mar model: fixed input shape
# (width 320, height 240), NMS 0.3, top_k 5000.
YUNET_INPUT_SIZE = (320, 240)
YUNET_NMS_THRESHOLD = 0.3
YUNET_TOP_K = 5000


@dataclass(frozen=True)
class FaceDetection:
    box: tuple[int, int, int, int]  # x, y, w, h in pixels
    landmarks: np.ndarray  # (5, 2) float32, GenD template order
    score: float


class YuNetFaceDetector:
    """Detects faces and returns the largest ones, largest first."""

    def __init__(
        self,
        model_path: str | Path,
        score_threshold: float = 0.4,
        min_face_px: int = 48,
        max_faces: int = 5,
    ):
        self._path = str(model_path)
        self._score_threshold = float(score_threshold)
        self._min_face_px = int(min_face_px)
        self._max_faces = int(max_faces)
        self._detector = cv2.FaceDetectorYN.create(
            self._path,
            "",
            YUNET_INPUT_SIZE,
            self._score_threshold,
            YUNET_NMS_THRESHOLD,
            YUNET_TOP_K,
        )

    def detect(self, bgr: np.ndarray) -> list[FaceDetection]:
        self._detector.setInputSize((bgr.shape[1], bgr.shape[0]))
        _, faces = self._detector.detect(bgr)
        if faces is None:
            return []
        out: list[FaceDetection] = []
        for row in faces:
            score = float(row[14])
            if score < self._score_threshold:
                continue
            x, y, w, h = (float(v) for v in row[0:4])
            if w < self._min_face_px or h < self._min_face_px:
                continue
            out.append(
                FaceDetection(
                    box=(int(round(x)), int(round(y)), int(round(w)), int(round(h))),
                    landmarks=np.asarray(row[4:14], dtype=np.float32).reshape(5, 2),
                    score=score,
                )
            )
        out.sort(key=lambda d: d.box[2] * d.box[3], reverse=True)
        return out[: self._max_faces]
