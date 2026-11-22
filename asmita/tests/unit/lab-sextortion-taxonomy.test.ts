import { describe, expect, it } from "vitest";
import {
  inferStage,
  isPositiveRow,
  isSextortionLabel,
  sortSextortionLabels,
  SEXTORTION_CONTEXT_LABELS,
  SEXTORTION_CORE_LABELS,
  SEXTORTION_LABELS,
  SEXTORTION_STAGES,
  SEXTORTION_SUPPORTING_LABELS,
} from "@/lib/lab/sextortion/taxonomy";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the label taxonomy
 * and the stage inference. Everything here is invented text.
 */

describe("sextortion taxonomy labels", () => {
  it("lists the 16 labels in the spec's order", () => {
    expect(SEXTORTION_LABELS).toEqual([
      "THREAT_EXPOSE",
      "AUDIENCE_FAMILY",
      "AUDIENCE_PUBLIC",
      "DEMAND_MONEY",
      "DEMAND_SEXUAL",
      "DEMAND_THIRD_PARTY",
      "DEADLINE",
      "AUTHORITY_IMPERSONATION",
      "PLATFORM_IMPERSONATION",
      "LOAN_RECOVERY",
      "CLAIM_HAS_MEDIA",
      "MORPHING",
      "REPEAT_DEMAND",
      "VICTIM_PLEA",
      "MINOR_SIGNAL",
      "NOT_THREAT",
    ]);
  });

  it("has unique labels", () => {
    expect(new Set(SEXTORTION_LABELS).size).toBe(SEXTORTION_LABELS.length);
  });

  it("splits the labels into disjoint core, supporting and context groups", () => {
    const all = [...SEXTORTION_CORE_LABELS, ...SEXTORTION_SUPPORTING_LABELS, ...SEXTORTION_CONTEXT_LABELS, "NOT_THREAT"];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(SEXTORTION_LABELS));
  });
});

describe("sextortion stage inference", () => {
  it("lists the documented ladder in order", () => {
    expect(SEXTORTION_STAGES).toEqual([
      "contact",
      "capture",
      "threat",
      "payment",
      "repeat",
      "impersonated_authority",
    ]);
  });

  it("returns the furthest evidenced rung, whatever order the labels come in", () => {
    expect(inferStage([])).toBeNull();
    expect(inferStage(["NOT_THREAT"])).toBeNull();
    expect(inferStage(["MINOR_SIGNAL"])).toBeNull();
    expect(inferStage(["MINOR_SIGNAL", "NOT_THREAT"])).toBeNull();

    // Capture: media exists, is claimed, or is being sought.
    expect(inferStage(["CLAIM_HAS_MEDIA"])).toBe("capture");
    expect(inferStage(["DEMAND_SEXUAL"])).toBe("capture");
    expect(inferStage(["DEMAND_THIRD_PARTY"])).toBe("capture");
    expect(inferStage(["MORPHING"])).toBe("capture");

    // Threat: the expose threat, its audiences, a loan-recovery threat, a plea.
    expect(inferStage(["THREAT_EXPOSE"])).toBe("threat");
    expect(inferStage(["AUDIENCE_FAMILY"])).toBe("threat");
    expect(inferStage(["AUDIENCE_PUBLIC"])).toBe("threat");
    expect(inferStage(["LOAN_RECOVERY"])).toBe("threat");
    expect(inferStage(["VICTIM_PLEA"])).toBe("threat");

    // Payment: the money demand and the clock it runs on.
    expect(inferStage(["DEMAND_MONEY"])).toBe("payment");
    expect(inferStage(["DEADLINE"])).toBe("payment");

    expect(inferStage(["REPEAT_DEMAND"])).toBe("repeat");

    expect(inferStage(["AUTHORITY_IMPERSONATION"])).toBe("impersonated_authority");
    expect(inferStage(["PLATFORM_IMPERSONATION"])).toBe("impersonated_authority");

    // Later rungs win over earlier ones, and label order never matters.
    expect(inferStage(["THREAT_EXPOSE", "DEMAND_MONEY"])).toBe("payment");
    expect(inferStage(["DEMAND_MONEY", "THREAT_EXPOSE"])).toBe("payment");
    expect(inferStage(["THREAT_EXPOSE", "DEMAND_MONEY", "DEADLINE"])).toBe("payment");
    expect(inferStage(["CLAIM_HAS_MEDIA", "THREAT_EXPOSE", "REPEAT_DEMAND", "DEMAND_MONEY"])).toBe("repeat");
    expect(
      inferStage(["THREAT_EXPOSE", "DEMAND_MONEY", "AUTHORITY_IMPERSONATION", "MINOR_SIGNAL"]),
    ).toBe("impersonated_authority");
  });

  it("never turns a minor mention or a harmless message into stage advice", () => {
    // A stated age alone picks no stage: the minor pathway (WP117) runs first.
    expect(inferStage(["MINOR_SIGNAL", "VICTIM_PLEA"])).toBe("threat");
    expect(inferStage(["NOT_THREAT", "MINOR_SIGNAL"])).toBeNull();
  });
});

describe("sextortion label helpers", () => {
  it("isSextortionLabel accepts only the known labels", () => {
    expect(isSextortionLabel("THREAT_EXPOSE")).toBe(true);
    expect(isSextortionLabel("NOT_THREAT")).toBe(true);
    expect(isSextortionLabel("THREAT")).toBe(false);
    expect(isSextortionLabel("")).toBe(false);
    expect(isSextortionLabel(15)).toBe(false);
  });

  it("sortSextortionLabels drops unknown values and follows canonical order", () => {
    expect(sortSextortionLabels(["DEMAND_MONEY", "THREAT_EXPOSE", "bogus"])).toEqual([
      "THREAT_EXPOSE",
      "DEMAND_MONEY",
    ]);
    expect(sortSextortionLabels(["DEMAND_MONEY", "DEMAND_MONEY", "THREAT_EXPOSE"])).toEqual([
      "THREAT_EXPOSE",
      "DEMAND_MONEY",
    ]);
    expect(sortSextortionLabels([])).toEqual([]);
  });

  it("isPositiveRow: any label other than NOT_THREAT makes a generator positive", () => {
    expect(isPositiveRow(["THREAT_EXPOSE", "DEMAND_MONEY"])).toBe(true);
    expect(isPositiveRow(["VICTIM_PLEA"])).toBe(true);
    expect(isPositiveRow(["CLAIM_HAS_MEDIA"])).toBe(true);
    expect(isPositiveRow(["NOT_THREAT"])).toBe(false);
    // A stated age in harmless text stays negative: it is not a threat.
    expect(isPositiveRow(["MINOR_SIGNAL", "NOT_THREAT"])).toBe(false);
    expect(isPositiveRow(["MINOR_SIGNAL"])).toBe(false);
    expect(isPositiveRow([])).toBe(false);
  });
});
