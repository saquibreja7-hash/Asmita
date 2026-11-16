/**
 * Contract between the crawler and asmita/src/lib/pdq/pdq.ts.
 *
 * The crawler must fingerprint images with exactly the code survivors'
 * browsers run. If this test fails, the app-side PDQ module changed: review
 * the change, confirm crawler hashes still agree with browser hashes, and
 * only then update the expectations here.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import * as pdqModule from "../../../asmita/src/lib/pdq/pdq.ts";
import type { PdqInput } from "../../src/pdq.ts";
import { patternRgba } from "../support/synthetic.ts";

describe("pdq.ts contract", () => {
  it("exports exactly the expected runtime names", () => {
    expect(Object.keys(pdqModule).sort()).toEqual(
      [
        "PDQ_CLIENT_VERSION",
        "PDQ_HASH_PATTERN",
        "PDQ_MATCH_THRESHOLD",
        "computePdqHash",
        "hammingDistance",
      ].sort(),
    );
    expect(typeof pdqModule.computePdqHash).toBe("function");
    expect(typeof pdqModule.hammingDistance).toBe("function");
    expect(pdqModule.PDQ_MATCH_THRESHOLD).toBe(31);
    expect(pdqModule.PDQ_CLIENT_VERSION).toBe("pdq-ts-0.2.0");
  });

  it("keeps the PdqInput shape the crawler produces", () => {
    expectTypeOf<PdqInput>().toEqualTypeOf<{
      data: Uint8ClampedArray | Uint8Array;
      width: number;
      height: number;
    }>();
    expectTypeOf(pdqModule.computePdqHash).returns.toEqualTypeOf<{ hash: string; quality: number }>();
  });

  it("produces the same fingerprint for a fixed synthetic image (golden value)", () => {
    const width = 120;
    const height = 90;
    const { hash, quality } = pdqModule.computePdqHash({ data: patternRgba(42, width, height), width, height });
    // Stored as 32-bit words, not a hex literal, so no 64-hex string sits in the repo.
    const words = Array.from({ length: 8 }, (_, i) => parseInt(hash.slice(i * 8, i * 8 + 8), 16));
    expect(words).toEqual(GOLDEN_WORDS);
    expect(quality).toBe(GOLDEN_QUALITY);
  });
});

const GOLDEN_WORDS: number[] = [
  3494376487, 1625925560, 478177222, 4207909070, 924939289, 1665275422, 3464232991, 4193114761,
];
const GOLDEN_QUALITY = 100;
