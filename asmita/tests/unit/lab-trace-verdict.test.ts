/*
 * The trace verdict bands (E3, WP76): every threshold boundary, the evidence
 * points, and the three verdict bands — pinned so the tool can never drift
 * into claiming more than the signals prove.
 */
import { describe, expect, it } from "vitest";
import {
  BAND_POINTS,
  evidenceParts,
  pdqBand,
  sscdBand,
  STRONG_EVIDENCE_POINTS,
  POSSIBLE_EVIDENCE_POINTS,
  tileBand,
  traceSignals,
  verdictOf,
  type RegionScore,
  type TraceInput,
  type TraceSignals,
} from "@/lib/lab/trace/score";

function region(distance: number, qualityA = 80, qualityB = 80): RegionScore {
  return { distance, qualityA, qualityB };
}

function signals(partial: Partial<TraceSignals>): TraceSignals {
  return {
    whole: null,
    face: null,
    background: null,
    sscd: null,
    tiles: { agreement: 0, heat: [], matched: [], grid: 16, aligned: false },
    notes: [],
    ...partial,
  };
}

describe("trace bands", () => {
  it("bands PDQ distances with the production thresholds", () => {
    expect(pdqBand(region(0))).toBe("strong");
    expect(pdqBand(region(12))).toBe("strong");
    expect(pdqBand(region(13))).toBe("match");
    expect(pdqBand(region(24))).toBe("match");
    expect(pdqBand(region(25))).toBe("borderline");
    expect(pdqBand(region(31))).toBe("borderline"); // the production match threshold
    expect(pdqBand(region(32))).toBe("none");
    expect(pdqBand(null)).toBe("unreliable");
  });

  it("reads below-quality hashes as unreliable whatever the distance", () => {
    expect(pdqBand(region(0, 24, 90))).toBe("unreliable");
    expect(pdqBand(region(0, 90, 24))).toBe("unreliable");
    expect(pdqBand(region(0, 25, 25))).toBe("strong");
  });

  it("bands SSCD cosines around the crawler's 0.85 match threshold", () => {
    expect(sscdBand(1)).toBe("strong");
    expect(sscdBand(0.93)).toBe("strong");
    expect(sscdBand(0.929)).toBe("match");
    expect(sscdBand(0.85)).toBe("match");
    expect(sscdBand(0.75)).toBe("weak");
    expect(sscdBand(0.749)).toBe("none");
    expect(sscdBand(null)).toBe("unreliable");
  });

  it("bands the tile agreement share", () => {
    expect(tileBand(1)).toBe("strong");
    expect(tileBand(0.85)).toBe("strong");
    expect(tileBand(0.84)).toBe("match");
    expect(tileBand(0.6)).toBe("match");
    expect(tileBand(0.59)).toBe("weak");
    expect(tileBand(0.45)).toBe("weak");
    expect(tileBand(0.44)).toBe("none");
  });

  it("prices bands as evidence points", () => {
    expect(BAND_POINTS.strong).toBe(2);
    expect(BAND_POINTS.match).toBe(1);
    expect(BAND_POINTS.borderline).toBe(0.5);
    expect(BAND_POINTS.weak).toBe(0.5);
    expect(BAND_POINTS.none).toBe(0);
    expect(BAND_POINTS.unreliable).toBe(0);
  });
});

