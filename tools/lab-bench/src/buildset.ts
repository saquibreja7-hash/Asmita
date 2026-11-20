/**
 * build-set: the E1 test-set builder.
 *
 * Portraits mode: from a local folder of portraits, produce for every image
 *   - the untouched original (the matching gallery, byte-identical), and
 *   - the charter's variants: crop, resize, mirror, text/sticker overlay,
 *     screenshot with borders, WhatsApp-style re-encode (long edge 1600,
 *     JPEG q~70), a landmark-aligned face-swap composite (CPU only), and the
 *     face-swap plus WhatsApp stack (the stop-rule combination).
 *
 * Dataset mode: a local labelled folder from a public deepfake dataset with
 * `real/` and `fake/` subfolders is imported as-is (labels kept, no synthetic
 * variants generated), so a bench can mix generated and published sets.
 *
 * Output: <out-dir>/images/* plus set.json. Nothing about real people is
 * recorded in the manifest — only ids, transforms and labels.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as transforms from "./transforms.ts";
import { swapFace } from "./faceswap.ts";
import { HumanFaceLocator, type FaceLocator, type DetectedFace } from "./landmarks.ts";
import { BenchSet, SET_VERSION, type SetItem } from "./setformat.ts";

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

export type BuildSetOptions = {
  /** Face locator; tests inject a deterministic fake. Default: human. */
  locator?: FaceLocator;
  /** Skip the face-swap variants entirely (e.g. a landmarks-free quick set). */
  noFaceswap?: boolean;
};

function listImages(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => IMAGE_RE.test(f))
    .sort();
}

