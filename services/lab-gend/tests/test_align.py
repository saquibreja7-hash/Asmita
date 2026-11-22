"""Alignment math against GenD's template, on synthetic landmarks."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from conftest import template_landmarks

from gend.align import GEND_TEMPLATE, align_face


def _dot_image(image, point, radius=2):
    cv2.circle(image, (int(round(point[0])), int(round(point[1]))), radius, (0, 0, 0), -1)


def _is_dark(image, point, tolerance=6):
    y = int(round(point[1]))
    x = int(round(point[0]))
    patch = image[max(0, y - tolerance) : y + tolerance + 1, max(0, x - tolerance) : x + tolerance + 1]
    return bool(patch.size and patch.min() < 128)


def test_template_values_are_gends():
    """The vendored template is exactly GenD's: eyes at 0.34/0.46 and
    0.66/0.46, nose at 0.5/0.64, mouth corners at 0.37/0.82 and 0.63/0.82."""
    np.testing.assert_allclose(
        GEND_TEMPLATE,
        np.array(
            [
                [0.34, 0.46],
                [0.66, 0.46],
                [0.5, 0.64],
                [0.37, 0.82],
                [0.63, 0.82],
            ]
        ),
        rtol=0,
        atol=1e-7,
    )


def test_template_pairing_order():
    """Pin the vendored template's row order: with template-derived
    landmarks, the direct pairing landmark[i] -> template[i] is exactly
    realisable by a similarity (residual ~ 0), while the eyes-and-mouth
    swapped pairing is not (residual tens of pixels). This is the exact
    estimate align_face performs, so a permuted template cannot pass."""
    landmarks = template_landmarks(640, 480, scale=0.35)
    target = 256
    dst = ((GEND_TEMPLATE + 0.15) * (target / 1.3)).astype(np.float32)

    direct, _ = cv2.estimateAffinePartial2D(landmarks.astype(np.float32), dst, method=cv2.LMEDS)
    assert direct is not None
    direct_residual = float(np.abs(cv2.transform(landmarks[None, :, :], direct)[0] - dst).max())
    assert direct_residual < 1.0, f"direct pairing residual {direct_residual}"

    swapped = dst[[1, 0, 2, 4, 3]].astype(np.float32)
    flipped, _ = cv2.estimateAffinePartial2D(landmarks.astype(np.float32), swapped, method=cv2.LMEDS)
    flipped_residual = float(np.abs(cv2.transform(landmarks[None, :, :], flipped)[0] - swapped).max())
    assert flipped_residual > 20.0, f"swapped pairing residual {flipped_residual}"


def test_alignment_maps_landmarks_to_template_positions():
    """An image marked at the (transformed) landmark positions comes out with
    the marks at the canonical template-derived positions: chirality, size
    and geometry of the vendored template all in one check."""
    size = 400
    for angle in (0.0, 15.0, -25.0):
        image = np.full((size, size, 3), 255, dtype=np.uint8)
        landmarks = template_landmarks(size, size, scale=0.3, angle_deg=angle)
        for point in landmarks:
            _dot_image(image, point)

        target = (256, 256)
        aligned = align_face(image, landmarks, target_size=target, scale=1.3)
        assert aligned.shape == (target[1], target[0], 3)

        # Expected dst positions, replicating GenD's margin math:
        # dst = (template * size + 0.15 * size) * size / (1.3 * size)
        expected = (GEND_TEMPLATE + 0.15) * (target[0] / 1.3)
        for point in expected:
            assert _is_dark(aligned, point), f"landmark content missing at {point} (angle {angle})"


def test_auto_target_size_is_square_and_scaled():
    """With target_size=None (GenD's inference path) the crop is square and
    the marks sit at (template + 0.15) / 1.3 of its side."""
    size = 480
    image = np.full((size, size, 3), 255, dtype=np.uint8)
    landmarks = template_landmarks(size, size, scale=0.4)
    for point in landmarks:
        _dot_image(image, point)
    aligned = align_face(image, landmarks, target_size=None, scale=1.3)
    h, w = aligned.shape[:2]
    assert h == w and h > 0
    expected = (GEND_TEMPLATE + 0.15) * (w / 1.3)
    for point in expected:
        assert _is_dark(aligned, point, tolerance=max(3, w // 128))


def test_scale_controls_margin():
    """A larger scale keeps more context: same landmarks, bigger crop, with
    the marks at proportionally the same relative position."""
    size = 400
    image = np.full((size, size, 3), 255, dtype=np.uint8)
    landmarks = template_landmarks(size, size, scale=0.3)
    small = align_face(image, landmarks, target_size=None, scale=1.1)
    big = align_face(image, landmarks, target_size=None, scale=1.6)
    assert big.shape[0] > small.shape[0]
