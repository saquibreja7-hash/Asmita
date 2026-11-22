"""Minimal vendored GenD model code.

Source: https://github.com/yermandy/GenD, file src/hf/modeling_gend.py,
at commit 387a42266dd385fbe8f7626c5d3aa03eea3bfaab. Licence: MIT
(Copyright (c) 2025 Andy) — see LICENSE-GenD.txt and THIRD_PARTY.md.

Kept: LinearProbe, CLIPEncoder, GenDConfig, GenD — the CLIP ViT-L/14
variant this service uses (yermandy/GenD_CLIP_L_14, config head
"LinearNorm"). Removed: DINOEncoder and PerceptionEncoder (other backbones
we do not ship) and the fallback to a different base model when the
processor is missing (we ship the pinned base revision instead — see
THIRD_PARTY.md).

Deliberate deviation, recorded here: loading never reaches the network.
`GenD.from_local(gend_dir, clip_base_dir)` pins the CLIP base weights to a
local directory downloaded at build time, via the extra config attribute
`clip_base`; without it the code is the original's. The Hugging Face
checkpoint ships a `modeling_gend.py` behind `auto_map` that would need
`trust_remote_code=True` — executing model code straight from a remote
repository. Vendoring the module and loading the pinned weights from local
files avoids that; no remote code is ever executed.
"""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from transformers import PretrainedConfig, PreTrainedModel


class LinearProbe(nn.Module):
    def __init__(self, input_dim, num_classes, normalize_inputs=False):
        super().__init__()
        self.linear = nn.Linear(input_dim, num_classes)
        self.normalize_inputs = normalize_inputs

    def forward(self, x: torch.Tensor, **kwargs):
        if self.normalize_inputs:
            x = F.normalize(x, p=2, dim=1)

        return self.linear(x)


class CLIPEncoder(nn.Module):
    def __init__(self, model_name="openai/clip-vit-large-patch14"):
        super().__init__()

        from transformers import CLIPModel, CLIPProcessor

        self._preprocess = CLIPProcessor.from_pretrained(model_name)

        clip: CLIPModel = CLIPModel.from_pretrained(model_name)

        # take vision model from CLIP, maps image to vision_embed_dim
        self.vision_model = clip.vision_model

        self.model_name = model_name

        self.features_dim = self.vision_model.config.hidden_size

        # take visual_projection, maps vision_embed_dim to projection_dim
        self.visual_projection = clip.visual_projection

    def preprocess(self, image: Image) -> torch.Tensor:
        return self._preprocess(images=image, return_tensors="pt")["pixel_values"][0]

    def forward(self, preprocessed_images: torch.Tensor) -> torch.Tensor:
        return self.vision_model(preprocessed_images).pooler_output

    def get_features_dim(self):
        return self.features_dim


class GenDConfig(PretrainedConfig):
    model_type = "GenD"

    def __init__(self, backbone: str = "openai/clip-vit-large-patch14", head: str = "linear", **kwargs):
        self.clip_base = None
        super().__init__(**kwargs)
        self.backbone = backbone
        self.head = head


class GenD(PreTrainedModel):
    config_class = GenDConfig

    def __init__(self, config):
        super().__init__(config)

        self.head = config.head
        self.backbone = config.backbone
        self.config = config

        self._init_feature_extractor()
        self._init_head()

    @classmethod
    def from_local(cls, gend_dir: str | Path, clip_base_dir: str | Path) -> "GenD":
        """Load the pinned checkpoint without touching the network."""
        config = cls.config_class.from_pretrained(str(gend_dir))
        config.clip_base = str(clip_base_dir)
        model = cls.from_pretrained(str(gend_dir), config=config)
        model.eval()
        return model

    def _init_feature_extractor(self):
        backbone = self.config.clip_base or self.backbone

        if "clip" in backbone.lower():
            self.feature_extractor = CLIPEncoder(backbone)
        else:
            raise ValueError(f"Unsupported backbone for this service: {self.backbone}")

    def _init_head(self):
        features_dim = self.feature_extractor.get_features_dim()

        match self.head:
            case "linear":
                self.model = LinearProbe(features_dim, 2)

            case "LinearNorm":
                self.model = LinearProbe(features_dim, 2, True)

            case _:
                raise ValueError(f"Unknown head: {self.head}")

    def forward(self, inputs: torch.Tensor):
        features = self.feature_extractor(inputs)
        outputs = self.model.forward(features)
        return outputs
