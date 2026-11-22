import { describe, expect, it } from "vitest";
import { detectedElements, ELEMENT_LABELS } from "@/lib/lab/message-check/elements";
import { MESSAGE_CHECK_PATTERN_IDS, type MessageCheckPatternId } from "@/lib/lab/message-check/patterns";
import { SEXTORTION_LABELS } from "@/lib/lab/sextortion/taxonomy";

// WP117 (docs/research/research-tools-spec.md, Track D): the results card's
// element mapping — one sentence per element, the classifier's labels
// preferred, WP93 rules shown for the elements the model missed.

describe("detectedElements", () => {
  it("never surfaces MINOR_SIGNAL or NOT_THREAT as elements", () => {
    expect(ELEMENT_LABELS).not.toContain("MINOR_SIGNAL");
    expect(ELEMENT_LABELS).not.toContain("NOT_THREAT");
    const elements = detectedElements([], ["MINOR_SIGNAL", "NOT_THREAT"]);
    expect(elements.labels).toEqual([]);
  });

  it("shows labels in canonical order and hides rules their element already covers", () => {
    const elements = detectedElements(["deadline", "paymentDemand", "threatContacts"], [
      "THREAT_EXPOSE",
      "DEMAND_MONEY",
    ]);
    // paymentDemand and threatContacts are covered by DEMAND_MONEY /
    // THREAT_EXPOSE and hidden; the deadline rule has no DEADLINE label to
    // cover it, so its sentence still shows.
    expect(elements.rules).toEqual(["deadline"]);
    expect(elements.labels).toEqual(["THREAT_EXPOSE", "DEMAND_MONEY"]);
  });

  it("keeps a rule whose element the model missed", () => {
    const elements = detectedElements(["deadline", "impersonation"], ["DEMAND_MONEY"]);
    expect(elements.labels).toEqual(["DEMAND_MONEY"]);
    expect(elements.rules).toEqual(["deadline", "impersonation"]);
  });

  it("always shows crypto and foreign-number rules, which no label covers", () => {
    const elements = detectedElements(["cryptoGiftCard", "foreignNumber"], ["THREAT_EXPOSE", "DEMAND_MONEY"]);
    expect(elements.rules).toEqual(["cryptoGiftCard", "foreignNumber"]);
  });

  it("returns rule ids in canonical order whatever the input order", () => {
    const reversed = [...MESSAGE_CHECK_PATTERN_IDS].reverse() as MessageCheckPatternId[];
    const elements = detectedElements(reversed, []);
    expect(elements.rules).toEqual([...MESSAGE_CHECK_PATTERN_IDS]);
  });

  it("orders labels canonically whatever the input order", () => {
    const allLabels = [...ELEMENT_LABELS].reverse();
    const elements = detectedElements([], allLabels);
    expect(elements.labels).toEqual(ELEMENT_LABELS.filter((label) => allLabels.includes(label)));
    expect(elements.labels.length).toBe(SEXTORTION_LABELS.length - 2);
  });

  it("every label sentence key exists in i18n for both locales", async () => {
    const en = (await import("@/i18n/en.json")).default as Record<string, string>;
    const hi = (await import("@/i18n/hi.json")).default as Record<string, string>;
    for (const label of ELEMENT_LABELS) {
      expect(en[`lab.message-check.label.${label}`], label).toBeTruthy();
      expect(hi[`lab.message-check.label.${label}`], label).toBeTruthy();
    }
  });
});
