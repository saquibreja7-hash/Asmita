import {
  MESSAGE_CHECK_PATTERN_IDS,
  type MessageCheckPatternId,
} from "@/lib/lab/message-check/patterns";
import { SEXTORTION_LABELS, type SextortionLabel } from "@/lib/lab/sextortion/taxonomy";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): which detected
 * elements the message-check results card shows, when both the WP93 rule
 * engine and the WP117 classifier have run.
 *
 * One element, one sentence: when the classifier labels an element, the
 * short label sentence says it ("A deadline."), and the rule that covers
 * the same ground is not shown again next to it. A rule whose element the
 * model missed keeps its own (longer, explanatory) sentence — the two
 * engines are deliberately overlapping, and the union is what the person
 * sees. cryptoGiftCard and foreignNumber have no label counterpart, so they
 * always show when they fire.
 *
 * Both inputs stay intact elsewhere (the API returns every rule match);
 * this mapping only decides the displayed list.
 */

/** Which labels cover the same element as each rule, so a rule is dropped exactly when a label already says it. */
export const RULE_COVERED_BY: Record<MessageCheckPatternId, readonly SextortionLabel[]> = {
  paymentDemand: ["DEMAND_MONEY", "LOAN_RECOVERY", "REPEAT_DEMAND"],
  deadline: ["DEADLINE"],
  threatContacts: ["THREAT_EXPOSE", "AUDIENCE_FAMILY", "AUDIENCE_PUBLIC"],
  intimateClaim: ["CLAIM_HAS_MEDIA", "MORPHING"],
  moreImages: ["DEMAND_SEXUAL", "DEMAND_THIRD_PARTY"],
  impersonation: ["AUTHORITY_IMPERSONATION", "PLATFORM_IMPERSONATION"],
  cryptoGiftCard: [],
  foreignNumber: [],
};

/** The labels that have a "What we noticed" sentence. NOT_THREAT is never shown; MINOR_SIGNAL routes instead. */
export const ELEMENT_LABELS: readonly SextortionLabel[] = SEXTORTION_LABELS.filter(
  (label) => label !== "NOT_THREAT" && label !== "MINOR_SIGNAL",
);

export interface DetectedElements {
  /** Labels to show, canonical order. */
  labels: SextortionLabel[];
  /** Rule ids to show, canonical order (only those no label already covers). */
  rules: MessageCheckPatternId[];
}

/**
 * The displayed element lists, both in canonical order. A rule is hidden
 * only when at least one of the labels that cover its element fired; label
 * sentences always come from the classifier, rule sentences are the WP93
 * originals.
 */
export function detectedElements(
  matches: readonly MessageCheckPatternId[],
  labels: readonly SextortionLabel[],
): DetectedElements {
  const present = new Set(labels);
  const fired = new Set(matches);
  return {
    labels: ELEMENT_LABELS.filter((label) => present.has(label)),
    rules: MESSAGE_CHECK_PATTERN_IDS.filter(
      (id) => fired.has(id) && !RULE_COVERED_BY[id].some((label) => present.has(label)),
    ),
  };
}

/**
 * Does a displayed result count as a finding — the "matches patterns we
 * often see in sextortion" headline and its advice? Yes when the
 * classifier's combination rule flagged the message, or when any element
 * other than VICTIM_PLEA is on the list. A victim's plea on its own is the
 * person's own words, never a warning sign about someone else's message.
 */
export function countsAsFinding(elements: DetectedElements, flagged: boolean): boolean {
  if (flagged) return true;
  if (elements.rules.length > 0) return true;
  return elements.labels.some((label) => label !== "VICTIM_PLEA");
}