function stemOf(file: string): string {
  return file.replace(IMAGE_RE, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "img";
}

function uniqueId(taken: Set<string>, base: string): string {
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

async function itemMeta(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Is this a labelled dataset folder (real/ and fake/ subfolders)? */
export function isDatasetDir(inDir: string): boolean {
  return existsSync(join(inDir, "real")) && existsSync(join(inDir, "fake"));
}

export type BuildSetResult = {
  dir: string;
  set: BenchSet;
  facesFound: number;
  facesMissing: string[];
  faceswapSkipped: string[];
};

export async function buildSet(inDir: string, outDir: string, opts: BuildSetOptions = {}): Promise<BuildSetResult> {
  mkdirSync(join(outDir, "images"), { recursive: true });
  const taken = new Set<string>();
  const items: SetItem[] = [];
  let facesFound = 0;
  const facesMissing: string[] = [];
  const faceswapSkipped: string[] = [];

  const write = async (
    baseId: string,
    buffer: Buffer,
    transform: SetItem["transform"],
    sourceId: string | null,
    label: "real" | "fake",
    extra: { faceFound?: boolean; dataset?: string } = {},
  ): Promise<SetItem> => {
    const id = uniqueId(taken, baseId);
    // The buffer is already encoded by its transform; the extension follows
    // the actual bytes.
    const name = `${id}${extOf(buffer)}`;
    writeFileSync(join(outDir, "images", name), buffer);
    const meta = await itemMeta(buffer);
    const item: SetItem = {
      id,
      file: `images/${name}`,
      transform,
      sourceId,
      label,
      width: meta.width,
      height: meta.height,
      bytes: buffer.length,
      ...(extra.dataset ? { dataset: extra.dataset } : {}),
      ...(extra.faceFound !== undefined ? { faceFound: extra.faceFound } : {}),
    };
    items.push(item);
    return item;
  };

  if (isDatasetDir(inDir)) {
    // Dataset import: labels come from the subfolders; images are copied as-is.
    for (const sub of ["real", "fake"] as const) {
      for (const file of listImages(join(inDir, sub))) {
        const buffer = readFileSync(join(inDir, sub, file));
        await write(`ds-${sub}-${stemOf(file)}`, buffer, "dataset", null, sub === "fake" ? "fake" : "real", { dataset: sub });
      }
    }
    const set: BenchSet = {
      version: SET_VERSION,
      createdAt: new Date().toISOString(),
      kind: "dataset",
      note: "imported from a labelled deepfake dataset folder (real/ and fake/)",
      items,
    };
    writeFileSync(join(outDir, "set.json"), JSON.stringify(set, null, 2) + "\n");
    return { dir: outDir, set, facesFound: 0, facesMissing: [], faceswapSkipped: [] };
  }

  // Portraits mode.
  const files = listImages(inDir);
  if (files.length === 0) throw new Error(`no images found in ${inDir}`);
  const locator = opts.locator ?? new HumanFaceLocator();
  const buffers = files.map((f) => readFileSync(join(inDir, f)));
  const facesPerPortrait: Array<DetectedFace | null> = [];
  for (let i = 0; i < files.length; i++) {
    let face: DetectedFace | null = null;
    try {
      face = (await locator.detect(buffers[i]!))[0] ?? null;
    } catch {
      // A portrait whose face cannot be located simply gets no face-swap
      // variant; the other transforms are unaffected.
      face = null;
    }
    if (face) facesFound++;
    else facesMissing.push(stemOf(files[i]!));
    facesPerPortrait.push(face);
  }

  const originalIds: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const id = uniqueId(taken, stemOf(files[i]!));
    // Byte-identical copy: the gallery hashes exactly what production would.
    copyFileSync(join(inDir, files[i]!), join(outDir, "images", files[i]!));
    const meta = await itemMeta(buffers[i]!);
    items.push({
      id,
      file: `images/${files[i]!}`,
      transform: "original",
      sourceId: null,
      label: "real",
      width: meta.width,
      height: meta.height,
      bytes: buffers[i]!.length,
      ...(facesPerPortrait[i] !== null ? { faceFound: true } : { faceFound: false }),
    });
    originalIds.push(id);
  }

  for (let i = 0; i < files.length; i++) {
    const base = originalIds[i]!;
    const stem = stemOf(files[i]!);
    const buffer = buffers[i]!;
    const simple: Array<[string, SetItem["transform"], (b: Buffer) => Promise<Buffer>]> = [
      ["crop", "crop", transforms.crop],
      ["resize", "resize", transforms.resize],
      ["mirror", "mirror", transforms.mirror],
      ["overlay", "overlay", transforms.overlay],
      ["screenshot", "screenshot", transforms.screenshot],
      ["whatsapp", "whatsapp", transforms.whatsapp],
    ];
    for (const [name, transform, fn] of simple) {
      await write(`${stem}__${name}`, await fn(buffer), transform, base, "real");
    }
    if (!opts.noFaceswap) {
      const targetFace = facesPerPortrait[i];
      const j = (i + 1) % files.length;
      const sourceFace = facesPerPortrait[j];
      if (targetFace && sourceFace && files.length >= 2) {
        const swapped = await swapFace(buffer, buffers[j]!, targetFace, sourceFace);
        await write(`${stem}__faceswap`, swapped, "faceswap", base, "fake");
        await write(`${stem}__faceswap-wa`, await transforms.whatsapp(swapped), "faceswap+whatsapp", base, "fake");
      } else {
        faceswapSkipped.push(stem);
      }
    }
  }

  const set: BenchSet = {
    version: SET_VERSION,
    createdAt: new Date().toISOString(),
    kind: files.length > 0 && items.some((i) => i.transform === "dataset") ? "mixed" : "portraits",
    note: `built from ${files.length} portrait(s)`,
    items,
  };
  writeFileSync(join(outDir, "set.json"), JSON.stringify(set, null, 2) + "\n");
  return { dir: outDir, set, facesFound, facesMissing, faceswapSkipped };
}

/** Extension from the buffer's magic bytes (the transform already encoded it). */
function extOf(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg";
  if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return ".webp";
  return ".png";
}
