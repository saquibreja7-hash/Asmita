import { describe, expect, it } from "vitest";
import { normaliseMessage } from "@/lib/lab/sextortion/normalise";
import {
  LEXICON_LABELS,
  lexiconHits,
  SEXTORTION_LEXICON,
  type LexiconEntry,
  type LexiconLabel,
  type LexiconScript,
  type LexiconSource,
} from "@/lib/lab/sextortion/lexicon";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the lexicon, per
 * label, with the documented patterns of docs/research/2026-11-sources.md §D
 * each covered, and every entry carrying either a source id from that file or
 * the "derived" tag. All example text below is invented.
 */

const SOURCE_IDS = [
  "aljazeera-2022",
  "theprint-2022-mewat",
  "patrika-2023-sirohi",
  "tribune-2025",
  "fpj-2023-cbi",
  "amarujala-2025-bhopal",
  "amarujala-2026-agra",
  "amarujala-2025-gorakhpur",
  "quint-2025-loanapp",
  "lokmat-loanapp",
  "dh-loanapp",
  "aajtak-2025",
] as const;

function entries(label: LexiconLabel, script?: LexiconScript) {
  return SEXTORTION_LEXICON[label].filter((entry) => !script || entry.script === script);
}

function hasTerm(label: LexiconLabel, termText: string, script: LexiconScript) {
  return SEXTORTION_LEXICON[label].some((entry) => entry.term === termText && entry.script === script);
}

