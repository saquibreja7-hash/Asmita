import { describe, expect, it } from "vitest";
import { SEXTORTION_ADVICE_IDS, sextortionAdvice, type SextortionAdviceId } from "@/lib/lab/sextortion/advice";
import { SEXTORTION_STAGES, type SextortionStage } from "@/lib/lab/sextortion/taxonomy";

// WP117 (docs/research/research-tools-spec.md, Track D): the stage-chosen
// advice ids — the non-blaming line leads, every stage maps to a list, and
// nothing is shown when nothing was detected.

describe("sextortionAdvice", () => {
  it("shows nothing when nothing was detected", () => {
    expect(sextortionAdvice({ stage: null, flagged: false, detectedSomething: false })).toEqual([]);
  });

  it("always leads with 'This is not your fault' when advice exists", () => {
    for (const stage of SEXTORTION_STAGES) {
      const advice = sextortionAdvice({ stage, flagged: true, detectedSomething: true });
      expect(advice[0], stage).toBe("notYourFault");
    }
    const general = sextortionAdvice({ stage: null, flagged: false, detectedSomething: true });
    expect(general[0]).toBe("notYourFault");
  });

  it("maps every stage to a non-empty list of known ids", () => {
    for (const stage of SEXTORTION_STAGES) {
      const advice = sextortionAdvice({ stage, flagged: true, detectedSomething: true });
      expect(advice.length, stage).toBeGreaterThan(2);
      for (const id of advice) expect(SEXTORTION_ADVICE_IDS).toContain(id);
    }
  });

  it("gives the impersonated-authority stage the police/CBI line", () => {
    const stage = "impersonated_authority" as SextortionStage;
    expect(sextortionAdvice({ stage, flagged: true, detectedSomething: true })).toContain("authority");
    // A payment-stage flag never claims fake police.
    expect(sextortionAdvice({ stage: "payment", flagged: true, detectedSomething: true })).not.toContain("authority");
  });

  it("always includes reporting and Asmita's takedown help for a flagged message", () => {
    for (const stage of SEXTORTION_STAGES) {
      const advice = sextortionAdvice({ stage, flagged: true, detectedSomething: true }) as SextortionAdviceId[];
      expect(advice, stage).toContain("report");
      expect(advice, stage).toContain("takedown");
    }
  });

  it("answers a detection without a flag with the general advice", () => {
    expect(sextortionAdvice({ stage: null, flagged: false, detectedSomething: true })).toContain("noPay");
    expect(sextortionAdvice({ stage: "threat", flagged: false, detectedSomething: true })).toEqual(
      sextortionAdvice({ stage: null, flagged: false, detectedSomething: true }),
    );
  });
});
