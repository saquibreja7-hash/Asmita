// The escalation ladder a survivor sees under each link: where the request
// stands, what comes next and when. Pure, so the dashboard, emails and tests
// all agree. The automated platform follow-ups live in escalation-engine.ts.
// Plan: docs/product/escalation-ladder.md

/** Hours a platform has to remove the content: the 24 hours the signed notice
 *  demands under Rule 3(2)(b) (prisma/template-seeds.ts). PRD Section 4 notes
 *  the February 2026 amendment shortened this to 2 hours; change it here only
 *  together with the reviewed notice templates, so the ladder never contradicts
 *  what the survivor signed. */
export const PLATFORM_DEADLINE_HOURS = 24;
/** Days the grievance officer has to resolve a complaint (7 since the February
 *  2026 amendment, PRD Section 4). After that, or after a refusal, the survivor
 *  can appeal to the Grievance Appellate Committee. */
export const GRIEVANCE_RESOLUTION_DAYS = 7;

export type LadderStepKey = "sent" | "deadline" | "complaint" | "appeal";
export type LadderStepState = "done" | "current" | "upcoming";

export type LadderStep = { key: LadderStepKey; state: LadderStepState; at: Date | null };

export type LadderInput = {
  /** When Asmita sent the notice, or the survivor filed the platform's form. */
  startedAt: Date | null;
  /** SubmittedUrl.status */
  status: string;
  /** Notice.responseType, if the platform answered. */
  responseType?: string | null;
  responseAt?: Date | null;
  now: Date;
};

export type Ladder = {
  /** The link is removed: nothing more to do. */
  finished: boolean;
  /** A cybercrime.gov.in complaint is suggested. */
  complaintOpen: boolean;
  /** An appeal to the Grievance Appellate Committee is open. */
  appealOpen: boolean;
  rejected: boolean;
  steps: LadderStep[];
};

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export function buildLadder(input: LadderInput): Ladder | null {
  // Nothing has gone to the platform yet: no ladder to show.
  if (!input.startedAt) return null;
  const start = input.startedAt.getTime();
  const now = input.now.getTime();
  const deadline = new Date(start + PLATFORM_DEADLINE_HOURS * HOUR);

  const finished = input.status === "REMOVED";
  // Only the platform's answer counts: SubmittedUrl REJECTED means Asmita's own
  // reviewer turned the link down, and such a link never reaches a platform.
  const rejected = input.responseType === "REJECTED";
  const rejectedAt = rejected ? (input.responseAt ?? input.now) : null;

  // A refusal opens both steps at once; otherwise they wait for the clocks.
  const complaintAt = rejectedAt ?? deadline;
  const appealAt = rejectedAt ?? new Date(start + GRIEVANCE_RESOLUTION_DAYS * DAY);
  const complaintOpen = !finished && now >= complaintAt.getTime();
  const appealOpen = !finished && now >= appealAt.getTime();

  const deadlineReached = rejected || now >= deadline.getTime();
  const reached = [true, deadlineReached, complaintOpen, appealOpen];
  // The current step is the furthest one reached; earlier ones are done.
  const current = finished ? -1 : reached.lastIndexOf(true);
  const keys: LadderStepKey[] = ["sent", "deadline", "complaint", "appeal"];
  const at = [input.startedAt, deadline, complaintAt, appealAt];

  const steps: LadderStep[] = keys.map((key, i) => ({
    key,
    at: at[i],
    state: !reached[i] && !(finished && i === 0) ? "upcoming" : i === current ? "current" : "done",
  }));

  return { finished, complaintOpen, appealOpen, rejected, steps };
}
