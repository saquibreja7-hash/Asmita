import { db } from "@/lib/db";
import { encryptField } from "@/lib/encryption";
import { containsUrlLikeText } from "@/lib/url-like-text";

export type FeedbackRecord = {
  id: string;
  caseReference?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
};

// Local development and tests without a database keep feedback here.
export const feedbackRecords: FeedbackRecord[] = [];

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

// Feedback is for service experience only: links are rejected before storage
// (url-like-text.ts, shared with the chat, which runs in the browser too).
export { containsUrlLikeText };

/**
 * Stores one rating. In production it goes to the Feedback table (it used to
 * live only in the Worker's memory and was lost). The comment is free text a
 * survivor may put anything in, so it is encrypted at rest; the case
 * reference is kept as text and never linked to the case row.
 */
export async function recordFeedback(input: Omit<FeedbackRecord, "id" | "createdAt">): Promise<FeedbackRecord> {
  if (containsUrlLikeText(input.comment ?? "") || containsUrlLikeText(input.caseReference ?? "")) {
    throw new Error("feedback_url_not_allowed");
  }
  const comment = input.comment?.trim().slice(0, 1000) || undefined;
  if (devNoDb()) {
    const record: FeedbackRecord = {
      ...input,
      id: crypto.randomUUID(),
      comment,
      createdAt: new Date().toISOString(),
    };
    feedbackRecords.push(record);
    return record;
  }
  const saved = await db.feedback.create({
    data: {
      rating: input.rating,
      caseReference: input.caseReference ?? null,
      comment: comment ? encryptField(comment) : null,
    },
    select: { id: true, createdAt: true },
  });
  return { ...input, comment, id: saved.id, createdAt: saved.createdAt.toISOString() };
}

export function summarizeFeedback(records: Array<{ rating: number }> = feedbackRecords) {
  const count = records.length;
  const averageRating = count
    ? Number((records.reduce((sum, item) => sum + item.rating, 0) / count).toFixed(2))
    : 0;
  return { count, averageRating };
}

/** Every stored rating, for analytics. Never the comments. */
export async function listFeedbackRatings(): Promise<Array<{ rating: number }>> {
  if (devNoDb()) return feedbackRecords.map((record) => ({ rating: record.rating }));
  return db.feedback.findMany({ select: { rating: true } });
}
