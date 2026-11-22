"""Download the pinned weights and verify every file's sha256.

Run at image build time (Dockerfile) or locally into services/lab-gend/weights.
Weights are never committed. Every pin lives in gend/weights_manifest.json:
Hugging Face files are fetched at a pinned commit revision; YuNet comes
from the OpenCV Zoo at a pinned commit. A manifest entry whose sha256 is
"TO_FILL" is reported (bootstrap for a new pin) and fails the run, so an
unfrozen pin can never silently pass a build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import urllib.request
from pathlib import Path

MANIFEST_PATH = Path(__file__).resolve().parent.parent / "gend" / "weights_manifest.json"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_hf(repo: str, revision: str, files: dict, out_dir: Path) -> list[str]:
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        raise SystemExit("huggingface_hub is required (pip install '.[torch]')") from None
    problems: list[str] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, expected in files.items():
        target = out_dir / name
        if target.is_file() and sha256_of(target) == expected["sha256"]:
            print(f"gend fetch: {repo}/{name} already present and verified")
            continue
        print(f"gend fetch: {repo}@{revision[:12]} {name} ({expected['bytes']} bytes)")
        downloaded = Path(hf_hub_download(repo_id=repo, filename=name, revision=revision, local_dir=str(out_dir)))
        problems += verify(downloaded, target, expected, repo, name)
    return problems


def fetch_url(url: str, files: dict, out_dir: Path) -> list[str]:
    problems: list[str] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, expected in files.items():
        target = out_dir / name
        if target.is_file() and sha256_of(target) == expected["sha256"]:
            print(f"gend fetch: {name} already present and verified")
            continue
        print(f"gend fetch: {url.split('/')[-1]} ({expected['bytes']} bytes)")
        with tempfile.NamedTemporaryFile(dir=out_dir, delete=False, suffix=".part") as tmp:
            with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 - pinned https URL
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    tmp.write(chunk)
            tmp_path = Path(tmp.name)
        tmp_path.replace(target)
        problems += verify(target, target, expected, "opencv_zoo", name)
    return problems


def verify(downloaded: Path, target: Path, expected: dict, repo: str, name: str) -> list[str]:
    if downloaded != target:
        downloaded.replace(target)
    actual = sha256_of(target)
    size = target.stat().st_size
    if expected["sha256"] == "TO_FILL":
        print(f"gend fetch: UNFROZEN PIN {repo}/{name}: sha256={actual} bytes={size}")
        print("gend fetch: freeze it in gend/weights_manifest.json")
        return [f"unfrozen pin {repo}/{name}"]
    if actual != expected["sha256"] or size != expected["bytes"]:
        print(f"gend fetch: CHECKSUM MISMATCH {repo}/{name}: got sha256={actual} bytes={size}")
        return [f"checksum mismatch {repo}/{name}"]
    print(f"gend fetch: verified {repo}/{name}")
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "weights"))
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text())
    out_root = Path(args.out)
    problems: list[str] = []

    problems += fetch_hf(
        manifest["gend"]["repo"], manifest["gend"]["revision"], manifest["gend"]["files"], out_root / "gend"
    )
    problems += fetch_hf(
        manifest["clip_base"]["repo"], manifest["clip_base"]["revision"], manifest["clip_base"]["files"], out_root / "clip-base"
    )
    problems += fetch_url(manifest["yunet"]["url"], manifest["yunet"]["files"], out_root / "yunet")

    if problems:
        print("gend fetch: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("gend fetch: all weights present and verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
