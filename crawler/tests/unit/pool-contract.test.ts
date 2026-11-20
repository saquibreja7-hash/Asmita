/**
 * The pool contract the crawler's client enforces (video-fingerprints spec
 * WP20): image entries keep their pre-WP20 shape, video entries are
 * `{ id, kind: "video", frames }` with 1..1000 strictly 64-hex frames, and
 * the guard tells the two apart. Written independently of the app's pool
 * builder, like the other contract tests.
 */
import { describe, expect, it } from "vitest";
import { isVideoPoolEntry, PoolSchema, type Pool } from "../../src/asmita/client.ts";
import { randomFingerprint } from "../support/synthetic.ts";

const pool = (fingerprints: unknown[], threshold = 31): Pool =>
  PoolSchema.parse({
    version: "test-1",
    generatedAt: new Date().toISOString(),
    threshold,
    fingerprints,
  });

describe("the pool contract (WP20)", () => {
  it("accepts the image entry shape unchanged", () => {
    const pdq = randomFingerprint(1);
    const parsed = pool([{ id: "fp-img", pdq, quality: 90 }]);
    expect(parsed.fingerprints).toEqual([{ id: "fp-img", pdq, quality: 90 }]);
  });

  it("accepts a video entry with its frames beside image entries", () => {
    const f1 = randomFingerprint(2);
    const f2 = randomFingerprint(3);
    const parsed = pool([
      { id: "fp-vid", kind: "video", frames: [f1, f2] },
      { id: "fp-img", pdq: randomFingerprint(4), quality: 100 },
    ]);
    expect(parsed.fingerprints).toHaveLength(2);
    const video = parsed.fingerprints.find(isVideoPoolEntry);
    expect(video).toEqual({ id: "fp-vid", kind: "video", frames: [f1, f2] });
  });

  it("caps frames at the submission limit of 1000 and refuses an empty list", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => randomFingerprint(100 + i));
    expect(pool([{ id: "fp-vid", kind: "video", frames }]).fingerprints).toHaveLength(1);
    expect(() => pool([{ id: "fp-vid", kind: "video", frames: [...frames, randomFingerprint(999)] }])).toThrow();
    expect(() => pool([{ id: "fp-vid", kind: "video", frames: [] }])).toThrow();
  });

  it("refuses anything but 64-hex frame hashes", () => {
    expect(() => pool([{ id: "fp-vid", kind: "video", frames: ["not-hex"] }])).toThrow();
    expect(() => pool([{ id: "fp-vid", kind: "video", frames: ["A".repeat(64)] }])).toThrow(); // no uppercase
    expect(() => pool([{ id: "fp-vid", kind: "video", frames: ["data:image/png;base64,AAAA"] }])).toThrow();
  });

  it("refuses a video entry without id or with another kind", () => {
    expect(() => pool([{ kind: "video", frames: [randomFingerprint(5)] }])).toThrow();
    expect(() => pool([{ id: "fp-x", kind: "image", frames: [randomFingerprint(6)] }])).toThrow();
    expect(() => pool([{ id: "fp-x", kind: "video", frames: [42] }])).toThrow();
  });

  it("tells the two entry kinds apart", () => {
    const entries = pool([
      { id: "fp-img", pdq: randomFingerprint(7), quality: 1 },
      { id: "fp-vid", kind: "video", frames: [randomFingerprint(8)] },
    ]).fingerprints;
    const kinds = entries.map((e) => (isVideoPoolEntry(e) ? "video" : "image"));
    expect(kinds).toEqual(["image", "video"]);
  });
});
