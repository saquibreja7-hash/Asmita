import type { SextortionStage } from "./taxonomy";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): stage-chosen advice
 * ids for the message-check results card.
 *
 * The stage (taxonomy.ts, inferStage) is ONLY a selector for this advice —
 * it is never shown, and no advice sentence states a stage. The wording is
 * non-blaming throughout: "This is not your fault" leads every list, per the
 * spec and eSafety's language guidance (docs/research/2026-11-sources.md §D).
 *
 * The ids are stable (the page maps them to i18n keys
 * lab.message-check.advice.<id>); only new ones may be added.
 */

export const SEXTORTION_ADVICE_IDS = [
  "notYourFault",
  "noPay",
  "noMore",
  "noCalls",
  "keepEvidence",
  "block",
  "authority",
  "report",
  "takedown",
] as const;

export type SextortionAdviceId = (typeof SEXTORTION_ADVICE_IDS)[number];

/*
 * Which advice each stage needs, in reading order. Later rungs subsume
 * earlier advice (someone being asked to pay still needs "do not take video
 * calls from unknown numbers"), so each list repeats what still applies.
 */
const STAGE_ADVICE: Record<SextortionStage, readonly SextortionAdviceId[]> = {
  // A capture-stage message: media is being sought, nothing demanded yet.
  contact: ["notYourFault", "noMore", "noCalls", "keepEvidence", "report", "takedown"],
  capture: ["notYourFault", "noMore", "noCalls", "keepEvidence", "report", "takedown"],
  // The threat is live: do not pay, do not send more, keep everything.
  threat: ["notYourFault", "noPay", "noMore", "keepEvidence", "block", "report", "takedown"],
  // Money is being demanded against a clock.
  payment: ["notYourFault", "noPay", "noMore", "keepEvidence", "block", "report", "takedown"],
  // They were paid once and are back: paying again never ends it.
  repeat: ["notYourFault", "noPay", "keepEvidence", "block", "report", "takedown"],
  // Fake police / platform officers: the authority line is the antidote.
  impersonated_authority: ["notYourFault", "noPay", "authority", "keepEvidence", "report", "takedown"],
};

// Elements without a flag (a rule fired, or a label that alone never flags):
// the general threat-stage advice answers "what do I do" without claiming
// the message is sextortion.
const GENERAL_ADVICE: readonly SextortionAdviceId[] = [
  "notYourFault",
  "noPay",
  "noMore",
  "keepEvidence",
  "report",
  "takedown",
];

/**
 * The advice ids for a result. Empty when nothing at all was detected: the
 * page then shows only the fixed "no common pattern matched" copy and its
 * standing next-steps section.
 */
export function sextortionAdvice(input: {
  stage: SextortionStage | null;
  flagged: boolean;
  detectedSomething: boolean;
}): SextortionAdviceId[] {
  if (input.flagged) return [...(STAGE_ADVICE[input.stage ?? "threat"] ?? GENERAL_ADVICE)];
  if (input.detectedSomething) return [...GENERAL_ADVICE];
  return [];
}
