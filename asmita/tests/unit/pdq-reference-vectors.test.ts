import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decode } from "jpeg-js";
import { describe, expect, it } from "vitest";
import { computePdqHash, hammingDistance } from "@/lib/pdq/pdq";

// Rollout gate #1 (see ncii-india-system-design.md §10): the TS PDQ port must
// match Meta's reference implementation on the official regression vectors
// from github.com/facebook/ThreatExchange (pdq/data/reg-test-input/dih,
// expected hashes from pdq/cpp/reg_test/expected/out).
//
// The reference hashes were produced by the C++ tool reading JPEGs through
// libjpeg. We decode through jpeg-js, whose IDCT rounding differs slightly,
// so a few bits of variance per image is decoder noise, not algorithm error.
// The gate allows hamming distance <= 2 per image — far inside PDQ's own
// match threshold of 31.

const FIXTURES = join(__dirname, "..", "fixtures", "pdq");
const MAX_DISTANCE = 2;

const REFERENCE_VECTORS: Array<{ file: string; hash: string; quality: number }> = [
  {
    file: "bridge-1-original.jpg",
    hash: "d8f8f0cee0f4a84f0637022a078f67f0b36e2ed596621e1d33e6339c4e9c9b22",
    quality: 100,
  },
  {
    file: "bridge-2-rotate-90.jpg",
    hash: "30a10efdf1c83f429013d48d0ffffc52e34e0e35ada952a9d29605215aa9e5af",
    quality: 100,
  },
  {
    file: "bridge-3-rotate-180.jpg",
    hash: "2dad5a64b1a142e7d362a09857da895ae63b8c7fc23794b766b319361fc93188",
    quality: 100,
  },
  {
    file: "bridge-4-rotate-270.jpg",
    hash: "a5f0a457248995e8c9065c275aaa5498b61ba4bdf8fcf80387c32f8b5bfc4f05",
    quality: 100,
  },
  {
    file: "bridge-5-flipx.jpg",
    hash: "d8f80f33e0f417b20e37f5cd028f980fb36ed02a9662c1e233e64c634e9c64dd",
    quality: 100,
  },
  {
    file: "bridge-6-flipy.jpg",
    hash: "2da9259bb1a1bd1a5362576552da32a5e63b7380c2774b4866b346c91b89ce77",
    quality: 100,
  },
  {
    file: "bridge-7-flip-plus-1.jpg",
    hash: "f0a1e10271ccc0bd90530b720fff038de34ef1e8ada9a956d6967ade5ea91a50",
    quality: 100,
  },
  {
    file: "bridge-8-flip-minus-1.jpg",
    hash: "2df05aa8a4896a17c14682da5aaaab07b61b5b42f8fc07fc87c3d0741bfcb0fa",
    quality: 100,
  },
];

function loadImage(file: string) {
  const jpegData = readFileSync(join(FIXTURES, file));
  const decoded = decode(jpegData, { useTArray: true, formatAsRGBA: true });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

describe("PDQ reference vectors (Meta ThreatExchange regression corpus)", () => {
  for (const vector of REFERENCE_VECTORS) {
    it(`matches reference hash for ${vector.file}`, () => {
      const result = computePdqHash(loadImage(vector.file));
      const distance = hammingDistance(result.hash, vector.hash);
      expect(
        distance,
        `hamming distance ${distance} for ${vector.file}: got ${result.hash}, expected ${vector.hash}`,
      ).toBeLessThanOrEqual(MAX_DISTANCE);
      expect(result.quality).toBe(vector.quality);
    });
  }
});
