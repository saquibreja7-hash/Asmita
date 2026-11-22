/*
 * The review console's system queues (review-console-spec.md, WP140), in
 * sort order. One source for prisma/seed.ts and the library's on-demand
 * ensureSystemQueues(), so the two can never drift.
 *
 * This module is deliberately dependency-free: prisma/seed.ts imports it
 * through tsx, which must not pull in the app's path aliases.
 *
 * Nothing here is survivor data: keys, labels and one-line descriptions.
 */

export const SYSTEM_QUEUE_KINDS = [
  "FLAGGED_LINK",
  "FINGERPRINT",
  "FINDING",
  "PARTNER_APPLICATION",
  "LAB_REPORT",
] as const;

export type SystemQueueKind = (typeof SYSTEM_QUEUE_KINDS)[number];

export type SystemReviewQueueSeed = {
  /** Deterministic, so the memory store and the database agree. */
  id: string;
  key: string;
  name: string;
  description: string;
  /** Null = any kind: only the protected minor-hold queue. */
  subjectKind: SystemQueueKind | null;
  isDefault: boolean;
  protected: boolean;
  sortOrder: number;
  requireReasonOnReject: boolean;
  requireReasonOnApprove: boolean;
};

export const SYSTEM_REVIEW_QUEUES: readonly SystemReviewQueueSeed[] = [
  {
    id: "review-queue-links",
    key: "links",
    name: "Flagged links",
    description: "Links waiting for a human decision before a notice can be queued.",
    subjectKind: "FLAGGED_LINK",
    isDefault: true,
    protected: false,
    sortOrder: 10,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
  {
    id: "review-queue-fingerprints",
    key: "fingerprints",
    name: "Fingerprints",
    description: "Fingerprints pending review before a hash advisory can be sent.",
    subjectKind: "FINGERPRINT",
    isDefault: true,
    protected: false,
    sortOrder: 20,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
  {
    id: "review-queue-findings",
    key: "findings",
    name: "Crawler findings",
    description: "Crawler findings waiting for analyst review.",
    subjectKind: "FINDING",
    isDefault: true,
    protected: false,
    sortOrder: 30,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
  {
    id: "review-queue-partners",
    key: "partners",
    name: "Partner applications",
    description: "Platform partner applications waiting for a decision.",
    subjectKind: "PARTNER_APPLICATION",
    isDefault: true,
    protected: false,
    sortOrder: 40,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
  {
    id: "review-queue-lab-reports",
    key: "lab-reports",
    name: "Lab reports",
    description: "AI Lab abuse reports drafted and waiting to be sent.",
    subjectKind: "LAB_REPORT",
    isDefault: true,
    protected: false,
    sortOrder: 50,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
  {
    id: "review-queue-minor-hold",
    key: "minor-hold",
    name: "Possible minor",
    description:
      "Items labelled Possible minor. Only a SUPER_ADMIN sees this queue, and nothing here continues the adult flow.",
    subjectKind: null,
    isDefault: false,
    protected: true,
    sortOrder: 60,
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
  },
];

/** The protected queue's key, by its spec name. */
export const MINOR_HOLD_QUEUE_KEY = "minor-hold";
