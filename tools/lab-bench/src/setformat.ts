/**
 * The on-disk format of a built benchmark set (the `set.json` the
 * build-set command writes and match/detect/report read).
 *
 * A set is a flat directory: `set.json` plus the image files it names under
 * `images/`. Every item knows the transform that produced it, which original
 * it came from, and its ground-truth label for the detector benchmark:
 *
 *   - label "real": an untouched original, or a transform of one (a crop of
 *     a real photograph is still a real photograph — an honest detector must
 *     not flag it);
 *   - label "fake": a face-swap composite (a morph), or an image imported
 *     from a labelled deepfake dataset's fake folder.
 */
import { z } from "zod";

/** Transform tags. "original" items are the untouched sources (the gallery). */
export const TRANSFORMS = [
  "original",
  "crop",
  "resize",
  "mirror",
  "overlay",
  "screenshot",
  "whatsapp",
  "faceswap",
  "faceswap+whatsapp",
  "dataset",
] as const;
export type Transform = (typeof TRANSFORMS)[number];

export const SET_VERSION = 1;

export const SetItem = z.object({
  /** Stable id, also the file stem. */
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  /** Path of the image file relative to the set directory. */
  file: z.string(),
  transform: z.enum(TRANSFORMS),
  /** For variants: the id of the original they were built from. Null for originals. */
  sourceId: z.string().nullable(),
  label: z.enum(["real", "fake"]),
  width: z.int().nonnegative(),
  height: z.int().nonnegative(),
  bytes: z.int().nonnegative(),
  /** Dataset import provenance (subfolder name), dataset items only. */
  dataset: z.string().optional(),
  /** True when the face locator found a face (originals and faceswap items). */
  faceFound: z.boolean().optional(),
});
export type SetItem = z.infer<typeof SetItem>;

export const BenchSet = z.object({
  version: z.literal(SET_VERSION),
  createdAt: z.string(),
  kind: z.enum(["portraits", "dataset", "mixed"]),
  /** Free-text provenance note (never a person's identity, only folder names). */
  note: z.string().optional(),
  items: z.array(SetItem),
});
export type BenchSet = z.infer<typeof BenchSet>;

/** The transforms of the probe side, in report order. */
export const PROBE_TRANSFORMS = [
  "crop",
  "resize",
  "mirror",
  "overlay",
  "screenshot",
  "whatsapp",
  "faceswap",
  "faceswap+whatsapp",
] as const satisfies readonly Transform[];
export type ProbeTransform = (typeof PROBE_TRANSFORMS)[number];

export function isProbeTransform(t: Transform): t is ProbeTransform {
  return (PROBE_TRANSFORMS as readonly string[]).includes(t);
}

/**
 * Items that act as the matching gallery: the untouched originals. (Dataset
 * reals are probes/gallery members for the detector benchmark through their
 * label; matching pairs are only defined for generated variants.)
 */
export function galleryItems(items: SetItem[]): SetItem[] {
  return items.filter((i) => i.transform === "original");
}

/** Probe items: everything the builder produced from an original. */
export function probeItems(items: SetItem[]): SetItem[] {
  return items.filter((i) => isProbeTransform(i.transform));
}

/** Read and strictly validate set.json from a set directory. */
export function parseSet(json: unknown): BenchSet {
  return BenchSet.parse(json);
}
