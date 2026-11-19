#!/usr/bin/env python3
"""WP36 reference run: hash the benchmark set with Thorn's perception library.

Reads out/node-hashes.json and out/images/ written by `npm run report`
(Node 22) and hashes every file with perception's PDQHash (Apache-2.0),
which wraps Meta's C++ PDQ through the pdqhash bindings and decodes with
OpenCV. Writes out/perception-hashes.json; re-run `npm run report` to fold
the agreement section into REPORT.md.

Setup (host Python 3.12; the Node side must run first):
    python3.12 -m venv .venv
    .venv/bin/pip install "perception[pdq]"
    npm run report                  # Node 22: builds out/
    .venv/bin/python python/perception_ref.py
    npm run report                  # Node 22: merges into REPORT.md

We link to Thorn's Apache-2.0 library and copy nothing from it.
"""

import json
import os
import sys

import cv2
import numpy as np
from perception import hashers

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "out")


def hamming_hex(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def main() -> int:
    node_path = os.path.join(OUT, "node-hashes.json")
    if not os.path.exists(node_path):
        print("out/node-hashes.json not found - run `npm run report` first")
        return 1
    with open(node_path, encoding="utf-8") as fh:
        node = json.load(fh)["items"]

    hasher = hashers.PDQHash()
    hashes = []
    agree = []
    skipped = []
    for i, item in enumerate(node):
        path = os.path.join(OUT, "images", item["file"])
        if not os.path.exists(path):
            skipped.append(item["name"])
            continue
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            skipped.append(item["name"])
            continue
        hash_hex, quality = hasher.compute_with_quality(
            cv2.cvtColor(img, cv2.COLOR_BGR2RGB), hash_format="hex"
        )
        hashes.append({"name": item["name"], "hash": hash_hex, "quality": int(quality)})
        agree.append(hamming_hex(item["hash"], hash_hex))
        if (i + 1) % 100 == 0:
            print(f"  hashed {i + 1}/{len(node)}")

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "perception-hashes.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "pipeline": "perception.hashers.PDQHash (perception[pdq], Apache-2.0)",
                "hashes": hashes,
            },
            fh,
            indent=1,
        )

    agree.sort()
    n = len(agree)
    summary = {
        "hashed": n,
        "skipped": skipped,
        "agreement_max": agree[-1] if agree else None,
        "agreement_p95": agree[min(n - 1, int(0.95 * n))] if agree else None,
        "agreement_median": agree[n // 2] if agree else None,
        "agreement_mean": round(sum(agree) / n, 1) if agree else None,
        "exact": sum(1 for d in agree if d == 0),
    }
    print(json.dumps(summary, indent=1))
    print(f"wrote out/perception-hashes.json ({n} hashes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
