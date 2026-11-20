import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildSscdTensor, cosine, prepareSscdInput, SSCD_INPUT_SIZE, SscdEmbedder, sscdModelPath, SSCD_MODEL_SHA256 } from "../src/sscd.ts";
import { buildCfTensor, CF_MODEL_SHA256, cfScoreFromLogits, CF_MEAN, createLocalOnnxDetector } from "../src/detectors/local-onnx.ts";
import { stripes } from "../src/synthetic.ts";

describe("SSCD preprocessing", () => {
  it("resizes straight to the 320x320 square input (aspect skewed, as the recipe requires)", async () => {
    const raw = await prepareSscdInput(await stripes(120, 40));
    expect(raw.length).toBe(SSCD_INPUT_SIZE * SSCD_INPUT_SIZE * 3);
  });

  it("builds the ImageNet-normalised NCHW tensor (pinned values)", () => {
    const rgb = new Uint8Array([0, 128, 255]);
    // size 1: one pixel, three planes of one value each.
    const t = buildSscdTensor(rgb, 1);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeCloseTo((0 / 255 - 0.485) / 0.229, 4);
    expect(t[1]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 4);
    expect(t[2]).toBeCloseTo((255 / 255 - 0.406) / 0.225, 4);
  });

  it("rejects the wrong raw length", () => {
    expect(() => buildSscdTensor(new Uint8Array(6), 1)).toThrow();
  });

  it("cosine is a dot product for L2-normalised vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosine([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1, 10);
  });
});

describe("SscdEmbedder", () => {
  it("is unavailable without the weights file, with a fetch hint", () => {
    const emptyModels = mkdtempSync(join(tmpdir(), "lab-bench-sscd-"));
    try {
      expect(sscdModelPath(emptyModels)).toBe(join(emptyModels, "sscd_disc_mixup.onnx"));
      const embedder = new SscdEmbedder({ modelsDir: emptyModels });
      expect(embedder.available).toBe(false);
      expect(embedder.reason).toMatch(/models:fetch/);
    } finally {
      rmSync(emptyModels, { recursive: true, force: true });
    }
  });

  it("pins the model identity the crawler branch pinned", () => {
    expect(SSCD_MODEL_SHA256).toBe("e65e2a5b9a5e44a0b0f011bddaa6f28621021f6120ca7ce8b526c19f2f6156f8");
  });

  it("embeds through an injected session and validates the dimension", async () => {
    const good = {
      inputNames: ["images"],
      outputNames: ["embeddings"],
      async run() {
        return { embeddings: { data: new Float32Array(512).fill(0.04) } };
      },
    };
    const embedder = new SscdEmbedder({ session: good });
    expect(embedder.available).toBe(true);
    const v = await embedder.embed(await stripes());
    expect(v).toHaveLength(512);
    expect(v[0]).toBeCloseTo(0.04, 6);

    const bad = {
      inputNames: ["images"],
      outputNames: ["embeddings"],
      async run() {
        return { embeddings: { data: new Float32Array(16) } };
      },
    };
    const badEmbedder = new SscdEmbedder({ session: bad });
    await expect(badEmbedder.embed(await stripes())).rejects.toThrow(/embedding shape/);
  });
});

describe("Community Forensics local detector math", () => {
  it("builds the CLIP-normalised tensor (pinned values)", () => {
    const t = buildCfTensor(new Uint8Array([0, 128, 255]), 1);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeCloseTo((0 / 255 - CF_MEAN[0]) / 0.26862954, 4);
    expect(t[1]).toBeCloseTo((128 / 255 - CF_MEAN[1]) / 0.26130258, 4);
    expect(t[2]).toBeCloseTo((255 / 255 - CF_MEAN[2]) / 0.27577711, 4);
  });

  it("maps a single logit through the sigmoid, two logits through softmax", () => {
    expect(cfScoreFromLogits(new Float32Array([0]))).toBeCloseTo(0.5, 6);
    expect(cfScoreFromLogits(new Float32Array([-10]))).toBeCloseTo(0.0000454, 6);
    expect(cfScoreFromLogits(new Float32Array([2, 0]))).toBeCloseTo(1 / (Math.E ** 2 + 1), 6);
    expect(cfScoreFromLogits(new Float32Array([1, 2, 3]))).toBeNull();
    expect(cfScoreFromLogits([1, 2])).toBeNull();
  });

  it("pins the downloaded artifact", () => {
    expect(CF_MODEL_SHA256).toBe("55602c73f457858f0b48c19bfa03bc6bd218f37027cb1f6b569ee24e2f954d03");
  });

  it("runs end to end through an injected session", async () => {
    const session = {
      inputNames: ["pixel_values"],
      outputNames: ["logits"],
      async run() {
        return { logits: { data: new Float32Array([3]) } };
      },
    };
    const r = createLocalOnnxDetector({ session });
    if (!("detector" in r)) throw new Error("session-injected detector must be available");
    const out = await r.detector.detect(await stripes());
    expect("score" in out).toBe(true);
    if ("score" in out) expect(out.score).toBeCloseTo(1 / (1 + Math.exp(-3)), 6);
    // Input name flexibility: the session's own name is used.
    const session2 = {
      inputNames: ["other_input"],
      outputNames: ["logits"],
      async run(inputs: Record<string, unknown>) {
        expect(Object.keys(inputs)).toEqual(["other_input"]);
        return { logits: { data: new Float32Array([0]) } };
      },
    };
    const r2 = createLocalOnnxDetector({ session: session2 });
    if ("detector" in r2) await r2.detector.detect(await sharp(await stripes()).jpeg().toBuffer());
  });

  it("maps a failing session to a fixed error code, never a throw", async () => {
    const session = {
      inputNames: ["pixel_values"],
      outputNames: ["logits"],
      async run() {
        throw new Error("boom");
      },
    };
    const r = createLocalOnnxDetector({ session });
    if (!("detector" in r)) throw new Error("unreachable");
    const out = await r.detector.detect(await stripes());
    expect("error" in out && out.error).toBe("cf_inference_failed");
  });
});
