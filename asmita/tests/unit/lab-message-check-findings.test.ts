import { describe, expect, it } from "vitest";
import { backedFindings } from "@/lib/lab/message-check/findings";
import { countsAsFinding, detectedElements } from "@/lib/lab/message-check/elements";
import { checkMessagePatterns } from "@/lib/lab/message-check/patterns";
import { classifySextortion } from "@/lib/lab/sextortion/classify";
import { sextortionAdvice } from "@/lib/lab/sextortion/advice";

// PR #114 review: a classifier label alone is never reported on the message
// check page. It needs the combination-rule flag, a lexicon term for the
// same label, or a WP93 rule for the same element, and VICTIM_PLEA on its
// own is never a finding. All text is invented.

// The everyday messages the review found the committed model labelling on
// its own (also in tools/lab-sextortion/eval/negatives.jsonl, shortChat).
const SHORT_HARMLESS = [
  "hi",
  "hi there",
  "good morning",
  "Abhi aata hoon",
  "Hi! Are we still on for lunch tomorrow?",
  "ok",
  "hii",
  "Delhi",
  "Please call me back",
];

function pipeline(text: string) {
  const classification = classifySextortion(text);
  const matches = checkMessagePatterns(text);
  const findings = backedFindings({ text, labels: classification.labels, flagged: classification.flagged, matches });
  const advice = sextortionAdvice({ stage: null, flagged: classification.flagged, detectedSomething: findings.finding });
  const elements = detectedElements(matches, findings.labels);
  return { classification, matches, findings, advice, elements };
}

describe("short harmless text shows no finding", () => {
  it("the raw model does label some of them (the reason this filter exists)", () => {
    const raw = SHORT_HARMLESS.flatMap((text) => classifySextortion(text).labels);
    expect(raw.length).toBeGreaterThan(0);
  });

  it.each(SHORT_HARMLESS)("%j: not flagged, no displayed element, no headline, no advice", (text) => {
    const { classification, findings, advice, elements } = pipeline(text);
    expect(classification.flagged).toBe(false);
    expect(classification.labels).not.toContain("MINOR_SIGNAL");
    expect(findings).toEqual({ labels: [], finding: false });
    expect(elements).toEqual({ labels: [], rules: [] });
    expect(countsAsFinding(elements, classification.flagged)).toBe(false);
    expect(advice).toEqual([]);
  });
});

describe("backedFindings", () => {
  it("keeps every element label when the combination rule flagged", () => {
    const text = "i have the recording of your video call. transfer 50000 rupees within 24 hours or i will make it viral on social media.";
    const classification = classifySextortion(text);
    expect(classification.flagged).toBe(true);
    const findings = backedFindings({ text, labels: classification.labels, flagged: true, matches: checkMessagePatterns(text) });
    expect(findings.finding).toBe(true);
    expect(findings.labels).toEqual(classification.labels.filter((label) => label !== "MINOR_SIGNAL"));
  });

  it("drops an unflagged label with no lexicon term and no rule behind it", () => {
    expect(backedFindings({ text: "hi", labels: ["DEADLINE"], flagged: false, matches: [] })).toEqual({
      labels: [],
      finding: false,
    });
  });

  it("keeps an unflagged label backed by a lexicon term for the same label", () => {
    const findings = backedFindings({ text: "I will make it viral", labels: ["THREAT_EXPOSE"], flagged: false, matches: [] });
    expect(findings).toEqual({ labels: ["THREAT_EXPOSE"], finding: true });
  });

  it("keeps an unflagged label backed by a WP93 rule for the same element, and only that one", () => {
    const findings = backedFindings({ text: "x", labels: ["DEADLINE", "DEMAND_MONEY"], flagged: false, matches: ["deadline"] });
    expect(findings).toEqual({ labels: ["DEADLINE"], finding: true });
  });

  it("never counts VICTIM_PLEA alone, even with its own lexicon term", () => {
    const findings = backedFindings({ text: "bhai please", labels: ["VICTIM_PLEA"], flagged: false, matches: [] });
    expect(findings).toEqual({ labels: [], finding: false });
  });

  it("shows a lexicon-backed VICTIM_PLEA next to another real finding", () => {
    const findings = backedFindings({ text: "bhai please", labels: ["VICTIM_PLEA"], flagged: false, matches: ["paymentDemand"] });
    expect(findings).toEqual({ labels: ["VICTIM_PLEA"], finding: true });
  });

  it("never reports MINOR_SIGNAL or NOT_THREAT (minor routing happens before, in the route)", () => {
    const findings = backedFindings({ text: "i am 15", labels: ["MINOR_SIGNAL", "NOT_THREAT"], flagged: true, matches: [] });
    expect(findings.labels).toEqual([]);
  });
});

describe("countsAsFinding", () => {
  it("is true for the flag, a rule, or a label other than VICTIM_PLEA", () => {
    expect(countsAsFinding({ labels: [], rules: [] }, true)).toBe(true);
    expect(countsAsFinding({ labels: [], rules: ["deadline"] }, false)).toBe(true);
    expect(countsAsFinding({ labels: ["DEADLINE"], rules: [] }, false)).toBe(true);
    expect(countsAsFinding({ labels: ["VICTIM_PLEA"], rules: [] }, false)).toBe(false);
    expect(countsAsFinding({ labels: [], rules: [] }, false)).toBe(false);
  });
});
