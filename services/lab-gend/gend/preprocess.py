"""CLIP 224 preprocessing without torch, for the ONNX runtime.

Mirrors the HF CLIPImageProcessor of openai/clip-vit-large-patch14
(shortest edge resized to 224 with BICUBIC, center crop 224, rescale 1/255,
normalise — this base model's preprocessor config is the legacy
`size: 224` + `resample: 3` form, which transformers reads as
shortest-edge) using Pillow + numpy only, so the ONNX runtime mode drops
torch. A with-weights test asserts exact parity against the real HF
processor.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

CLIP_SHORT_EDGE = 224
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


def _resize_size(width: int, height: int) -> tuple[int, int]:
    """Shortest-edge resize target, as transformers computes it: (w, h)."""
    short, long = (width, height) if width <= height else (height, width)
    new_short = CLIP_SHORT_EDGE
    new_long = int(new_short * long / short)
    if width <= height:
        return new_short, new_long
    return new_long, new_short


def clip_preprocess_224(rgb: Image.Image | np.ndarray) -> np.ndarray:
    """RGB image -> float32 (3, 224, 224), CLIP-normalised."""
    if isinstance(rgb, np.ndarray):
        rgb = Image.fromarray(rgb)
    rgb = rgb.convert("RGB")
    new_w, new_h = _resize_size(rgb.width, rgb.height)
    img = rgb.resize((new_w, new_h), resample=Image.Resampling.BICUBIC)
    left = (new_w - CLIP_SHORT_EDGE) // 2
    top = (new_h - CLIP_SHORT_EDGE) // 2
    img = img.crop((left, top, left + CLIP_SHORT_EDGE, top + CLIP_SHORT_EDGE))
    pixels = np.asarray(img, dtype=np.float32) / 255.0
    pixels = (pixels - CLIP_MEAN) / CLIP_STD
    return np.ascontiguousarray(pixels.transpose(2, 0, 1), dtype=np.float32)


def softmax(x: np.ndarray) -> np.ndarray:
    shifted = x - x.max(axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=-1, keepdims=True)
