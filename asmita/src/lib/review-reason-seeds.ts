/*
 * The review console's seeded internal reasons (review-console-spec.md,
 * WP142), one source for prisma/seed.ts and the library's on-demand
 * ensureSystemReviewReasons(), so the two can never drift.
 *
 * Like review-queue-seeds.ts, this module is deliberately dependency-free:
 * prisma/seed.ts imports it through tsx, which must not pull in the app's
 * path aliases.
 *
 * Nothing here is survivor data: plain, factual reason labels. The spec seeds
 * "findings reject" reasons under the findings queue's reject-kind decision,
 * which the findings adapter calls "dismiss" (Dismiss finding).
 *
 * The code "other" is the spec's "Other (explain)": decideJob requires a
 * note for it (review-reasons.ts).
 */

export type SystemReviewReasonSeed = {
  queueKey: string;
  /** The adapter decision code the reason belongs to. */
  decision: string;
  /** Stable machine code, stored on ReviewDecision.reasonCode. */
  code: string;
  label: string;
  sortOrder: number;
};

export const SYSTEM_REVIEW_REASONS: readonly SystemReviewReasonSeed[] = [
  // Flagged links, reject.
  { queueKey: "links", decision: "reject", code: "not_reported_content", label: "Not a link to the reported content", sortOrder: 10 },
  { queueKey: "links", decision: "reject", code: "duplicate_link", label: "Duplicate of another link", sortOrder: 20 },
  { queueKey: "links", decision: "reject", code: "platform_not_covered", label: "Platform not covered", sortOrder: 30 },
  { queueKey: "links", decision: "reject", code: "survivor_withdrew", label: "Survivor asked to withdraw", sortOrder: 40 },
  { queueKey: "links", decision: "reject", code: "other", label: "Other (explain)", sortOrder: 50 },
  // Fingerprints, reject.
  { queueKey: "fingerprints", decision: "reject", code: "low_quality", label: "Low quality", sortOrder: 10 },
  { queueKey: "fingerprints", decision: "reject", code: "duplicate", label: "Duplicate", sortOrder: 20 },
  { queueKey: "fingerprints", decision: "reject", code: "survivor_withdrew", label: "Survivor asked to withdraw", sortOrder: 30 },
  { queueKey: "fingerprints", decision: "reject", code: "other", label: "Other (explain)", sortOrder: 40 },
  // Crawler findings, dismiss (the queue's reject-kind decision).
  { queueKey: "findings", decision: "dismiss", code: "not_same_image", label: "Not the same image", sortOrder: 10 },
  { queueKey: "findings", decision: "dismiss", code: "already_reported", label: "Already reported", sortOrder: 20 },
  { queueKey: "findings", decision: "dismiss", code: "outside_consent_scope", label: "Outside consent scope", sortOrder: 30 },
  { queueKey: "findings", decision: "dismiss", code: "other", label: "Other (explain)", sortOrder: 40 },
];

/**
 * The seeded reason whose label is "Other (explain)": it carries its
 * explanation in the reason note, which the server requires (WP142).
 */
export const REASON_OTHER_CODE = "other";

/**
 * Whether a reason code requires a note with it ("Other (explain)").
 * Defined here, dependency-free, because the decision panel's client-side
 * state rules need the same rule as the server's decideJob.
 */
export function reasonRequiresNote(code: string): boolean {
  return code === REASON_OTHER_CODE;
}
