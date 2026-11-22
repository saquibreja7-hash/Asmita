import { describe, expect, it } from "vitest";
import { eyePointsOf, toDetectedFaces } from "../src/landmarks.ts";

// The pure helpers of the face locator. The tests never import human (the
// locator loads it lazily); the eye-point rule exists because human 3.3.6
// annotates eyes as contour rings plus an iris ring, with no combined
// "leftEye" key — the first real locator run dropped every face until this
// was fixed.

const pt = (x: number, y: number) => ({ x, y });

describe("eyePointsOf", () => {
  it("prefers the iris ring, the pupil's own points", () => {
    const annotations = {
      leftEyeIris: [pt(10, 10), pt(12, 10)],
      leftEyeUpper0: [pt(0, 0)],
      leftEyebrowUpper: [pt(99, 99)],
    };
    expect(eyePointsOf(annotations, "left")).toEqual([pt(10, 10), pt(12, 10)]);
    expect(eyePointsOf(annotations, "right")).toEqual([]);
  });

  it("normalises human's [x, y, z] triples to points", () => {
    const annotations = {
      // What human 3.3.6 actually emits: number triples per contour.
      leftEyeUpper0: [[10, 20, 0] as unknown as { x: number; y: number }],
      leftEyeLower0: [[12, 24, 1] as unknown as { x: number; y: number }],
      leftEyebrowUpper: [[90, 5, 0] as unknown as { x: number; y: number }],
    };
    expect(eyePointsOf(annotations, "left")).toEqual([pt(10, 20), pt(12, 24)]);
  });

  it("falls back to the lid contours, never the eyebrow", () => {
    const annotations = {
      leftEyeUpper0: [pt(1, 2)],
      leftEyeLower0: [pt(3, 4)],
      leftEyeLower1: [pt(5, 6)],
      leftEyebrowUpper: [pt(7, 8)],
      leftEyebrowLower: [pt(9, 10)],
      noseTip: [pt(11, 12)],
    };
    expect(eyePointsOf(annotations, "left")).toEqual([pt(1, 2), pt(3, 4), pt(5, 6)]);
  });

  it("ignores the null placeholders human emits when the iris model is off", () => {
    const annotations = {
      leftEyeIris: [null, null, null, null, null],
      leftEyeUpper0: [pt(1, 2)],
    } as unknown as Record<string, Array<{ x: number; y: number }>>;
    expect(eyePointsOf(annotations, "left")).toEqual([pt(1, 2)]);
  });

  it("honours a direct leftEye key if a model ever provides one", () => {
    expect(eyePointsOf({ leftEye: [pt(1, 1)] }, "left")).toEqual([pt(1, 1)]);
  });

  it("is empty for absent annotations", () => {
    expect(eyePointsOf(undefined, "left")).toEqual([]);
    expect(eyePointsOf({}, "right")).toEqual([]);
  });
});

describe("toDetectedFaces", () => {
  it("sorts largest area first, ties by box x", () => {
    const face = (w: number, h: number, x: number) => ({ box: { x, y: 0, w, h }, leftEye: pt(0, 0), rightEye: pt(1, 1), score: 1 });
    expect(toDetectedFaces([face(10, 10, 5), face(50, 20, 3), face(50, 20, 1)]).map((f) => f.box.x)).toEqual([1, 3, 5]);
  });
});
