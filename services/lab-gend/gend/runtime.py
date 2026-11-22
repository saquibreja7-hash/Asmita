"""Model runtimes: the reference PyTorch path and the optional ONNX path.

Both expose the same tiny interface used by the pipeline:
`score_crops(list[PIL.Image]) -> list[float]` (p_fake per crop, order kept)
and a `model_id` string.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from .settings import Settings

_PACKAGE_DIR = Path(__file__).resolve().parent


def model_id() -> str:
    """The identity string served in every response, from the pinned manifest."""
    manifest = json.loads((_PACKAGE_DIR / "weights_manifest.json").read_text())
    return f"GenD_CLIP_L_14@{manifest['gend']['revision']}"


class FaceScorer(Protocol):
    model_id: str

    def score_crops(self, crops: list[Image.Image]) -> list[float]: ...


class TorchGenD:
    """The reference runtime: vendored GenD + HF CLIP processor, CPU."""

    def __init__(self, settings: Settings):
        import torch

        from .modeling import GenD

        self.model_id = model_id()
        self._torch = torch
        self._model = GenD.from_local(settings.gend_dir, settings.clip_base_dir)
        self._model.eval()
        self._preprocess = self._model.feature_extractor.preprocess

    def score_crops(self, crops: list[Image.Image]) -> list[float]:
        if not crops:
            return []
        with self._torch.no_grad():
            batch = self._torch.stack([self._preprocess(crop) for crop in crops])
            logits = self._model(batch)
            probs = logits.softmax(dim=-1)
            return [float(p) for p in probs[:, 1]]

    def score_tensors(self, batch) -> list[float]:
        """Score an already-preprocessed (N, 3, 224, 224) tensor."""
        with self._torch.no_grad():
            logits = self._model(batch)
            probs = logits.softmax(dim=-1)
            return [float(p) for p in probs[:, 1]]

    def export_onnx(self, out_path: Path, opset: int = 17) -> None:
        """Export GenD's forward on a 1x3x224x224 input (dynamic batch)."""
        import torch

        assert isinstance(self._model, torch.nn.Module)
        dummy = torch.zeros((1, 3, 224, 224), dtype=torch.float32)
        torch.onnx.export(
            self._model,
            (dummy,),
            str(out_path),
            input_names=["pixel_values"],
            output_names=["logits"],
            dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
            opset_version=opset,
            dynamo=False,
        )


class OnnxGenD:
    """The optional runtime: exported graph + onnxruntime CPU, no torch."""

    def __init__(self, settings: Settings):
        import onnxruntime as ort

        from .preprocess import clip_preprocess_224, softmax

        self.model_id = model_id()
        self._preprocess = clip_preprocess_224
        self._softmax = softmax
        self._session = ort.InferenceSession(
            str(settings.gend_onnx_path),
            sess_options=ort.SessionOptions(),
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name

    def score_crops(self, crops: list[Image.Image]) -> list[float]:
        if not crops:
            return []
        batch = np.ascontiguousarray(np.stack([self._preprocess(crop) for crop in crops]), dtype=np.float32)
        logits = self._session.run(None, {self._input_name: batch})[0]
        probs = self._softmax(logits)
        return [float(p) for p in probs[:, 1]]

    def score_tensors(self, batch) -> list[float]:
        """Score an already-preprocessed (N, 3, 224, 224) float32 array."""
        logits = self._session.run(None, {self._input_name: np.ascontiguousarray(batch, dtype=np.float32)})[0]
        probs = self._softmax(logits)
        return [float(p) for p in probs[:, 1]]


def load_scorer(settings: Settings) -> FaceScorer:
    if settings.runtime == "onnx":
        if not settings.gend_onnx_path.is_file():
            raise FileNotFoundError("gend onnx export missing")
        return OnnxGenD(settings)
    return TorchGenD(settings)


def scorer_available(settings: Settings) -> bool:
    if settings.runtime == "onnx":
        return settings.gend_onnx_path.is_file()
    return (settings.gend_dir / "model.safetensors").is_file() and (settings.gend_dir / "config.json").is_file()
