import { describe, expect, it } from "vitest";
import { normaliseMessage, romaniseDevanagari } from "@/lib/lab/sextortion/normalise";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the normaliser and
 * the deterministic Devanagari romanisation. All example text is invented.
 */

function views(text: string) {
  return normaliseMessage(text);
}

describe("sextortion normalisation", () => {
  it("composes to Unicode NFC so lookalike decompositions match", () => {
    // क + ़ composes to the single code point क़.
    const composed = views("\u0958\u0930\u093E\u091C");
    const decomposed = views("\u0915\u093C\u0930\u093E\u091C");
    expect(composed).toEqual(decomposed);
    // A Latin example: e + combining acute composes to é.
    expect(views("cafe\u0301").normalised).toBe("café");
  });

  it("strips zero-width and invisible characters between letters", () => {
    expect(views("vi\u200Bral kar du\u2060nga").normalised).toBe("viral kar dunga");
    expect(views("\uFEFFpaise bhejo").normalised).toBe("paise bhejo");
    expect(views("kya\u00AD hua").normalised).toBe("kya hua");
    expect(views("\u202A\u202Cवीडियो").normalised).toBe("वीडियो");
  });

  it("folds look-alike letters to their ASCII meaning", () => {
    // Cyrillic o, e, a, p, c, x look like Latin letters.
    expect(views("vide\u043E").normalised).toBe("video");
    expect(views("vid\u0435o").normalised).toBe("video");
    expect(views("\u0430apna").normalised).toBe("aapna");
    expect(views("cyber \u0441ell").normalised).toBe("cyber cell");
    expect(views("\u0440rocess").normalised).toBe("process");
    // The fullwidth block folds and lowercases in one pass.
    expect(views("\uFF36\uFF49\uFF52\uFF41\uFF4C").normalised).toBe("viral");
    // Devanagari digits become ASCII digits.
    expect(views("\u0968\u0968 \u0968\u096B\u0966").normalised).toBe("22 250");
  });

  it("lowercases Latin but never rewrites Devanagari", () => {
    const result = views("SEND MONEY अभी");
    expect(result.normalised).toBe("send money अभी");
  });

  it("collapses runs of three or more letters to two, never digits", () => {
    expect(views("plzzzz bhai").normalised).toBe("plzz bhai");
    expect(views("kya huaaaa").normalised).toBe("kya huaa");
    expect(views("okkkkk").normalised).toBe("okk");
    // Devanagari matra runs collapse too.
    expect(views("कााार").normalised).toBe("काार");
    // Amounts and dates are never collapsed.
    expect(views("50000 rupaye").normalised).toBe("50000 rupaye");
    expect(views("24 ghante").normalised).toBe("24 ghante");
  });

  it("maps digits to letters only inside words, only where unambiguous", () => {
    expect(views("p4ise bhejo").normalised).toBe("paise bhejo");
    expect(views("l0an").normalised).toBe("loan");
    expect(views("pl3ase").normalised).toBe("please");
    expect(views("5end it now").normalised).toBe("5end it now"); // edge digits stay
    expect(views("v1ral").normalised).toBe("v1ral"); // 1 is ambiguous (i/l)
    expect(views("24 ghante").normalised).toBe("24 ghante"); // pure-digit tokens stay
    // A 98XXXXXX00-style placeholder: its letter run collapses like any
    // other, but its digits stay digits.
    expect(views("98xxxxxx00").normalised).toBe("98xx00");
    expect(views("b4").normalised).toBe("b4"); // token-edge digit stays
  });

  it("squeezes whitespace and trims", () => {
    expect(views("  paise   bhejo\twarna sabko  bhej dunga ").normalised).toBe(
      "paise bhejo warna sabko bhej dunga",
    );
  });

  it("keeps both feature views: original script cleaned, and a latin view", () => {
    const mixed = "Video वायरल कर दूंगा";
    const result = views(mixed);
    expect(result.normalised).toBe("video वायरल कर दूंगा");
    expect(result.romanised).toBe("video vaayarala kara duungaa");
  });

  it("is deterministic and safe on edge inputs", () => {
    expect(views("paise bhejo")).toEqual(views("paise bhejo"));
    expect(views("")).toEqual({ normalised: "", romanised: "" });
    expect(views("   ")).toEqual({ normalised: "", romanised: "" });
    expect(views("1234 !?,.").normalised).toBe("1234 !?,.");
  });
});

describe("sextortion romanisation", () => {
  it("romanises through the fixed ITRANS-like table, one character at a time", () => {
    expect(romaniseDevanagari("करना")).toBe("karanaa");
    expect(romaniseDevanagari("वीडियो")).toBe("viidiyo");
    expect(romaniseDevanagari("थानेदार")).toBe("thaanedaara");
    expect(romaniseDevanagari("वायरल")).toBe("vaayarala");
    expect(romaniseDevanagari("नमस्ते")).toBe("namaste");
    expect(romaniseDevanagari("गिरफ़्तारी")).toBe("giraftaarii");
  });

  it("emits an implicit a unless a vowel sign or virama follows the consonant", () => {
    expect(romaniseDevanagari("क")).toBe("ka");
    expect(romaniseDevanagari("क्")).toBe("k");
    expect(romaniseDevanagari("की")).toBe("kii");
  });

  it("maps danda to a period and Devanagari digits to ASCII digits", () => {
    expect(romaniseDevanagari("वायरल कर दूंगा।")).toBe("vaayarala kara duungaa.");
    expect(romaniseDevanagari("५००००")).toBe("50000");
  });

  it("passes Latin text through unchanged, so code-mixed messages keep their words", () => {
    expect(romaniseDevanagari("video call करो")).toBe("video call karo");
    expect(romaniseDevanagari("98xxxxxx00")).toBe("98xxxxxx00");
  });
});
