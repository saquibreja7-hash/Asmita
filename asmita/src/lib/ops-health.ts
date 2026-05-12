export type OpsMetrics = {
  noticeDispatchP95Minutes?: number;
  noticeBounceRate?: number;
  escalationQueueItemsOlderThan4h?: number;
  humanReviewOldestAgeHours?: number;
  otpDeliveryFailureRate?: number;
  api5xxRate5m?: number;
  schedulerLagMinutes?: number;
  deletionJobBacklog?: number;
};

export type OpsAlertKey =
  | "notice_dispatch_latency"
  | "notice_bounce_rate"
  | "escalation_queue_backlog"
  | "human_review_sla"
  | "otp_delivery_failure"
  | "api_5xx_rate"
  | "scheduler_lag"
  | "deletion_backlog";

export function evaluateOpsHealth(metrics: OpsMetrics) {
  const alerts: Array<{ key: OpsAlertKey; threshold: string; value: number }> = [];

  if ((metrics.noticeDispatchP95Minutes ?? 0) > 120) {
    alerts.push({ key: "notice_dispatch_latency", threshold: ">120m", value: metrics.noticeDispatchP95Minutes! });
  }
  if ((metrics.noticeBounceRate ?? 0) > 0.05) {
    alerts.push({ key: "notice_bounce_rate", threshold: ">5%", value: metrics.noticeBounceRate! });
  }
  if ((metrics.escalationQueueItemsOlderThan4h ?? 0) > 10) {
    alerts.push({
      key: "escalation_queue_backlog",
      threshold: ">10 older than 4h",
      value: metrics.escalationQueueItemsOlderThan4h!,
    });
  }
  if ((metrics.humanReviewOldestAgeHours ?? 0) > 4) {
    alerts.push({ key: "human_review_sla", threshold: ">4h", value: metrics.humanReviewOldestAgeHours! });
  }
  if ((metrics.otpDeliveryFailureRate ?? 0) > 0.02) {
    alerts.push({ key: "otp_delivery_failure", threshold: ">2%", value: metrics.otpDeliveryFailureRate! });
  }
  if ((metrics.api5xxRate5m ?? 0) > 0.01) {
    alerts.push({ key: "api_5xx_rate", threshold: ">1% over 5m", value: metrics.api5xxRate5m! });
  }
  if ((metrics.schedulerLagMinutes ?? 0) > 30) {
    alerts.push({ key: "scheduler_lag", threshold: ">30m", value: metrics.schedulerLagMinutes! });
  }
  if ((metrics.deletionJobBacklog ?? 0) > 0) {
    alerts.push({ key: "deletion_backlog", threshold: "0 overdue jobs", value: metrics.deletionJobBacklog! });
  }

  return { healthy: alerts.length === 0, alerts };
}
