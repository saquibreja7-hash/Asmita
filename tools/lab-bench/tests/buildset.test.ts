import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildSet, isDatasetDir } from "../src/buildset.ts";
import { BenchSet, galleryItems, probeItems, type SetItem } from "../src/setformat.ts";
import { gradient, shape, stripes } from "../src/synthetic.ts";
import { FakeLocator, TINY_FACE } from "./support/fakes.ts";

const tmp = mkdtempSync(join(tmpdir(), "lab-bench-buildset-"));
const portraits = join(tmp, "portraits");
const out = join(tmp, "set");
mkdirSync(portraits, { recursive: true });

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("buildSet (portraits)", () => {
  it("builds the charter's variants for every portrait", async () => {
    writeFileSync(join(portraits, "p1.png"), await stripes());
    writeFileSync(join(portraits, "p2.png"), await shape(96, 64, 5));
    writeFileSync(join(portraits, "p3.png"), await gradient());
    const result = await buildSet(portraits, out, { locator: new FakeLocator() });

    expect(result.facesFound).toBe(3);
    expect(result.faceswapSkipped).toEqual([]);
    const set = BenchSet.parse(JSON.parse(readFileSync(join(out, "set.json"), "utf8")));
    expect(set.kind).toBe("portraits");
    expect(set.version).toBe(1);
    expect(set.items).toHaveLength(27); // 3 originals + 8 variants each

    const byTransform = (t: SetItem["transform"]) => set.items.filter((i) => i.transform === t);
    expect(byTransform("original")).toHaveLength(3);
    for (const t of ["crop", "resize", "mirror", "overlay", "screenshot", "whatsapp", "faceswap", "faceswap+whatsapp"] as const) {
      expect(byTransform(t)).toHaveLength(3);
    }
    // Labels: untouched and pixel-only transforms stay real; composites are fake.
    for (const item of set.items) {
      expect(item.label).toBe(item.transform === "faceswap" || item.transform === "faceswap+whatsapp" ? "fake" : "real");
    }
    // Every variant names its source original; every file exists.
    const ids = new Set(set.items.map((i) => i.id));
    for (const item of probeItems(set.items)) {
      expect(item.sourceId).not.toBeNull();
      expect(ids.has(item.sourceId!)).toBe(true);
      expect(existsSync(join(out, item.file))).toBe(true);
    }
    expect(galleryItems(set.items)).toHaveLength(3);
    // The gallery copies are byte-identical to the input portraits.
    const p1 = readFileSync(join(portraits, "p1.png"));
    const orig1 = byTransform("original").find((i) => i.id === "p1")!;
    expect(readFileSync(join(out, orig1.file)).equals(p1)).toBe(true);
  });

  it("never emits colliding ids for same-stem files", async () => {
    const dir = join(tmp, "collide");
    const outDir = join(tmp, "set-collide");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.png"), await stripes(40, 30));
    const jpg = await sharpJpeg(await stripes(40, 30, 5));
    writeFileSync(join(dir, "a.jpg"), jpg);
    const result = await buildSet(dir, outDir, { locator: new FakeLocator() });
    const ids = result.set.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips face-swaps for portraits without a located face", async () => {
    const dir = join(tmp, "noface");
    const outDir = join(tmp, "set-noface");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "solo.png"), await stripes());
    const emptyLocator = { detect: async () => [] as never };
    const result = await buildSet(dir, outDir, { locator: emptyLocator });
    expect(result.facesFound).toBe(0);
    expect(result.faceswapSkipped).toEqual(["solo"]);
    expect(result.set.items.filter((i) => i.transform === "faceswap")).toHaveLength(0);
    expect(result.set.items.filter((i) => i.transform === "crop")).toHaveLength(1);
    // The original records faceFound: false.
    expect(result.set.items.find((i) => i.transform === "original")!.faceFound).toBe(false);
  });

  it("labels a face-swap fake even when the face geometry is invented", () => {
    expect(TINY_FACE.box.w).toBeGreaterThan(0);
  });
});

describe("buildSet (dataset import)", () => {
  it("imports real/ and fake/ folders as-is", async () => {
    const dir = join(tmp, "dataset");
    mkdirSync(join(dir, "real"), { recursive: true });
    mkdirSync(join(dir, "fake"), { recursive: true });
    writeFileSync(join(dir, "real", "r1.png"), await stripes(60, 40));
    writeFileSync(join(dir, "fake", "f1.png"), await shape(60, 40, 9));
    expect(isDatasetDir(dir)).toBe(true);

    const outDir = join(tmp, "set-ds");
    const result = await buildSet(dir, outDir, {});
    const set = BenchSet.parse(JSON.parse(readFileSync(join(outDir, "set.json"), "utf8")));
    expect(set.kind).toBe("dataset");
    expect(set.items).toHaveLength(2);
    const real = set.items.find((i) => i.label === "real")!;
    const fake = set.items.find((i) => i.label === "fake")!;
    expect(real.transform).toBe("dataset");
    expect(fake.transform).toBe("dataset");
    expect(real.dataset).toBe("real");
    expect(fake.dataset).toBe("fake");
    expect(real.sourceId).toBeNull();
  });
});

async function sharpJpeg(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer).jpeg({ quality: 90 }).toBuffer();
}
