import { summarizeDeliverability } from "@/lib/deliverability-monitor";
import type { DeliveryEvent } from "@/lib/webhook-events";

export type BetaCaseMetric = {
  caseId: string;
  registeredAt: string;
};

export type BetaNoticeMetric = {
  caseId: string;
  noticeSentAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  removedAt?: string;
  legalPackageRequestedAt?: string;
};

export type BetaFeedbackMetric = {
  rating: number;
};

export type BetaSchedulerMetric = {
  expectedRuns: number;
  completedRuns: number;
  duplicateRuns: number;
  lagMinutes: number;
};

export type BetaMetrics = {
  totalCases: number;
  noticesSent: number;
  noticeDeliverySuccessRate: number;
  acknowledgmentRate: number;
  removalWithin72hRate: number;
  medianRegistrationToNoticeHours: number | null;
  legalPackageRequests: number;
  victimFeedbackCount: number;
  averageVictimFeedbackRating: number;
  emailBounceRate: number;
  emailComplaintRate: number;
  emailDeliverabilityHealthy: boolean;
  schedulerCorrectnessRate: number;
  schedulerHealthy: boolean;
};

export function calculateBetaMetrics(input: {
  cases: BetaCaseMetric[];
  notices: BetaNoticeMetric[];
  feedback: BetaFeedbackMetric[];
  deliveryEvents: DeliveryEvent[];
  scheduler: BetaSchedulerMetric;
}): BetaMetrics {
  const sentNotices = input.notices.filter((notice) => notice.noticeSentAt);
  const delivered = sentNotices.filter((notice) => notice.deliveredAt).length;
  const acknowledged = sentNotices.filter((notice) => notice.acknowledgedAt).length;
  const removedWithin72h = sentNotices.filter((notice) => {
    if (!notice.noticeSentAt || !notice.removedAt) return false;
    return Date.parse(notice.removedAt) - Date.parse(notice.noticeSentAt) <= 72 * 60 * 60_000;
  }).length;
  const caseRegistration = new Map(input.cases.map((record) => [record.caseId, record.registeredAt]));
  const noticeLeadTimes = sentNotices
    .map((notice) => {
      const registeredAt = caseRegistration.get(notice.caseId);
      if (!registeredAt || !notice.noticeSentAt) return null;
      return Math.max(0, (Date.parse(notice.noticeSentAt) - Date.parse(registeredAt)) / 3_600_000);
    })
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const feedbackCount = input.feedback.length;
  const deliverability = summarizeDeliverability(input.deliveryEvents);
  const completedExpectedRuns = Math.min(input.scheduler.completedRuns, input.scheduler.expectedRuns);

  return {
    totalCases: input.cases.length,
    noticesSent: sentNotices.length,
    noticeDeliverySuccessRate: rate(delivered, sentNotices.length),
    acknowledgmentRate: rate(acknowledged, sentNotices.length),
    removalWithin72hRate: rate(removedWithin72h, sentNotices.length),
    medianRegistrationToNoticeHours: median(noticeLeadTimes),
    legalPackageRequests: input.notices.filter((notice) => notice.legalPackageRequestedAt).length,
    victimFeedbackCount: feedbackCount,
    averageVictimFeedbackRating: feedbackCount
      ? Number((input.feedback.reduce((sum, item) => sum + item.rating, 0) / feedbackCount).toFixed(2))
      : 0,
    emailBounceRate: deliverability.bounceRate,
    emailComplaintRate: deliverability.complaintRate,
    emailDeliverabilityHealthy: deliverability.healthy,
    schedulerCorrectnessRate: rate(completedExpectedRuns - input.scheduler.duplicateRuns, input.scheduler.expectedRuns),
    schedulerHealthy: input.scheduler.lagMinutes <= 30 && input.scheduler.duplicateRuns === 0,
  };
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((Math.max(0, numerator) / denominator).toFixed(2));
}

function median(values: number[]) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  const value = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
  return Number(value.toFixed(2));
}
