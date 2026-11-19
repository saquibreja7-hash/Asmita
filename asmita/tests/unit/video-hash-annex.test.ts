import { describe, expect, it } from "vitest";

// The vPDQ entries of the perceptual-hash annex (video-fingerprints spec
// WP19): one entry per video fingerprint, at most 200 evenly spaced frame
// hashes, one plain sentence on how vPDQ is matched. Pure renderer tests -
// synthetic hex strings only, no video bytes anywhere in this suite.

import { buildHashAnnex, MAX_ANNEX_VIDEO_FRAMES } from "@/lib/notice-generator";

const IMG = "a".repeat(64);
const F1 = "b".repeat(64);
const F2 = "c".repeat(64);
const F3 = "d".repeat(64);

/** A distinct, valid 64-hex frame hash for index i (0-based). */
function hex(i: number) {
  return i.toString(16).padStart(64, "0");
}

/** The frame-hash lines of the annex, in order. */
function frameLines(annex: string) {
  return annex.split("\n").filter((line) => /^ {7}[0-9a-f]{64}$/.test(line));
}

describe("buildHashAnnex with video fingerprints", () => {
  it("lists a video as one entry after the images, with the plain vPDQ sentence", () => {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [{ value: IMG, quality: 92 }],
      videos: [{ frameCount: 3, frames: [F1, F2, F3] }],
      clientVersion: "vpdq-0.1.0",
    });
    // The image entry is unchanged and numbered first.
    expect(annex).toContain(`  1. ${IMG} (quality: 92/100)`);
    // One entry for the whole video, numbering continues, frame hashes follow.
    expect(annex).toContain("  2. Video fingerprint (vPDQ, 3 frames)");
    expect(annex).toContain("     Frame hashes (PDQ, one frame per second):");
    expect(frameLines(annex)).toEqual([`       ${F1}`, `       ${F2}`, `       ${F3}`]);
    // One plain sentence saying how vPDQ is matched: PDQ per frame, one frame
    // per second, Hamming distance.
    expect(annex).toContain("the PDQ hash of one frame per second of playback");
    expect(annex).toContain("within a small Hamming distance of the");
    // Both algorithms named.
    expect(annex).toContain("Algorithm: PDQ for images and vPDQ for videos (Meta ThreatExchange open-source perceptual hashes)");
    // The matching guidance and the annex fences are still there.
    expect(annex).toContain("Hamming distance threshold of 31");
    expect(annex).toContain("--- PERCEPTUAL HASH ANNEX ---");
    expect(annex).toContain("--- END HASH ANNEX ---");
  });

  it("renders a video-only annex without the image hash list", () => {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [],
      videos: [{ frameCount: 3, frames: [F1, F2, F3] }],
    });
    expect(annex).not.toContain("Hash values (PDQ, 256-bit hex):");
    expect(annex).toContain("Algorithm: vPDQ (Meta ThreatExchange open-source perceptual hash for video)");
    expect(annex).toContain("  1. Video fingerprint (vPDQ, 3 frames)");
    expect(frameLines(annex)).toHaveLength(3);
    // Frame lines carry the hash and nothing else: no quality, no timestamp.
    expect(annex).toContain(`       ${F1}`);
    expect(annex).not.toContain("(quality");
  });

  it("keeps the image-only annex byte-identical when no video is passed", () => {
    const before = buildHashAnnex({ algorithm: "PDQ", hashes: [{ value: IMG, quality: 92 }] });
    const emptyVideos = buildHashAnnex({ algorithm: "PDQ", hashes: [{ value: IMG, quality: 92 }], videos: [] });
    expect(emptyVideos).toBe(before);
    expect(before).toContain("Algorithm: PDQ (Meta ThreatExchange open-source perceptual hash)");
  });

  it("caps a long video at 200 evenly spaced frame hashes, first and last kept", () => {
    const frames = Array.from({ length: 401 }, (_, i) => hex(i));
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [],
      videos: [{ frameCount: 401, frames }],
    });
    // The entry names the whole video's frame count, not the listed count.
    expect(annex).toContain("Video fingerprint (vPDQ, 401 frames)");
    expect(annex).toContain(`     Frame hashes (PDQ, one frame per second; ${MAX_ANNEX_VIDEO_FRAMES} of 401 listed, evenly spaced):`);
    const listed = frameLines(annex).map((line) => line.trim());
    expect(listed).toHaveLength(MAX_ANNEX_VIDEO_FRAMES);
    expect(listed[0]).toBe(frames[0]);
    expect(listed[listed.length - 1]).toBe(frames[frames.length - 1]);
    // Evenly spaced: every listed hash is one of the video's, in sampling
    // order, no repeats, and the step between neighbours is the same 2-or-3
    // the 401 -> 200 spacing produces (400/199 = 2.01).
    const indexes = listed.map((hash) => frames.indexOf(hash));
    expect([...new Set(indexes)]).toEqual(indexes);
    const gaps = indexes.slice(1).map((index, i) => index - indexes[i]);
    expect(new Set(gaps)).toEqual(new Set([2, 3]));
  });

  it("lists every frame of a video at or below the cap, with no truncation note", () => {
    const atCap = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [],
      videos: [{ frameCount: MAX_ANNEX_VIDEO_FRAMES, frames: Array.from({ length: MAX_ANNEX_VIDEO_FRAMES }, (_, i) => hex(i)) }],
    });
    expect(frameLines(atCap)).toHaveLength(MAX_ANNEX_VIDEO_FRAMES);
    expect(atCap).toContain(`Frame hashes (PDQ, one frame per second):`);
    expect(atCap).not.toContain("listed, evenly spaced");

    const over = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [],
      videos: [{ frameCount: 201, frames: Array.from({ length: 201 }, (_, i) => hex(i)) }],
    });
    expect(frameLines(over)).toHaveLength(MAX_ANNEX_VIDEO_FRAMES);
    expect(over).toContain(`Frame hashes (PDQ, one frame per second; ${MAX_ANNEX_VIDEO_FRAMES} of 201 listed, evenly spaced):`);
  });

  it("numbers several videos one entry each, capping each independently", () => {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [{ value: IMG, quality: 10 }],
      videos: [
        { frameCount: 2, frames: [F1, F2] },
        { frameCount: 201, frames: Array.from({ length: 201 }, (_, i) => hex(i)) },
      ],
    });
    expect(annex).toContain("  2. Video fingerprint (vPDQ, 2 frames)");
    expect(annex).toContain("  3. Video fingerprint (vPDQ, 201 frames)");
    expect(annex).toContain(`       ${F1}`);
    // The second video's truncation note names its own frames.
    expect(annex).toContain(`Frame hashes (PDQ, one frame per second; ${MAX_ANNEX_VIDEO_FRAMES} of 201 listed, evenly spaced):`);
  });

  it("pluralises one frame and lowercases frame hashes", () => {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [],
      videos: [{ frameCount: 1, frames: [F1.toUpperCase()] }],
    });
    expect(annex).toContain("  1. Video fingerprint (vPDQ, 1 frame)");
    expect(annex).toContain(`       ${F1}`);
  });

  it("rejects an empty annex and a malformed frame hash like a malformed image hash", () => {
    expect(() => buildHashAnnex({ algorithm: "PDQ", hashes: [], videos: [] })).toThrow("hash_annex_empty");
    expect(() =>
      buildHashAnnex({ algorithm: "PDQ", hashes: [], videos: [{ frameCount: 1, frames: ["not-a-hash"] }] }),
    ).toThrow("hash_annex_invalid_hash");
    expect(() =>
      buildHashAnnex({ algorithm: "PDQ", hashes: [{ value: IMG, quality: 90 }], videos: [{ frameCount: 1, frames: ["data:image/png;base64,AAAA"] }] }),
    ).toThrow("hash_annex_invalid_hash");
  });
});
