/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the message-level
 * taxonomy for the Indian sextortion message classifier.
 *
 * This file is pure data and pure functions: no I/O, no network, nothing
 * stored. The classifier (WP117) learns these labels one-vs-rest, and the
 * message-check integration surfaces them as plain sentences. The taxonomy is
 * documented for humans in asmita/docs/lab/sextortion-taxonomy.md; the two
 * must stay in sync.
 *
 * Labels are multi-label by design: a real sextortion message usually carries
 * several (a threat, an audience, a demand, a deadline). NOT_THREAT marks the
 * message-level answer for harmless text; a row that carries any other label
 * never carries NOT_THREAT.
 *
 * Nothing here is a verdict on a person or a case. A label means "this
 * message shows this pattern"; the advice chosen from a stage says what the
 * documented cases suggest doing next.
 */

/** The 16 message-level labels, in canonical order. The order is stable: dataset rows store labels in this order. */
export const SEXTORTION_LABELS = [
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
] as const;

export type SextortionLabel = (typeof SEXTORTION_LABELS)[number];

/**
 * The stage ladder from the documented Indian modus operandi
 * (docs/research/2026-11-sources.md §D): an unknown "profile" makes contact,
 * a video call is captured, the threat to expose follows, money is demanded,
 * demands repeat from new numbers, and finally a fake authority extracts
 * more. A stage is inferred from labels ONLY to choose advice copy
 * (WP117); it is never shown as a verdict.
 */
export const SEXTORTION_STAGES = [
  "contact",
  "capture",
  "threat",
  "payment",
  "repeat",
  "impersonated_authority",
] as const;

export type SextortionStage = (typeof SEXTORTION_STAGES)[number];

/*
 * Which rung of the ladder a label evidences, if any. A message's inferred
 * stage is the furthest rung any label supports, because advice for a later
 * rung subsumes earlier advice (someone already being asked to pay still
 * needs the "do not take video calls from unknown numbers" advice).
 *
 * - DEMAND_SEXUAL / DEMAND_THIRD_PARTY / CLAIM_HAS_MEDIA / MORPHING evidence
 *   capture: media exists or is being sought (a recording claimed, a video
 *   call pushed for, another person to capture, a morphed photo claimed).
 * - THREAT_EXPOSE, its audiences, a loan-recovery threat and a victim's own
 *   plea (which presumes a live threat) evidence the threat rung.
 * - DEMAND_MONEY and DEADLINE evidence payment: money is being extracted
 *   against a clock.
 * - REPEAT_DEMAND evidences repeat.
 * - Authority and platform impersonation evidence the last rung.
 *
 * "contact" is the ladder's first rung but is never inferred: a bare
 * approach message ("hi, friendship karegi?") carries no label at all, so
 * there is nothing to advise on beyond the page's fixed copy. MINOR_SIGNAL
 * and NOT_THREAT evidence no rung: a stated age or a harmless message picks
 * no stage-specific advice, and a minor is routed to /minor-support first
 * (WP117) whatever the stage would say.
 */
const LABEL_STAGE: Readonly<Partial<Record<SextortionLabel, SextortionStage>>> = {
  DEMAND_SEXUAL: "capture",
  DEMAND_THIRD_PARTY: "capture",
  CLAIM_HAS_MEDIA: "capture",
  MORPHING: "capture",
  THREAT_EXPOSE: "threat",
  AUDIENCE_FAMILY: "threat",
  AUDIENCE_PUBLIC: "threat",
  LOAN_RECOVERY: "threat",
  VICTIM_PLEA: "threat",
  DEMAND_MONEY: "payment",
  DEADLINE: "payment",
  REPEAT_DEMAND: "repeat",
  AUTHORITY_IMPERSONATION: "impersonated_authority",
  PLATFORM_IMPERSONATION: "impersonated_authority",
};

/**
 * The furthest stage the labels evidence, in ladder order, or null when no
 * label evidences any rung (empty labels, NOT_THREAT, MINOR_SIGNAL alone).
 * Deterministic and order-independent.
 */
export function inferStage(labels: readonly SextortionLabel[]): SextortionStage | null {
  let best: SextortionStage | null = null;
  for (const label of labels) {
    const stage = LABEL_STAGE[label];
    if (!stage) continue;
    if (best === null || SEXTORTION_STAGES.indexOf(stage) > SEXTORTION_STAGES.indexOf(best)) best = stage;
  }
  return best;
}

/*
 * Label groups, used by the WP116 generator to count positives and negatives
 * and by WP117's combination rule ("a single keyword is never enough"):
 *
 * - CORE labels are what makes a message a likely sextortion threat.
 * - SUPPORTING labels are the demand/audience/deadline/impersonation
 *   pressure that the combination rule requires alongside a core label.
 * - CONTEXT labels never flag a message alone but shape the advice and the
 *   "What we noticed" sentences.
 * A dataset row is a generator positive when it has any label other than
 * NOT_THREAT; WP117's stricter flag rule (core + supporting above
 * thresholds) is computed from these same groups.
 */
export const SEXTORTION_CORE_LABELS = ["THREAT_EXPOSE", "CLAIM_HAS_MEDIA"] as const;
export const SEXTORTION_SUPPORTING_LABELS = [
  "DEMAND_MONEY",
  "DEMAND_SEXUAL",
  "DEMAND_THIRD_PARTY",
  "AUDIENCE_FAMILY",
  "AUDIENCE_PUBLIC",
  "DEADLINE",
  "AUTHORITY_IMPERSONATION",
  "PLATFORM_IMPERSONATION",
  "LOAN_RECOVERY",
  "REPEAT_DEMAND",
] as const;
export const SEXTORTION_CONTEXT_LABELS = ["MORPHING", "VICTIM_PLEA", "MINOR_SIGNAL"] as const;

/** Type guard for values read from JSONL dataset rows and eval files. */
export function isSextortionLabel(value: unknown): value is SextortionLabel {
  return typeof value === "string" && (SEXTORTION_LABELS as readonly string[]).includes(value);
}

/** Labels in canonical order, de-duplicated, unknown values dropped. */
export function sortSextortionLabels(labels: readonly string[]): SextortionLabel[] {
  const known = new Set(labels.filter(isSextortionLabel));
  return SEXTORTION_LABELS.filter((label) => known.has(label));
}

/**
 * Is this row of generated or eval data a generator "positive"? Yes when any
 * label other than NOT_THREAT is present (a sextortion-pattern message,
 * including victim pleas and capture-stage openers). Negatives carry only
 * NOT_THREAT, optionally with MINOR_SIGNAL (a minor mention in harmless
 * text, so the model learns that a stated age alone is not a threat).
 */
export function isPositiveRow(labels: readonly SextortionLabel[]): boolean {
  return labels.some((label) => label !== "NOT_THREAT" && label !== "MINOR_SIGNAL");
}
