import { describe, expect, it } from "vitest";
import {
  applyNoise,
  dropLetter,
  dropSpace,
  insertZeroWidth,
  letterToDigit,
  NOISE_OPS,
  repeatLetter,
  swapLetters,
} from "../src/noise.ts";
import { rngFromSeed } from "../src/rng.ts";

/*
 * The noise operators may only shuffle characters that are already in the
 * text — the closed-vocabulary argument depends on it.
 */

const WORDS = "paise bhejo warna video viral ho jayega";
const DEV = "वीडियो वायरल कर दूंगा घर वालों को";

describe("noise operators", () => {
  it("swapLetters only swaps two letters inside one word", () => {
    const out = swapLetters(WORDS, 0);
    // p and a swapped: "apise …" — same letters, same word boundaries.
    expect(out).toBe("apise bhejo warna video viral ho jayega");
    expect(out.split(" ").map((word) => word.length).sort()).toEqual(
      WORDS.split(" ").map((word) => word.length).sort(),
    );
    // Short words and punctuation positions are left alone.
    expect(swapLetters("ab cd", 0)).toBe("ab cd");
    expect(swapLetters("hi", 0)).toBe("hi");
  });

  it("dropLetter removes exactly one character from a long word", () => {
    expect(dropLetter("video bhejo", 1)).toBe("vdeo bhejo");
    expect(dropLetter("abcd abcd", 0)).toBe("bcd abcd");
    expect(dropLetter("abc abc", 0)).toBe("abc abc"); // too short to drop
  });

  it("repeatLetter triples one letter", () => {
    expect(repeatLetter("plz", 1)).toBe("plllz");
    expect(repeatLetter("ab cd", 4)).toBe("ab cddd");
  });

  it("letterToDigit replaces only inner letters with their unambiguous digit", () => {
    expect(letterToDigit("paise", 1)).toBe("p4ise");
    expect(letterToDigit("paise", 3)).toBe("pai5e");
    expect(letterToDigit("send", 0)).toBe("send"); // token edge stays
    expect(letterToDigit("send", 3)).toBe("send"); // token edge stays
    expect(letterToDigit("kya", 0)).toBe("kya"); // k has no digit
    expect(letterToDigit(DEV, 2)).toBe(DEV); // Devanagari untouched
  });

  it("dropSpace removes one space", () => {
    expect(dropSpace("kya hua")).toBe("kyahua");
    expect(dropSpace("kya")).toBe("kya");
  });

  it("insertZeroWidth hides a zero-width space inside a word", () => {
    const out = insertZeroWidth("viral", 2);
    expect(out.replace("\u200B", "")).toBe("viral");
    expect(out).toContain("\u200B");
    expect(insertZeroWidth("  ", 0)).toBe("  ");
  });

  it("applyNoise is deterministic and only mutates the given text", () => {
    const one = applyNoise(WORDS, rngFromSeed(5));
    const two = applyNoise(WORDS, rngFromSeed(5));
    expect(one).toBe(two);
    // Bounded character-level change: at most a couple of characters dropped
    // (dropLetter), a few repeated or one digit swapped in, plus possibly one
    // zero-width space. Nothing larger can enter.
    const length = one.replace("\u200B", "").length;
    expect(length).toBeGreaterThanOrEqual(WORDS.length - 2);
    expect(length).toBeLessThanOrEqual(WORDS.length + 4);
    expect(NOISE_OPS.length).toBe(6);
  });
});
