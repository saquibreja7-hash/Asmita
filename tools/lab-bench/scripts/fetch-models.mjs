#!/usr/bin/env node
/**
 * Fetches the pinned ONNX weights into models/ (gitignored, never committed)
 * with a sha256 check, the same discipline as the crawler image build
 * (crawler/Dockerfile on origin/feat/crawler-sscd). The pins live in
 * src/sscd.ts and src/detectors/local-onnx.ts; both artefacts are MIT:
 *
 *   sscd_disc_mixup.onnx            Meta Platforms, Inc. and affiliates
 *                                   (licence analysis: asmita/docs/adr/008
 *                                   on origin/feat/crawler-sscd)
 *   communityforensics-vit-s.onnx   Community Forensics ViT-S/16 384,
 *                                   Park & Owens, arXiv 2411.04125,
 *                                   ONNX export by onnx-community
 *
 * Run once before `match` / `detect`; both commands skip a missing model
 * with a hint instead of failing. The face-landmark models (human) are
 * fetched by the library itself on first use.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS = [
  {
    file: "sscd_disc_mixup.onnx",
    url: "https://huggingface.co/nutszebra/sscd_onnx/resolve/main/sscd_disc_mixup.onnx",
    sha256: "e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8",
    bytes: 98_156_202,
  },
  {
    file: "communityforensics-vit-s.onnx",
    url: "https://huggingface.co/onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX/resolve/main/onnx/model.onnx",
    sha256: "55602c73f457858f0b48c19bfa03bc6bd218f37027cb1f6b569ee24e2f954d03",
    bytes: 143_845_409,
  },
];

const modelsDir = process.env.LAB_BENCH_MODELS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "models");
mkdirSync(modelsDir, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let failed = false;
for (const model of MODELS) {
  const dest = join(modelsDir, model.file);
  if (existsSync(dest)) {
    const buf = readFileSync(dest);
    if (sha256(buf) === model.sha256) {
      console.log(`${model.file}: already present, sha256 ok (${buf.length} bytes)`);
      continue;
    }
    console.log(`${model.file}: hash mismatch on disk, re-fetching`);
    rmSync(dest, { force: true });
  }
  console.log(`${model.file}: downloading ${model.url}`);
  try {
    const res = await fetch(model.url, { redirect: "follow", signal: AbortSignal.timeout(600_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== model.sha256 || buf.length !== model.bytes) {
      throw new Error(`sha256 mismatch: got ${got} (${buf.length} bytes), expected ${model.sha256} (${model.bytes} bytes)`);
    }
    const tmp = `${dest}.part`;
    writeFileSync(tmp, buf);
    renameSync(tmp, dest);
    console.log(`${model.file}: verified (${buf.length} bytes)`);
  } catch (err) {
    failed = true;
    console.error(`${model.file}: FAILED: ${err.message}`);
  }
}
console.log(`models directory: ${modelsDir}`);
process.exit(failed ? 1 : 0);