describe("sextortion lexicon structure", () => {
  it("covers every label except NOT_THREAT, in canonical order", () => {
    expect(LEXICON_LABELS).not.toContain("NOT_THREAT");
    // Every label except NOT_THREAT, and nothing else.
    expect(LEXICON_LABELS).toHaveLength(15);
  });

  it("gives every label at least one term in each of the three script views", () => {
    for (const label of LEXICON_LABELS) {
      expect(entries(label, "devanagari").length).toBeGreaterThan(0);
      expect(entries(label, "romanised").length).toBeGreaterThan(0);
      expect(entries(label, "english").length).toBeGreaterThan(0);
    }
  });

  it("keeps every term well-formed: lowercase latin, trimmed, no URLs, no numbers, long enough", () => {
    for (const label of LEXICON_LABELS) {
      for (const entry of SEXTORTION_LEXICON[label]) {
        expect(entry.term.length).toBeGreaterThanOrEqual(3);
        expect(entry.term).toBe(entry.term.trim());
        if (entry.script !== "devanagari") {
          expect(entry.term).toBe(entry.term.toLowerCase());
        }
        // Deadline terms may carry a number ("24 ghante"); phone-like digit
        // runs and addresses never appear.
        expect(entry.term).not.toMatch(/[0-9]{4,}/);
        expect(entry.term).not.toMatch(/https?:|www\.|\.com|\.in\b|@/);
      }
    }
  });

  it("has no duplicate terms within a label", () => {
    for (const label of LEXICON_LABELS) {
      const keys = SEXTORTION_LEXICON[label].map((entry) => `${entry.script}:${entry.term}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("tags every entry with a valid source id or derived", () => {
    for (const label of LEXICON_LABELS) {
      for (const entry of SEXTORTION_LEXICON[label]) {
        expect(entry.source === "derived" || (SOURCE_IDS as readonly string[]).includes(entry.source)).toBe(true);
      }
    }
  });

  it("tags every romanised entry derived: no verbatim romanised threat text exists in the sources", () => {
    for (const label of LEXICON_LABELS) {
      for (const entry of entries(label, "romanised")) {
        expect(entry.source).toBe("derived");
      }
    }
  });

  it("carries the source id on the Devanagari phrases the sources file quotes", () => {
    const quoted: [string, LexiconLabel, LexiconSource][] = [
      ["थानेदार", "AUTHORITY_IMPERSONATION", "patrika-2023-sirohi"],
      ["यूट्यूब मैनेजर", "PLATFORM_IMPERSONATION", "patrika-2023-sirohi"],
      ["अलग-अलग किश्तों में", "DEMAND_MONEY", "patrika-2023-sirohi"],
      ["वायरल करने की धमकी", "THREAT_EXPOSE", "patrika-2023-sirohi"],
      ["अकेले मिलने आओ", "DEMAND_SEXUAL", "amarujala-2025-bhopal"],
      ["वीडियो डिलीट कर दूंगा", "DEMAND_SEXUAL", "amarujala-2025-bhopal"],
      ["अपनी भाभी को मेरे पास लेकर आओ", "DEMAND_THIRD_PARTY", "amarujala-2026-agra"],
      ["वायरल कर दूंगा", "THREAT_EXPOSE", "amarujala-2026-agra"],
      ["सोशल मीडिया पर", "AUDIENCE_PUBLIC", "amarujala-2026-agra"],
      ["वीडियो वायरल मत करना", "VICTIM_PLEA", "amarujala-2025-gorakhpur"],
      ["भाई प्लीज", "VICTIM_PLEA", "amarujala-2025-gorakhpur"],
    ];
    for (const [termText, label, source] of quoted) {
      const entry = SEXTORTION_LEXICON[label].find((candidate: LexiconEntry) => candidate.term === termText);
      expect(entry, `${label}: ${termText}`).toBeDefined();
      if (entry) expect(entry.source).toBe(source);
    }
  });
});

describe("sextortion lexicon covers every documented pattern", () => {
  // The §D background's modus operandi, one row per documented pattern: the
  // pattern must have lexicon terms in at least two script views.
  const PATTERNS: [string, LexiconLabel][] = [
    ["threat to publish the recording", "THREAT_EXPOSE"],
    ["sent to family, relatives, contacts, groups", "AUDIENCE_FAMILY"],
    ["made viral on social media or YouTube", "AUDIENCE_PUBLIC"],
    ["payment demanded by UPI or bank transfer", "DEMAND_MONEY"],
    ["payment demanded in instalments", "DEMAND_MONEY"],
    ["24-hour deadline pressure", "DEADLINE"],
    ["half-hour deadline pressure", "DEADLINE"],
    ["meet alone to have it deleted", "DEMAND_SEXUAL"],
    ["demand for more photos or a video call", "DEMAND_SEXUAL"],
    ["bring another person along", "DEMAND_THIRD_PARTY"],
    ["police, crime branch, thanedar, CBI, FIR, arrest", "AUTHORITY_IMPERSONATION"],
    ["YouTube manager / platform team delete fee", "PLATFORM_IMPERSONATION"],
    ["loan-app recovery agent with morphed photos", "LOAN_RECOVERY"],
    ["claim of having the recording or clip", "CLAIM_HAS_MEDIA"],
    ["AI-morphed or edited photos", "MORPHING"],
    ["repeat demands from a new number", "REPEAT_DEMAND"],
    ["victim's own plea not to make it viral", "VICTIM_PLEA"],
    ["a stated age or school context under 18", "MINOR_SIGNAL"],
  ];

  it("has every pattern covered in at least two scripts", () => {
    for (const [pattern, label] of PATTERNS) {
      const scripts = new Set(SEXTORTION_LEXICON[label].map((entry) => entry.script));
      expect(scripts.size, `${label} (${pattern})`).toBeGreaterThanOrEqual(2);
    }
  });

  it("includes the spec's own romanised examples, all tagged derived", () => {
    const specExamples: [string, LexiconLabel][] = [
      ["viral kar dunga", "THREAT_EXPOSE"],
      ["viral kar doonga", "THREAT_EXPOSE"],
      ["viral kar denge", "THREAT_EXPOSE"],
      ["gharwalon", "AUDIENCE_FAMILY"],
      ["paise bhejo", "DEMAND_MONEY"],
      ["paise bhej", "DEMAND_MONEY"],
      ["upi kar", "DEMAND_MONEY"],
      ["24 ghante", "DEADLINE"],
      ["video delete kar dunga", "DEMAND_SEXUAL"],
      ["thanedar", "AUTHORITY_IMPERSONATION"],
      ["fir ho jayegi", "AUTHORITY_IMPERSONATION"],
    ];
    for (const [termText, label] of specExamples) {
      expect(hasTerm(label, termText, "romanised"), `${label}: ${termText}`).toBe(true);
    }
  });
});

describe("sextortion lexicon matching", () => {
  function hits(text: string) {
    return new Set(lexiconHits(normaliseMessage(text)));
  }

  it("finds each script's terms in that script's view of the same message", () => {
    const romanised = "paise bhejo warna video viral kar dunga";
    expect(hits(romanised)).toEqual(new Set(["DEMAND_MONEY", "THREAT_EXPOSE"]));

    const devanagari = "मेरे पास तुम्हारा वीडियो है, सोशल मीडिया पर वायरल कर दूंगा।";
    expect(hits(devanagari)).toEqual(new Set(["CLAIM_HAS_MEDIA", "AUDIENCE_PUBLIC", "THREAT_EXPOSE"]));

    const english = "I have your video and I will upload it on social media.";
    expect(hits(english)).toEqual(new Set(["CLAIM_HAS_MEDIA", "THREAT_EXPOSE", "AUDIENCE_PUBLIC"]));
  });

  it("finds documented single patterns", () => {
    expect(hits("bhai please, video viral mat karna").has("VICTIM_PLEA")).toBe(true);
    expect(hits("akela milne aao, video delete kar dunga").has("DEMAND_SEXUAL")).toBe(true);
    expect(hits("apni bhabhi ko mere paas le kar aao").has("DEMAND_THIRD_PARTY")).toBe(true);
    expect(hits("loan ki kisht baaki hai, photo edit karke contacts ko bhej dunga").has("LOAN_RECOVERY")).toBe(true);
    expect(hits("main class 9 me padhti hoon").has("MINOR_SIGNAL")).toBe(true);
  });

  it("does not hit on everyday text that shares no term", () => {
    expect(hits("the wedding album came out lovely, shall I bring sweets tomorrow?")).toEqual(new Set());
    expect(hits("team meeting moved to 5 pm, please be on time")).toEqual(new Set());
  });
});
