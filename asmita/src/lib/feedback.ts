export type FeedbackRecord = {
  id: string;
  caseReference?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
};

export const feedbackRecords: FeedbackRecord[] = [];

export function recordFeedback(input: Omit<FeedbackRecord, "id" | "createdAt">) {
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
