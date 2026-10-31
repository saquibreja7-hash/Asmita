export type FeedbackRecord = {
  id: string;
  caseReference?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
};

export const feedbackRecords: FeedbackRecord[] = [];

// Feedback is for service experience only. Reject links before persistence so
// pasted case URLs cannot enter a secondary, unprotected data store.
export function containsUrlLikeText(value: string) {
  return /(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/(?:\S*)|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|in|co|io|me|site|xyz)\b)/i.test(value);
}

export function recordFeedback(input: Omit<FeedbackRecord, "id" | "createdAt">) {
  if (containsUrlLikeText(input.comment ?? "") || containsUrlLikeText(input.caseReference ?? "")) {
    throw new Error("feedback_url_not_allowed");
  }
  const record: FeedbackRecord = {
    ...input,
    id: crypto.randomUUID(),
    comment: input.comment?.slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  feedbackRecords.push(record);
  return record;
}

export function summarizeFeedback(records = feedbackRecords) {
  const count = records.length;
  const averageRating = count
    ? Number((records.reduce((sum, item) => sum + item.rating, 0) / count).toFixed(2))
    : 0;
  return { count, averageRating };
}