describe("trace verdict", () => {
  it("marks every signal's availability in the breakdown", () => {
    const parts = evidenceParts(
      signals({
        whole: region(10),
        face: region(40),
        sscd: { cosine: 0.9 },
        tiles: { agreement: 0.9, heat: [], matched: [], grid: 16, aligned: true },
      }),
    );
    const by = Object.fromEntries(parts.map((p) => [p.signal, p]));
    expect(by.whole.band).toBe("strong");
    expect(by.face.band).toBe("none");
    expect(by.background.available).toBe(false);
    expect(by.sscd.band).toBe("match");
    expect(by.tiles.band).toBe("strong");
  });

  it("needs 3.5 points AND a strong signal for a strong verdict", () => {
    // Three moderate matches (3 points): possible, not strong.
    const moderate = signals({
      whole: region(20),
      face: region(20),
      sscd: { cosine: 0.86 },
      tiles: { agreement: 0.0, heat: [], matched: [], grid: 16, aligned: false },
    });
    let v = verdictOf(moderate);
    expect(v.points).toBeCloseTo(3, 6);
    expect(v.verdict).toBe("possible");

    // One clear signal alone (2 points): possible.
    const oneStrong = signals({ whole: region(5) });
    v = verdictOf(oneStrong);
    expect(v.points).toBe(2);
    expect(v.verdict).toBe("possible");

    // A clear signal plus corroboration: strong.
    const strong = signals({
      whole: region(5),
      tiles: { agreement: 0.9, heat: [], matched: [], grid: 16, aligned: true },
    });
    v = verdictOf(strong);
    expect(v.points).toBe(4);
    expect(v.verdict).toBe("strong");

    // 3.5 points without any strong band stays possible.
    const noStrong = signals({
      whole: region(20), // match 1
      face: region(20), // match 1
      sscd: { cosine: 0.86 }, // match 1
      tiles: { agreement: 0.5, heat: [], matched: [], grid: 16, aligned: true }, // weak 0.5
    });
    v = verdictOf(noStrong);
    expect(v.points).toBeCloseTo(3.5, 6);
    expect(v.verdict).toBe("possible");
  });

  it("keeps the thresholds the documented ones", () => {
    expect(STRONG_EVIDENCE_POINTS).toBe(3.5);
    expect(POSSIBLE_EVIDENCE_POINTS).toBe(1.5);
  });

  it("says none below 1.5 points, including flat-image collisions", () => {
    const nothing = signals({ tiles: { agreement: 0.1, heat: [], matched: [], grid: 16, aligned: false } });
    expect(verdictOf(nothing).verdict).toBe("none");
    // Two flat images hash alike, but the quality floor prices them at zero.
    const flatCollision = signals({
      whole: region(3, 10, 10),
      tiles: { agreement: 0.1, heat: [], matched: [], grid: 16, aligned: false },
    });
    const v = verdictOf(flatCollision);
    expect(v.verdict).toBe("none");
    expect(v.points).toBe(0);
  });

  it("short-circuits byte-identical images to strong", () => {
    const identical = signals({
      whole: region(0, 5, 5), // even flat and unreliable
      tiles: { agreement: 1, heat: [], matched: [], grid: 16, aligned: false },
      notes: ["identical_pixels"],
    });
    const v = verdictOf(identical);
    expect(v.identical).toBe(true);
    expect(v.verdict).toBe("strong");
  });

  it("keeps an unrelated honest pair at none through the full pipeline", () => {
    // Two clearly different textured images through the real scoring path.
    const w = 64;
    const a = new Uint8ClampedArray(w * w * 4);
    const b = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        a[p] = (x * 5) % 256; a[p + 1] = (y * 3) % 256; a[p + 2] = ((x + y) * 2) % 256; a[p + 3] = 255;
        b[p] = 255 - ((x * 3) % 256); b[p + 1] = (y * 7) % 256; b[p + 2] = ((x * y) % 256); b[p + 3] = 255;
      }
    }
    const s = traceSignals({
      suspect: { data: a, width: w, height: w },
      original: { data: b, width: w, height: w },
      suspectFace: null,
      originalFace: null,
      suspectSscd: null,
      originalSscd: null,
      sscdConfigured: false,
      landmarksConfigured: true,
    } satisfies TraceInput);
    const v = verdictOf(s);
    expect(s.whole!.distance).toBeGreaterThan(31);
    expect(v.verdict).toBe("none");
  });

  it("reaches strong for the classic morph signature: matching background, replaced face", () => {
    const w = 512;
    const original = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        original[p] = 128 + 120 * Math.sin(x / 9);
        original[p + 1] = 128 + 120 * Math.cos(y / 7);
        original[p + 2] = ((x + y) % 256);
        original[p + 3] = 255;
      }
    }
    const suspect = new Uint8ClampedArray(original);
    const box = { x: 200, y: 200, w: 96, h: 96 };
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const p = (y * w + x) * 4;
        suspect[p] = (x * 7 + y) % 256;
        suspect[p + 1] = (x + y * 5) % 256;
        suspect[p + 2] = (x * y) % 256;
      }
    }
    const face = { box, leftEye: { x: box.x + 29, y: box.y + 38 }, rightEye: { x: box.x + 67, y: box.y + 38 } };
    const s = traceSignals({
      suspect: { data: suspect, width: w, height: w },
      original: { data: original, width: w, height: w },
      suspectFace: face,
      originalFace: face,
      suspectSscd: [1, 0],
      originalSscd: [0.9, 0.1],
      sscdConfigured: true,
      landmarksConfigured: true,
    } satisfies TraceInput);
    const v = verdictOf(s);
    expect(v.verdict).toBe("strong");
    // The breakdown shows the signature: background strong, face none.
    const by = Object.fromEntries(v.parts.map((p) => [p.signal, p.band]));
    expect(by.background).toBe("strong");
    expect(by.face).toBe("none");
  });
});
