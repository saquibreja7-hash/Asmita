import type { NextActionKind } from "@/lib/admin-cases";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function nextActionLabel(kind: NextActionKind, count: number) {
  switch (kind) {
    case "review_links":
      return `Review ${plural(count, "link")}`;
    case "review_fingerprints":
      return `Review ${plural(count, "fingerprint")}`;
    case "send_notice":
      return count === 1 ? "Send notice" : `Send ${count} notices`;
    case "blocked_legal_review":
      return "Blocked: legal review";
    case "blocked_contact":
      return "Blocked: no verified contact";
    case "blocked_escalation":
      return "Blocked: escalation step";
    case "awaiting_reply":
      return "Awaiting platform reply";
    case "waiting_on_survivor":
      return "Waiting on survivor";
    default:
      return "Nothing to do";
  }
}

export const NEXT_ACTION_FILTER_LABELS: Record<NextActionKind, string> = {
  review_links: "Review links",
  review_fingerprints: "Review fingerprints",
  send_notice: "Send notice",
  blocked_legal_review: "Blocked: legal review",
  blocked_contact: "Blocked: no verified contact",
  blocked_escalation: "Blocked: escalation step",
  awaiting_reply: "Awaiting platform reply",
  waiting_on_survivor: "Waiting on survivor",
  none: "Nothing to do",
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIALLY_RESOLVED: "Partly resolved",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const LINK_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Needs review",
  NOTICE_QUEUED: "Approved",
  NOTICE_SENT: "Notice sent",
  ESCALATED: "Escalated",
  REMOVED: "Removed",
  UNRESOLVED: "Unresolved",
  REJECTED: "Rejected",
};

export const LADDER_STEP_LABELS = ["Notice sent", "Platform deadline", "Cybercrime complaint", "GAC appeal"];

/** "3h 10m", "2d 4h", "45m". */
export function shortDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

/**
 * The due time as words. For the operator's own actions a past time is
 * overdue; for a platform's deadline it has passed.
 */
export function dueText(kind: NextActionKind, dueAt: Date | null, now: Date) {
  if (!dueAt) return { text: "-", overdue: false };
  const diff = dueAt.getTime() - now.getTime();
  if (kind === "awaiting_reply") {
    return diff < 0
      ? { text: `Deadline passed ${shortDuration(-diff)} ago`, overdue: true }
      : { text: `Deadline in ${shortDuration(diff)}`, overdue: false };
  }
  return diff < 0
    ? { text: `Overdue by ${shortDuration(-diff)}`, overdue: true }
    : { text: `Due in ${shortDuration(diff)}`, overdue: false };
}

export function formatIst(value: string | Date) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Why the hourly sweep could not send a ladder step (escalation-engine.ts). */
export const LADDER_BLOCK_LABELS: Record<string, string> = {
  no_template: "The original notice has no template to resend.",
  template_not_legal_reviewed: "The notice template is not legally reviewed.",
  no_verified_recipient: "The platform has no human-verified contact.",
  follow_up_cover_not_legal_reviewed: "The follow-up letter is not legally reviewed.",
  follow_up_cover_missing: "There is no follow-up letter template.",
  user_missing: "The survivor's account no longer exists.",
  email_decrypt_failed: "The survivor's email address could not be read.",
};

export const REPLY_LABELS: Record<string, string> = {
  ACKNOWLEDGED: "Acknowledged",
  REMOVED: "Removed",
  REJECTED: "Refused",
  NO_RESPONSE: "No response",
};
