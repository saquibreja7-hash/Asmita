"""CPU latency benchmark: median per-face scoring time over N faces.

Measures each runtime separately on synthetic aligned crops (one face per
request shape), single-threaded, after warm-up. Prints the median and p90
in milliseconds; record the numbers in asmita/docs/research/progress.md.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gend.runtime import OnnxGenD, TorchGenD  # noqa: E402
from gend.settings import Settings  # noqa: E402
from gend.synth import synthetic_aligned_crops  # noqa: E402


def bench(scorer, crops, batch_faces: int) -> dict[str, float]:
    # warm-up
    scorer.score_crops(crops[: batch_faces])
    samples: list[float] = []
    for start in range(0, len(crops) - batch_faces + 1, batch_faces):
        batch = crops[start : start + batch_faces]
        t0 = time.perf_counter()
        scorer.score_crops(batch)
        elapsed = time.perf_counter() - t0
        samples.append(elapsed / len(batch) * 1000.0)
    ordered = sorted(samples)
    return {
        "faces": len(crops) // batch_faces * batch_faces,
        "median_ms_per_face": statistics.median(ordered),
        "p90_ms_per_face": ordered[int(len(ordered) * 0.9) - 1] if len(ordered) >= 10 else ordered[-1],
        "min_ms_per_face": ordered[0],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--faces", type=int, default=20)
    parser.add_argument("--batch-faces", type=int, default=1)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    settings = Settings.load()
    crops = synthetic_aligned_crops(max(args.faces, args.batch_faces * 2), seed=args.seed)

    print(f"gend bench: faces={args.faces} batch_faces={args.batch_faces} seed={args.seed}")
    if settings.gend_onnx_path.is_file():
        print("gend bench: loading onnx runtime...")
        for key, value in bench(OnnxGenD(settings), crops, args.batch_faces).items():
            print(f"gend bench: onnx {key}={value:.2f}" if isinstance(value, float) else f"gend bench: onnx {key}={value}")
    else:
        print("gend bench: onnx export absent, skipping onnx runtime")
    print("gend bench: loading torch runtime...")
    for key, value in bench(TorchGenD(settings), crops, args.batch_faces).items():
        print(f"gend bench: torch {key}={value:.2f}" if isinstance(value, float) else f"gend bench: torch {key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
