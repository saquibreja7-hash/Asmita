import { describe, expect, it } from "vitest";
import { BenchSet, galleryItems, isProbeTransform, parseSet, probeItems, PROBE_TRANSFORMS, SET_VERSION, TRANSFORMS } from "../src/setformat.ts";

const valid = {
  version: SET_VERSION,
  createdAt: "2026-11-20T00:00:00.000Z",
  kind: "portraits",
  items: [
    { id: "a", file: "images/a.png", transform: "original", sourceId: null, label: "real", width: 96, height: 64, bytes: 100 },
    { id: "a__crop", file: "images/a__crop.png", transform: "crop", sourceId: "a", label: "real", width: 86, height: 58, bytes: 90 },
    { id: "a__faceswap", file: "images/a__faceswap.jpg", transform: "faceswap", sourceId: "a", label: "fake", width: 96, height: 64, bytes: 120, faceFound: true },
  ],
};

describe("BenchSet schema", () => {
  it("accepts a valid manifest and round-trips it", () => {
    const set = parseSet(valid);
    expect(set.items).toHaveLength(3);
    expect(set.items[2]!.faceFound).toBe(true);
    expect(set.items[1]!.faceFound).toBeUndefined();
  });

  it("rejects unknown transforms, labels, versions and bad ids", () => {
    expect(() => parseSet({ ...valid, version: 2 })).toThrow();
    expect(() => parseSet({ ...valid, items: [{ ...valid.items[0]!, transform: "sharpen" }] })).toThrow();
    expect(() => parseSet({ ...valid, items: [{ ...valid.items[0]!, label: "unknown" }] })).toThrow();
    expect(() => parseSet({ ...valid, items: [{ ...valid.items[0]!, id: "Bad Id!" }] })).toThrow();
    expect(() => parseSet({ ...valid, kind: "other" })).toThrow();
  });
});

describe("partitioning", () => {
  const set = parseSet(valid);
  it("gallery items are the originals", () => {
    expect(galleryItems(set.items).map((i) => i.id)).toEqual(["a"]);
  });
  it("probe items are the generated variants", () => {
    expect(probeItems(set.items).map((i) => i.id)).toEqual(["a__crop", "a__faceswap"]);
  });
  it("isProbeTransform separates probes from gallery and dataset rows", () => {
    expect(isProbeTransform("crop")).toBe(true);
    expect(isProbeTransform("faceswap+whatsapp")).toBe(true);
    expect(isProbeTransform("original")).toBe(false);
    expect(isProbeTransform("dataset")).toBe(false);
  });
  it("the probe transform list is the charter's", () => {
    expect([...PROBE_TRANSFORMS]).toEqual([
      "crop",
      "resize",
      "mirror",
      "overlay",
      "screenshot",
      "whatsapp",
      "faceswap",
      "faceswap+whatsapp",
    ]);
    expect(TRANSFORMS).toContain("dataset");
  });
});
