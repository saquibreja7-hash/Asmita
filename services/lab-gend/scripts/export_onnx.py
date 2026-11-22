"""Export GenD's forward to ONNX on a 1x3x224x224 input (dynamic batch)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gend.runtime import TorchGenD  # noqa: E402
from gend.settings import Settings  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=None, help="output onnx path (default: <weights>/gend/gend_clip_l_14.onnx)")
    args = parser.parse_args()

    settings = Settings.load()
    if settings.runtime == "onnx":
        print("gend export: GEND_RUNTIME must be 'torch' to export")
        return 1
    out = Path(args.out) if args.out else settings.gend_onnx_path
    out.parent.mkdir(parents=True, exist_ok=True)

    print("gend export: loading torch runtime...")
    torch_gend = TorchGenD(settings)
    print(f"gend export: exporting {torch_gend.model_id} forward to {out}")
    torch_gend.export_onnx(out)
    print(f"gend export: wrote {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
