"""The WP112 ONNX acceptance test.

50 synthetic aligned crops, two comparisons:
  (A) the exported graph vs PyTorch on identical input tensors —
      acceptance gate: max |p_fake difference| < 1e-3 and the same
      decision at 0.5 on all 50;
  (B) the full service paths (each runtime's own preprocessing) —
      reported for the record with the same decision criterion.

Prints the numbers and exits 0 only if the gate passes.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gend.runtime import OnnxGenD, TorchGenD  # noqa: E402
from gend.settings import Settings  # noqa: E402
from gend.synth import synthetic_aligned_crops  # noqa: E402

N_CROPS = 50
GATE = 1e-3


def _decisions(p_fakes: list[float]) -> list[bool]:
    return [p >= 0.5 for p in p_fakes]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--crops", type=int, default=N_CROPS)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    settings = Settings.load()
    crops = synthetic_aligned_crops(args.crops, seed=args.seed)

    print("gend validate: loading torch runtime...")
    torch_gend = TorchGenD(settings)
    print("gend validate: loading onnx runtime...")
    onnx_gend = OnnxGenD(settings)

    import numpy as np
    import torch

    # (A) same tensors
    tensors = torch.stack([torch_gend._preprocess(crop) for crop in crops])
    torch_a = torch_gend.score_tensors(tensors)
    onnx_a = onnx_gend.score_tensors(tensors.numpy())
    max_a = max(abs(a - b) for a, b in zip(torch_a, onnx_a))
    same_decisions_a = _decisions(torch_a) == _decisions(onnx_a)

    # (B) full service paths
    torch_b = torch_gend.score_crops(crops)
    onnx_b = onnx_gend.score_crops(crops)
    max_b = max(abs(a - b) for a, b in zip(torch_b, onnx_b))
    same_decisions_b = _decisions(torch_b) == _decisions(onnx_b)

    print(f"gend validate: crops={args.crops} seed={args.seed}")
    print(f"gend validate: (A) same tensors   max_abs_diff={max_a:.3e} decisions_equal={same_decisions_a}")
    print(f"gend validate: (B) full pipelines max_abs_diff={max_b:.3e} decisions_equal={same_decisions_b}")
    print(
        "gend validate: torch p_fake range "
        f"[{min(torch_b):.4f}, {max(torch_b):.4f}] onnx range [{min(onnx_b):.4f}, {max(onnx_b):.4f}]"
    )

    if max_a < GATE and same_decisions_a:
        print(f"gend validate: PASS (gate max_abs_diff < {GATE}, identical decisions at 0.5)")
        return 0
    print("gend validate: FAIL — the ONNX export is not accepted")
    return 1


if __name__ == "__main__":
    sys.exit(main())
